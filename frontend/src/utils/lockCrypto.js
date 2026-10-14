/**
 * 비밀번호 잠금 공유 암호 모듈 (v1). 규격: docs/superpowers/specs/2026-10-13-password-lock-design.md
 *
 * - 비밀번호 → PBKDF2-SHA256(600,000회) → master → HKDF로 encKey(AES-GCM)·verifier 파생.
 *   서버에는 vh = SHA-256(verifier)만 저장되고, 해제할 때 verifier를 보내 해시를 비교한다.
 * - 파일마다 랜덤 DK(AES-GCM-256)와 np(4B)를 만든다. DK는 encKey로 감싸(wk) 서버 메타데이터에 둔다.
 * - 본문은 평문 1MiB 레코드 단위로 암호화한다. iv = np ‖ uint64BE(i),
 *   AAD = "cs-lock-v1" ‖ uint64BE(i) ‖ (마지막 레코드면 0x01, 아니면 0x00).
 *   마지막 표시를 AAD에 넣어 뒤를 잘라낸 파일이 정상으로 풀리지 않게 한다.
 * - 비밀번호와 키는 이 기기 밖으로 나가지 않는다. 브라우저 WebCrypto만 쓴다.
 */

export const LOCK_VERSION = 1
/** 평문 레코드 크기 */
export const RECORD_SIZE = 1024 * 1024
/** AES-GCM 인증 태그 */
export const TAG_SIZE = 16
/** 업로드 파트 하나에 들어가는 레코드 수 (평문 64MiB) */
export const RECORDS_PER_PART = 64
/** 암호문 파트 크기 = 64 × (1MiB + 16) — 서버 partSize와 같아야 한다 */
export const CT_PART_SIZE = RECORDS_PER_PART * (RECORD_SIZE + TAG_SIZE)
export const PBKDF2_ITERATIONS = 600000
/** 암호화된 파일명 평문 상한 (UTF-8 바이트) */
export const MAX_NAME_BYTES = 180

const enc = new TextEncoder()
const dec = new TextDecoder()
const INFO_ENC = enc.encode('cs-lock-v1/enc')
const INFO_VERIFY = enc.encode('cs-lock-v1/verify')
const AAD_KEY = enc.encode('cs-lock-v1/key')
const AAD_NAME = enc.encode('cs-lock-v1/name')
const AAD_RECORD_PREFIX = enc.encode('cs-lock-v1')

const subtle = () => globalThis.crypto.subtle

// === 인코딩 ===

/** 바이트 → base64url (패딩 없음) */
export function b64u(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url → 바이트 */
export function fromB64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))

// === 크기 계산 ===

/** 평문 크기에 대한 레코드 수 (pt ≥ 1) */
export const recordCount = (pt) => Math.ceil(pt / RECORD_SIZE)

/** 암호문 크기: ct = pt + 16 × ceil(pt / RS) */
export const ctSize = (pt) => pt + TAG_SIZE * recordCount(pt)

/** 암호문 파트 수 */
export const ctPartCount = (pt) => Math.ceil(recordCount(pt) / RECORDS_PER_PART)

// === 키 파생 ===

/**
 * 비밀번호와 salt로 encKey·verifier·vh를 만든다.
 * @param {string} password
 * @param {Uint8Array|string} [salt] 없으면 새로 만든다 (잠금 설정 1회당 1개). 문자열이면 base64url
 * @param {{iterations?: number}} [opts] 테스트에서만 반복 횟수를 줄인다
 * @returns {Promise<{salt: string, encKey: CryptoKey, verifier: string, vh: string}>}
 */
export async function deriveLock(password, salt, opts = {}) {
  const saltBytes = salt == null ? randomBytes(16) : typeof salt === 'string' ? fromB64u(salt) : salt
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS
  const pwKey = await subtle().importKey('raw', enc.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const master = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, pwKey, 256)
  const hkdf = await subtle().importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const empty = new Uint8Array(0)
  const encKey = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: empty, info: INFO_ENC },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  const verifierBits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: empty, info: INFO_VERIFY }, hkdf, 256)
  const vh = toHex(await subtle().digest('SHA-256', verifierBits))
  return { salt: b64u(saltBytes), encKey, verifier: b64u(verifierBits), vh }
}

// === 파일 키 ===

/** 파일마다 새 DK·np를 만든다 */
export async function createFileKey() {
  const dkRaw = randomBytes(32)
  const dk = await subtle().importKey('raw', dkRaw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { dk, dkRaw, np: randomBytes(4) }
}

/** DK를 encKey로 감싼다 → {wk, wkIv} (base64url, wk 48B) */
export async function wrapFileKey(encKey, dkRaw) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD_KEY }, encKey, dkRaw)
  return { wk: b64u(ct), wkIv: b64u(iv) }
}

/** 감싼 DK를 푼다. 비밀번호가 다르면 예외 */
export async function unwrapFileKey(encKey, wk, wkIv) {
  const raw = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(wkIv), additionalData: AAD_KEY }, encKey, fromB64u(wk))
  return importRawKey(new Uint8Array(raw))
}

/** 원시 DK 바이트 → CryptoKey */
export const importRawKey = (raw) => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])

/** 감싼 DK를 원시 바이트로 푼다 (서비스워커에 넘길 때 사용) */
export async function unwrapFileKeyRaw(encKey, wk, wkIv) {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(wkIv), additionalData: AAD_KEY }, encKey, fromB64u(wk)))
}

// === 파일명 ===

/**
 * 파일명을 UTF-8 180바이트 이하로 줄인다 (확장자는 남긴다, 글자 중간에서 자르지 않는다).
 */
export function clampFileName(name, maxBytes = MAX_NAME_BYTES) {
  const s = String(name || 'file').normalize('NFC')
  if (enc.encode(s).length <= maxBytes) return s
  const dot = s.lastIndexOf('.')
  let ext = dot > 0 ? s.slice(dot) : ''
  if (enc.encode(ext).length > 20) ext = ''
  const base = ext ? s.slice(0, dot) : s
  const budget = maxBytes - enc.encode(ext).length
  let out = ''
  let used = 0
  for (const ch of base) {
    const n = enc.encode(ch).length
    if (used + n > budget) break
    out += ch
    used += n
  }
  return out + ext
}

/** 파일명 암호화 → {en, enIv} */
export async function encryptName(dk, name) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD_NAME }, dk, enc.encode(clampFileName(name)))
  return { en: b64u(ct), enIv: b64u(iv) }
}

export async function decryptName(dk, en, enIv) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(enIv), additionalData: AAD_NAME }, dk, fromB64u(en))
  return dec.decode(pt)
}

// === 레코드 ===

function writeU64(view, offset, n) {
  view.setUint32(offset, Math.floor(n / 0x100000000))
  view.setUint32(offset + 4, n >>> 0)
}

/** 레코드 i의 iv (12B) */
export function recordIv(np, index) {
  const iv = new Uint8Array(12)
  iv.set(np, 0)
  writeU64(new DataView(iv.buffer), 4, index)
  return iv
}

/** 레코드 i의 AAD */
export function recordAad(index, isLast) {
  const aad = new Uint8Array(AAD_RECORD_PREFIX.length + 9)
  aad.set(AAD_RECORD_PREFIX, 0)
  const view = new DataView(aad.buffer)
  writeU64(view, AAD_RECORD_PREFIX.length, index)
  aad[aad.length - 1] = isLast ? 1 : 0
  return aad
}

export async function encryptRecord(dk, np, index, plain, isLast) {
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: recordIv(np, index), additionalData: recordAad(index, isLast) }, dk, plain)
  return new Uint8Array(ct)
}

export async function decryptRecord(dk, np, index, cipher, isLast) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: recordIv(np, index), additionalData: recordAad(index, isLast) }, dk, cipher)
  return new Uint8Array(pt)
}

const readSlice = async (blob, start, end) => {
  const part = blob.slice(start, end)
  return new Uint8Array(await part.arrayBuffer())
}

/**
 * 암호문 파트 하나(0부터 시작하는 partIndex)를 만든다. 레코드 단위로 읽어 평문 전체를 메모리에 올리지 않는다.
 * @param {CryptoKey} dk
 * @param {Uint8Array} np
 * @param {Blob} file 원본 파일
 * @param {number} partIndex
 * @param {{onRecord?: (plainBytes:number)=>void}} [opts] 레코드를 하나 잠글 때마다 그 평문 바이트 수를 알린다
 * @returns {Promise<Blob>}
 */
export async function encryptPart(dk, np, file, partIndex, opts = {}) {
  const pt = file.size
  const total = recordCount(pt)
  const first = partIndex * RECORDS_PER_PART
  const last = Math.min(total, first + RECORDS_PER_PART)
  if (first >= total) throw new RangeError('partIndex out of range')
  const chunks = []
  for (let i = first; i < last; i++) {
    const start = i * RECORD_SIZE
    const end = Math.min(pt, start + RECORD_SIZE)
    const plain = await readSlice(file, start, end)
    chunks.push(await encryptRecord(dk, np, i, plain, i === total - 1))
    opts.onRecord?.(end - start)
  }
  return new Blob(chunks, { type: 'application/octet-stream' })
}

/** 암호문 파트 하나의 바이트 수 */
export function ctPartLength(pt, partIndex) {
  const total = recordCount(pt)
  const first = partIndex * RECORDS_PER_PART
  const last = Math.min(total, first + RECORDS_PER_PART)
  let n = 0
  for (let i = first; i < last; i++) {
    n += Math.min(RECORD_SIZE, pt - i * RECORD_SIZE) + TAG_SIZE
  }
  return n
}

/**
 * 스트리밍 복호기. 암호문 바이트를 아무 크기로 넣으면 완성된 레코드부터 평문을 돌려준다.
 * finish()는 레코드가 정확히 다 들어왔는지 확인한다 (잘린 파일 거부).
 */
export function createDecryptor(dk, np, ptSize) {
  const total = recordCount(ptSize)
  let index = 0
  // 받은 조각을 모아 두었다가 레코드 하나 분량이 되면 한 번만 복사한다 (작은 조각이 많아도 선형 시간)
  let chunks = []
  let pending = 0
  const recLen = (i) => Math.min(RECORD_SIZE, ptSize - i * RECORD_SIZE) + TAG_SIZE

  const take = (n) => {
    const out = new Uint8Array(n)
    let o = 0
    while (o < n) {
      const c = chunks[0]
      const need = n - o
      if (c.length <= need) {
        out.set(c, o)
        o += c.length
        chunks.shift()
      } else {
        out.set(c.subarray(0, need), o)
        chunks[0] = c.subarray(need)
        o += need
      }
    }
    pending -= n
    return out
  }

  return {
    async push(chunk) {
      const out = []
      if (chunk && chunk.length) {
        chunks.push(chunk)
        pending += chunk.length
      }
      while (index < total && pending >= recLen(index)) {
        const n = recLen(index)
        out.push(await decryptRecord(dk, np, index, take(n), index === total - 1))
        index++
      }
      if (index >= total && pending > 0) throw new Error('LOCK_TRAILING_DATA')
      return out
    },
    finish() {
      if (index !== total || pending !== 0) throw new Error('LOCK_TRUNCATED')
    },
    get done() { return index >= total }
  }
}

/**
 * 파일 하나를 잠금 업로드용 메타데이터와 함께 준비한다.
 * @param {{encKey: CryptoKey, salt: string, vh: string}} lock deriveLock 결과
 * @param {File} file
 */
export async function prepareLockedFile(lock, file) {
  const { dk, dkRaw, np } = await createFileKey()
  const { wk, wkIv } = await wrapFileKey(lock.encKey, dkRaw)
  const { en, enIv } = await encryptName(dk, file.name)
  // 올린 기기만 아는 삭제 키. 서버에는 해시(dh)만 보내고, 키는 이 기기 메모리에만 둔다
  const deleteKeyBytes = randomBytes(32)
  const dh = toHex(await subtle().digest('SHA-256', deleteKeyBytes))
  return {
    dk,
    np,
    deleteKey: b64u(deleteKeyBytes),
    meta: { v: LOCK_VERSION, salt: lock.salt, vh: lock.vh, wk, wkIv, np: b64u(np), en, enIv, dh }
  }
}
