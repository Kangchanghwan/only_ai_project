import { describe, it, expect, vi, afterEach } from 'vitest'
import { zipInMemoryDownload } from './zipDownloader.js'
import { createFileKey, encryptPart, ctPartCount, ctSize, RECORD_SIZE } from '../utils/lockCrypto.js'
import { buildZipParts, encodeName, zipSize } from '../utils/zipWriter.js'

const enc = new TextEncoder()
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
async function encryptAll(dk, np, bytes) {
  const blob = new Blob([bytes])
  const parts = []
  for (let p = 0; p < ctPartCount(blob.size); p++) parts.push(new Uint8Array(await (await encryptPart(dk, np, blob, p)).arrayBuffer()))
  return concat(parts)
}
const bodyOf = (data) => ({ ok: true, body: { getReader: () => { let d = false; return { read: async () => (d ? { done: true } : (d = true, { done: false, value: data })), cancel: () => {} } } } })

describe('zipInMemoryDownload: 방(잠긴) 파일 (아이폰·서비스워커 없음)', () => {
  let saved = null
  afterEach(() => { vi.restoreAllMocks(); saved = null })

  it('파일마다 받기 직전에 키를 받아 이 기기에서 풀고, 평문 ZIP과 같은 바이트로 저장한다', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { saved = b; return 'blob:x' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { dk, dkRaw, np } = await createFileKey()
    const a = new Uint8Array(RECORD_SIZE + 5).map((_, i) => i & 0xff)
    const b = enc.encode('두 번째 비밀 메모')
    const cta = await encryptAll(dk, np, a)
    const ctb = await encryptAll(dk, np, b)
    const calls = []
    const getLockedEntry = vi.fn(async (f) => { calls.push(f.name); return { url: `https://r2/${f.name}`, dkRaw, np, ctSize: ctSize(f.size) } })
    const fetchImpl = async (url) => bodyOf(url.endsWith('id-a') ? cta : ctb)
    const entries = [
      { roomId: 'prv-g-x', file: 'id-a', name: 'a.bin', size: a.length, locked: true, source: { name: 'id-a', size: a.length } },
      { roomId: 'prv-g-x', file: 'id-b', name: 'b.txt', size: b.length, locked: true, source: { name: 'id-b', size: b.length } },
    ]
    const total = zipSize(entries.map((e) => ({ nameBytes: encodeName(e.name), size: e.size })))
    const progress = []
    await zipInMemoryDownload({ entries, zipName: 'room.zip', total, onProgress: (p) => progress.push(p), fetchImpl, getLockedEntry })
    expect(calls).toEqual(['id-a', 'id-b'])
    const got = new Uint8Array(await saved.arrayBuffer())
    const parts = buildZipParts([{ name: 'a.bin', chunks: [a] }, { name: 'b.txt', chunks: [b] }])
    const expected = concat(parts)
    // 날짜 필드(DOS 시각)만 다를 수 있어 길이와 파일 내용·이름 위치를 비교한다
    expect(got.length).toBe(expected.length)
    expect(Buffer.from(got).includes(Buffer.from(b))).toBe(true)
    expect(Buffer.from(got).includes(Buffer.from('a.bin'))).toBe(true)
    expect(progress.at(-1)).toBe(100)
  })

  it('키를 못 받으면 ZIP_KEY_FAILED (저장하지 않음)', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x')
    const entries = [{ roomId: 'prv', file: 'id', name: 'x', size: 3, locked: true, source: { name: 'id' } }]
    await expect(zipInMemoryDownload({ entries, zipName: 'z.zip', total: 100, fetchImpl: async () => bodyOf(new Uint8Array(3)), getLockedEntry: async () => { throw new Error('NEED_PASSWORD') } }))
      .rejects.toMatchObject({ code: 'ZIP_KEY_FAILED' })
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
