// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { crc32, buildZipParts, zipSize, encodeName, dosDateTime } from './zipWriter.js'

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const enc = new TextEncoder()

/** 중앙 디렉터리를 읽어 항목을 꺼낸다 (테스트용 최소 해석기) */
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const out = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const flags = v.getUint16(p + 8, true)
    const method = v.getUint16(p + 10, true)
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 24, true)
    const nameLen = v.getUint16(p + 28, true)
    const offset = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(offset, true)).toBe(0x04034b50)
    const localNameLen = v.getUint16(offset + 26, true)
    const data = bytes.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size)
    const desc = offset + 30 + localNameLen + size
    expect(v.getUint32(desc, true)).toBe(0x08074b50)
    expect(v.getUint32(desc + 4, true)).toBe(crc)
    out.push({ name, flags, method, crc, size, data })
    p += 46 + nameLen
  }
  return out
}

describe('zipWriter', () => {
  it('CRC32 표준 시험값: "123456789" → CBF43926, 이어 계산해도 같다', () => {
    expect(crc32(enc.encode('123456789')).toString(16)).toBe('cbf43926')
    expect(crc32(enc.encode('6789'), crc32(enc.encode('12345'))).toString(16)).toBe('cbf43926')
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('압축 없이 묶고, 한글 이름은 UTF-8 플래그로, 내용·CRC가 그대로 들어간다', () => {
    const items = [
      { name: '사진 1.jpg', chunks: [enc.encode('hello '), enc.encode('world')] },
      { name: 'empty.txt', chunks: [] },
      { name: 'b.bin', chunks: [new Uint8Array([0, 255, 1, 2])] },
    ]
    const bytes = concat(buildZipParts(items, new Date(2026, 10, 13, 9, 15, 30)))
    const entries = readZip(bytes)
    expect(entries.map((e) => e.name)).toEqual(['사진 1.jpg', 'empty.txt', 'b.bin'])
    expect(entries.every((e) => e.method === 0 && (e.flags & 0x0808) === 0x0808)).toBe(true)
    expect(new TextDecoder().decode(entries[0].data)).toBe('hello world')
    expect(entries[0].crc).toBe(crc32(enc.encode('hello world')))
    expect(entries[1].size).toBe(0)
    expect([...entries[2].data]).toEqual([0, 255, 1, 2])
  })

  it('zipSize는 실제로 만든 ZIP 길이와 같다 (Content-Length로 쓴다)', () => {
    const items = [{ name: '가.txt', chunks: [enc.encode('abc')] }, { name: 'b', chunks: [new Uint8Array(1000)] }]
    const bytes = concat(buildZipParts(items))
    expect(zipSize(items.map((i) => ({ nameBytes: encodeName(i.name), size: i.chunks.reduce((n, c) => n + c.length, 0) })))).toBe(bytes.length)
  })

  it('DOS 시각: 2초 단위, 1980년 이전은 1980-01-01', () => {
    const d = dosDateTime(new Date(2026, 10, 13, 9, 15, 31))
    expect(d.time).toBe((9 << 11) | (15 << 5) | 15)
    expect(d.date).toBe(((2026 - 1980) << 9) | (11 << 5) | 13)
    expect(dosDateTime(new Date(1970, 0, 1))).toEqual({ time: 0, date: 33 })
  })
})
