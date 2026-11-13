/**
 * 선택한 파일 여러 개를 어떻게 받을지 정한다.
 *
 * - 200MB 넘는 파일은 ZIP에서 빼고 하나씩(브라우저 다운로드 관리자: 백그라운드·이어받기) 받는다.
 * - 나머지는 선택 순서대로 묶음 한도(스트리밍 500MB, 메모리 방식 300MB)까지 ZIP 하나로 묶는다.
 * - 파일이 1개뿐인 묶음은 ZIP으로 만들지 않고 그냥 받는다.
 * - 크기를 모르는 파일(QR 받기 화면에서 크기 확인 실패)도 하나씩 받는다.
 * 설계서: docs/superpowers/specs/2026-11-13-multi-download-zip-design.md
 */

const MB = 1024 * 1024
export const BIG_FILE_BYTES = 200 * MB
export const ZIP_LIMIT_STREAM = 500 * MB
export const ZIP_LIMIT_MEMORY = 300 * MB

/** 크기를 모르면 null (ZIP에 넣지 않고 하나씩 받는다: 머리글·Content-Length를 미리 계산할 수 없다) */
const sizeOf = (file) => (Number.isFinite(file?.size) && file.size >= 0 ? file.size : null)

/**
 * @param {Array<{name:string,size:number,roomId?:string}>} files 선택 순서
 * @param {{ inMemory?: boolean }} [opts] inMemory: 서비스워커 스트리밍을 못 써서 메모리에 모아 저장하는 기기
 * @returns {{ items: Array<{type:'zip', files:Array, size:number} | {type:'file', file:Object, size:number}> }}
 */
export function planDownload(files, { inMemory = false } = {}) {
  const limit = inMemory ? ZIP_LIMIT_MEMORY : ZIP_LIMIT_STREAM
  const bundles = []
  const singles = []
  let current = null
  for (const file of files || []) {
    const size = sizeOf(file)
    if (size === null || size > BIG_FILE_BYTES) { singles.push({ type: 'file', file, size }); continue }
    if (!current || current.size + size > limit) {
      current = { type: 'zip', files: [], size: 0 }
      bundles.push(current)
    }
    current.files.push(file)
    current.size += size
  }
  const items = bundles.map((b) => (b.files.length === 1 ? { type: 'file', file: b.files[0], size: b.size } : b))
  return { items: [...items, ...singles] }
}

/** ZIP 안에 넣을 이름: 경로 문자·제어 문자를 지우고, 같은 이름은 "이름 (2).확장자"로 */
export function zipEntryNames(files) {
  const used = new Set()
  return files.map((file) => {
    let base = String(file?.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim()
    if (!base) base = 'file'
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`
    used.add(name.toLowerCase())
    return name
  })
}

/** clipboard-share-20261113-0915.zip (묶음이 여럿이면 -1, -2) */
export function zipFileName(date = new Date(), index = 0, count = 1) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return `clipboard-share-${stamp}${count > 1 ? `-${index + 1}` : ''}.zip`
}
