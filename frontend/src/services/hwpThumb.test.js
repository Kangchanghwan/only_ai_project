import { describe, it, expect, vi } from 'vitest'
import { createHwpThumbnail } from './hwpThumb.js'
import { crc32 } from './hwpZip.js'

const enc = (s) => new TextEncoder().encode(s)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function zip(files) {
  const parts = []; const cds = []; let off = 0
  for (const [name, data] of files) {
    const nb = enc(name)
    const h = new Uint8Array(30 + nb.length); const hd = new DataView(h.buffer)
    hd.setUint32(0, 0x04034b50, true); hd.setUint32(14, crc32(data), true); hd.setUint32(18, data.length, true); hd.setUint32(22, data.length, true); hd.setUint16(26, nb.length, true); h.set(nb, 30)
    const c = new Uint8Array(46 + nb.length); const cd = new DataView(c.buffer)
    cd.setUint32(0, 0x02014b50, true); cd.setUint32(16, crc32(data), true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nb.length, true); cd.setUint32(42, off, true); c.set(nb, 46)
    parts.push(h, data); cds.push(c); off += h.length + data.length
  }
  const start = off
  for (const c of cds) { parts.push(c); off += c.length }
  const t = new Uint8Array(22); const td = new DataView(t.buffer)
  td.setUint32(0, 0x06054b50, true); td.setUint16(8, files.length, true); td.setUint16(10, files.length, true); td.setUint32(12, off - start, true); td.setUint32(16, start, true)
  parts.push(t)
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let p = 0
  for (const x of parts) { out.set(x, p); p += x.length }
  return out
}

const deps = () => {
  const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }
  return {
    createImageBitmap: vi.fn(async () => ({ width: 400, height: 800, close() {} })),
    createCanvas: vi.fn(() => ({ getContext: () => ctx, convertToBlob: async () => new Blob(['x'], { type: 'image/jpeg' }) })),
  }
}
const fileOf = (name, bytes) => new File([bytes], name)

describe('createHwpThumbnail', () => {
  it('HWPX의 내장 미리보기 그림으로 같은 규칙(긴 변 160)의 JPEG 썸네일을 만든다', async () => {
    const d = deps()
    const blob = await createHwpThumbnail(fileOf('a.hwpx', zip([['Preview/PrvImage.png', PNG]])), {}, d)
    expect(blob.type).toBe('image/jpeg')
    expect(d.createCanvas).toHaveBeenCalledWith(80, 160) // 400x800 -> 긴 변 160
  })
  it('내장 미리보기가 없으면 null (파일 업로드는 그대로)', async () => {
    expect(await createHwpThumbnail(fileOf('a.hwpx', zip([['mimetype', enc('x')]])), {}, deps())).toBeNull()
  })
  it('수정해서 올리는 .hwp는 옛 미리보기라 만들지 않는다', async () => {
    const d = deps()
    expect(await createHwpThumbnail(fileOf('a (수정).hwp', new Uint8Array([0xd0, 0xcf])), {}, d)).toBeNull()
    expect(d.createImageBitmap).not.toHaveBeenCalled()
  })
  it('수정해서 올리는 .hwpx는 새로 쓴 미리보기로 썸네일을 만든다', async () => {
    const blob = await createHwpThumbnail(fileOf('a (수정).hwpx', zip([['Preview/PrvImage.png', PNG]])), {}, deps())
    expect(blob).not.toBeNull()
  })
  it('깨진 파일이어도 예외 없이 null', async () => {
    expect(await createHwpThumbnail(fileOf('a.hwpx', new Uint8Array([1, 2, 3])), {}, deps())).toBeNull()
  })
})
