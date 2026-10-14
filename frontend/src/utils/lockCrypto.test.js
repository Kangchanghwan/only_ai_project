// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  b64u, fromB64u, ctSize, recordCount, ctPartCount, ctPartLength, CT_PART_SIZE, RECORD_SIZE, TAG_SIZE,
  deriveLock, createFileKey, wrapFileKey, unwrapFileKey, unwrapFileKeyRaw, importRawKey,
  encryptName, decryptName, clampFileName, encryptPart, createDecryptor, prepareLockedFile
} from './lockCrypto.js'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto
})

const FAST = { iterations: 1000 }

const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0

function patterned(n) {
  const u8 = new Uint8Array(n)
  for (let i = 0; i < n; i++) u8[i] = (i * 31 + 7) & 0xff
  return u8
}

async function encryptAll(dk, np, blob) {
  const parts = []
  for (let p = 0; p < ctPartCount(blob.size); p++) {
    parts.push(new Uint8Array(await (await encryptPart(dk, np, blob, p)).arrayBuffer()))
  }
  const total = parts.reduce((s, x) => s + x.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const x of parts) { out.set(x, o); o += x.length }
  return { out, parts }
}

async function decryptAll(dk, np, ct, ptSize, chunk = 777777) {
  const d = createDecryptor(dk, np, ptSize)
  const pieces = []
  for (let i = 0; i < ct.length; i += chunk) pieces.push(...(await d.push(ct.subarray(i, i + chunk))))
  d.finish()
  const out = new Uint8Array(pieces.reduce((s, x) => s + x.length, 0))
  let o = 0
  for (const x of pieces) { out.set(x, o); o += x.length }
  return out
}

describe('lockCrypto 인코딩·크기', () => {
  it('base64url 왕복', () => {
    const b = patterned(1000)
    expect(fromB64u(b64u(b))).toEqual(b)
    expect(b64u(new Uint8Array([251, 255]))).not.toMatch(/[+/=]/)
  })

  it('ctSize 공식 = pt + 16 × ceil(pt/RS)', () => {
    expect(ctSize(1)).toBe(17)
    expect(ctSize(RECORD_SIZE)).toBe(RECORD_SIZE + 16)
    expect(ctSize(RECORD_SIZE + 1)).toBe(RECORD_SIZE + 1 + 32)
    const fiveGB = 5 * 1024 ** 3
    expect(ctSize(fiveGB)).toBe(fiveGB + 16 * 5120)
    expect(recordCount(fiveGB)).toBe(5120)
  })

  it('파트 길이 합 = ctSize, 마지막 파트 외에는 CT_PART_SIZE', () => {
    for (const pt of [1, RECORD_SIZE * 64, RECORD_SIZE * 64 + 5, RECORD_SIZE * 200 + 123]) {
      const n = ctPartCount(pt)
      let sum = 0
      for (let p = 0; p < n; p++) {
        const len = ctPartLength(pt, p)
        if (p < n - 1) expect(len).toBe(CT_PART_SIZE)
        sum += len
      }
      expect(sum).toBe(ctSize(pt))
    }
    expect(CT_PART_SIZE).toBe(67109888)
  })

  it('파일명은 180바이트 이하, 확장자 보존', () => {
    const long = '가'.repeat(100) + '.pdf'
    const c = clampFileName(long)
    expect(new TextEncoder().encode(c).length).toBeLessThanOrEqual(180)
    expect(c.endsWith('.pdf')).toBe(true)
    expect(clampFileName('short.txt')).toBe('short.txt')
  })
})

describe('lockCrypto 키', () => {
  it('같은 비밀번호·salt면 같은 verifier/vh, 다르면 다르다', async () => {
    const a = await deriveLock('0912', undefined, FAST)
    const b = await deriveLock('0912', a.salt, FAST)
    const c = await deriveLock('0913', a.salt, FAST)
    expect(b.verifier).toBe(a.verifier)
    expect(b.vh).toBe(a.vh)
    expect(a.vh).toMatch(/^[0-9a-f]{64}$/)
    expect(c.verifier).not.toBe(a.verifier)
  })

  it('DK 감싸기·풀기, 틀린 비밀번호면 실패', async () => {
    const lock = await deriveLock('pw-1', undefined, FAST)
    const { dkRaw } = await createFileKey()
    const { wk, wkIv } = await wrapFileKey(lock.encKey, dkRaw)
    expect(fromB64u(wk).length).toBe(48)
    expect(await unwrapFileKeyRaw(lock.encKey, wk, wkIv)).toEqual(dkRaw)
    await expect(unwrapFileKey(lock.encKey, wk, wkIv)).resolves.toBeTruthy()
    const wrong = await deriveLock('pw-2', lock.salt, FAST)
    await expect(unwrapFileKey(wrong.encKey, wk, wkIv)).rejects.toBeTruthy()
  })

  it('파일명 암·복호화', async () => {
    const { dk } = await createFileKey()
    const { en, enIv } = await encryptName(dk, '수학여행_계획서_최종.pdf')
    expect(await decryptName(dk, en, enIv)).toBe('수학여행_계획서_최종.pdf')
  })

  it('prepareLockedFile 메타데이터로 받는 쪽이 이름을 복원한다', async () => {
    const lock = await deriveLock('abcd', undefined, FAST)
    const { meta } = await prepareLockedFile(lock, { name: 'a.txt' })
    expect(meta).toMatchObject({ v: 1, salt: lock.salt, vh: lock.vh })
    const recv = await deriveLock('abcd', meta.salt, FAST)
    const dk = await unwrapFileKey(recv.encKey, meta.wk, meta.wkIv)
    expect(await decryptName(dk, meta.en, meta.enIv)).toBe('a.txt')
  })
})

describe('lockCrypto 본문', () => {
  it('여러 레코드 왕복 (마지막 레코드가 짧은 경우)', async () => {
    const { dk, np } = await createFileKey()
    const plain = patterned(RECORD_SIZE * 2 + 1234)
    const blob = new Blob([plain])
    const { out } = await encryptAll(dk, np, blob)
    expect(out.length).toBe(ctSize(plain.length))
    expect(same(await decryptAll(dk, np, out, plain.length), plain)).toBe(true)
  })

  it('정확히 레코드 크기의 배수 / 1바이트 파일', async () => {
    const { dk, np } = await createFileKey()
    for (const n of [1, RECORD_SIZE]) {
      const plain = patterned(n)
      const { out } = await encryptAll(dk, np, new Blob([plain]))
      expect(same(await decryptAll(dk, np, out, n, 4093), plain)).toBe(true)
    }
  })

  it('파트 경계: 65레코드 파일은 64레코드 파트 + 1레코드 파트', async () => {
    const { dk, np } = await createFileKey()
    const plain = patterned(RECORD_SIZE * 64 + 10)
    const { out, parts } = await encryptAll(dk, np, new Blob([plain]))
    expect(parts.length).toBe(2)
    expect(parts[0].length).toBe(CT_PART_SIZE)
    expect(parts[1].length).toBe(10 + TAG_SIZE)
    expect(same(await decryptAll(dk, np, out, plain.length, 3 * 1024 * 1024), plain)).toBe(true)
  }, 30000)

  it('변조·잘림·다른 키는 실패한다', async () => {
    const { dk, np } = await createFileKey()
    const plain = patterned(RECORD_SIZE + 100)
    const { out } = await encryptAll(dk, np, new Blob([plain]))
    const tampered = out.slice()
    tampered[10] ^= 1
    await expect(decryptAll(dk, np, tampered, plain.length)).rejects.toBeTruthy()
    // 마지막 레코드를 통째로 잘라내고 첫 레코드만 "전체"인 척하면 마지막 표시(AAD)가 맞지 않는다
    const firstOnly = out.subarray(0, RECORD_SIZE + TAG_SIZE)
    await expect(decryptAll(dk, np, firstOnly, RECORD_SIZE)).rejects.toBeTruthy()
    // 정상 크기를 기대하는데 덜 들어오면 finish에서 실패
    await expect(decryptAll(dk, np, out.subarray(0, out.length - 5), plain.length)).rejects.toThrow('LOCK_TRUNCATED')
    const other = await createFileKey()
    await expect(decryptAll(other.dk, np, out, plain.length)).rejects.toBeTruthy()
    // 원시 키 재가져오기
    expect(await importRawKey(other.dkRaw)).toBeTruthy()
  })
})
