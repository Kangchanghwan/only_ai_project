/**
 * 비밀번호 잠금 업로드.
 *
 * 기존 멀티파트 업로더(multipartUploader.multipartUpload)를 그대로 쓰되
 * - 서버에는 암호문 크기(ctSize)의 "가상 파일"을 올린다고 알린다 (파트 경계 = 암호문 64레코드).
 * - 파트를 올리기 직전에 그 파트에 해당하는 평문 64MiB를 이 기기에서 잠근다.
 * - 이어올리기 저장(localStorage)은 하지 않는다 (접속 중 재시도는 그대로 된다).
 * 잠그는 진행률은 실제로 처리한 평문 바이트 기준이다 (연출용 지연 없음).
 */
import { multipartUpload, putPartXhr } from './multipartUploader.js'
import { r2Service } from './r2Service.js'
import { ctSize, CT_PART_SIZE, encryptPart, prepareLockedFile } from '../utils/lockCrypto.js'

/**
 * @param {string} roomId
 * @param {File} file
 * @param {{salt:string, encKey:CryptoKey, vh:string}} lock useLockState.getLock(scope)
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {()=>void} [opts.onCommit]
 * @param {(p:{encPercent:number, upPercent:number})=>void} [opts.onProgress]
 * @param {object} [opts.api] 테스트 주입 (기본: r2Service.lockedMultipartApi)
 * @param {Function} [opts.putPart] 테스트 주입 (기본: putPartXhr)
 * @returns {Promise<{id:string, size:number, ctSize:number}>}
 */
export async function lockedUpload(roomId, file, lock, opts = {}) {
  const pt = file.size
  const total = ctSize(pt)
  const { dk, np, meta } = await prepareLockedFile(lock, file)

  const baseApi = opts.api || r2Service.lockedMultipartApi
  let completed = null
  const api = {
    ...baseApi,
    create: async (rid, p) => {
      // 서버에는 평문 크기와 잠금 메타데이터(감싼 키·암호화된 파일명·vh)만 보낸다 (multipartUpload가 넘기는 원래 이름은 버린다)
      void p
      const created = await baseApi.create(rid, { size: pt, lock: meta })
      if (created.partSize !== CT_PART_SIZE) {
        // 파트 경계가 다르면 레코드가 파트 사이에 걸쳐 풀 수 없게 된다 → 시작하지 않는다
        try { await baseApi.abort(rid, { uploadId: created.uploadId, key: created.key, size: total }) } catch { /* ignore */ }
        throw Object.assign(new Error('Unexpected part size'), { code: 'LOCK_PART_SIZE', retryable: false })
      }
      return created
    },
    complete: async (rid, p) => {
      completed = await baseApi.complete(rid, p)
      // multipartUpload는 fileName/fileUrl/size를 읽는다 → 잠긴 파일은 id, URL 없음, 평문 크기
      return { ...completed, fileName: completed.id, fileUrl: null, size: completed.size ?? pt }
    }
  }

  const encByPart = new Map() // partIndex -> 잠근 평문 바이트
  let upPercent = 0
  const report = () => {
    let enc = 0
    for (const v of encByPart.values()) enc += v
    opts.onProgress?.({ encPercent: Math.min(100, Math.floor((enc / pt) * 100)), upPercent })
  }

  const sendPart = opts.putPart || putPartXhr
  // multipartUpload는 file.slice(start, end)의 결과를 putPart에 그대로 넘긴다 → 위치만 담아 두고 여기서 잠근다
  const virtualFile = {
    name: file.name,
    size: total,
    type: 'application/octet-stream',
    lastModified: file.lastModified,
    slice: (start, end) => ({ start, end })
  }
  const putPart = async (url, range, putOpts) => {
    const partIndex = Math.round(range.start / CT_PART_SIZE)
    encByPart.set(partIndex, 0)
    const blob = await encryptPart(dk, np, file, partIndex, {
      onRecord: (n) => {
        encByPart.set(partIndex, (encByPart.get(partIndex) || 0) + n)
        report()
      }
    })
    if (putOpts?.signal?.aborted) throw Object.assign(new Error('Upload canceled'), { code: 'UPLOAD_CANCELED' })
    return sendPart(url, blob, putOpts)
  }

  const res = await multipartUpload(roomId, virtualFile, {
    api,
    signal: opts.signal,
    onCommit: opts.onCommit,
    onProgress: (percent) => {
      upPercent = percent
      report()
    },
    deps: { putPart, storage: null }
  })

  return { id: res.fileName, size: completed?.size ?? pt, ctSize: completed?.ctSize ?? total, retries: res.retries, parts: res.parts }
}
