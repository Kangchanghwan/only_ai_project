import { describe, it, expect, vi } from 'vitest'
import { createHwpThumbnail, createPptxThumbnail, isNearBlank } from './hwpThumb.js'
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
  it('서버가 정리한 수정본 이름(report_수정.hwp, report_수정_2.hwp)도 건너뛴다', async () => {
    const d = deps()
    for (const n of ['report_수정.hwp', 'report_수정_2.hwp']) {
      expect(await createHwpThumbnail(fileOf(n, new Uint8Array([0xd0, 0xcf])), {}, d)).toBeNull()
    }
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

// ---- pptx ----
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6])
const EMF = new Uint8Array([1, 0, 0, 0, 0x6c, 0, 0, 0, 1, 2])
const rgba = (fn, n = 64 * 36) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const v = fn(i); d.set([v, v, v, 255], i * 4) } return d }

/** 분석용 작은 캔버스는 pixels를, 최종 썸네일 캔버스는 convertToBlob을 돌려주는 가짜 의존성 */
const pptxDeps = (pixels) => ({
  createImageBitmap: vi.fn(async () => ({ width: 256, height: 144, close() {} })),
  createCanvas: vi.fn(() => ({
    getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn(), getImageData: () => ({ data: pixels }), fillStyle: '' }),
    convertToBlob: async () => new Blob(['x'], { type: 'image/jpeg' }),
  })),
})

describe('isNearBlank (빈 썸네일 판별)', () => {
  it('전부 흰색 / 전부 같은 색 / 표준편차 3 미만 / 범위 8 미만은 빈 것', () => {
    expect(isNearBlank(rgba(() => 255))).toBe(true)
    expect(isNearBlank(rgba(() => 120))).toBe(true)
    expect(isNearBlank(rgba((i) => 250 + (i % 2)))).toBe(true) // 범위 1
    expect(isNearBlank(rgba((i) => (i % 2 ? 253 : 255)))).toBe(true) // 범위 2, 표준편차 1
    expect(isNearBlank(new Uint8ClampedArray(0))).toBe(true)
  })
  it('내용이 있는 이미지는 빈 것이 아니다', () => {
    expect(isNearBlank(rgba((i) => (i % 8 < 4 ? 20 : 235)))).toBe(false)
    expect(isNearBlank(rgba((i) => (i < 200 ? 30 : 255)))).toBe(false) // 일부만 어두워도(큰 범위)
  })
  it('범위가 8 이상이어도 표준편차가 3 미만이면 빈 것 (거의 균일한 잡음)', () => {
    const d = rgba(() => 255); d.set([240, 240, 240, 255], 0) // 픽셀 하나만 다름
    expect(isNearBlank(d)).toBe(true)
  })
})

describe('createPptxThumbnail', () => {
  const content = rgba((i) => (i % 8 < 4 ? 20 : 235))
  it('docProps/thumbnail.jpeg가 있고 내용이 있으면 160 규칙 JPEG 썸네일', async () => {
    const d = pptxDeps(content)
    const blob = await createPptxThumbnail(fileOf('a.pptx', zip([['docProps/thumbnail.jpeg', JPEG]])), {}, d)
    expect(blob.type).toBe('image/jpeg')
    expect(d.createCanvas).toHaveBeenLastCalledWith(160, 90) // 256x144 -> 긴 변 160
  })
  it('png 썸네일도 받는다', async () => {
    expect(await createPptxThumbnail(fileOf('a.pptx', zip([['docProps/thumbnail.png', PNG]])), {}, pptxDeps(content))).not.toBeNull()
  })
  it('썸네일이 없으면 null', async () => {
    expect(await createPptxThumbnail(fileOf('a.pptx', zip([['ppt/presentation.xml', enc('x')]])), {}, pptxDeps(content))).toBeNull()
  })
  it('빈(흰) 썸네일은 건너뛴다', async () => {
    const d = pptxDeps(rgba(() => 255))
    expect(await createPptxThumbnail(fileOf('a.pptx', zip([['docProps/thumbnail.jpeg', JPEG]])), {}, d)).toBeNull()
    // 최종 썸네일 캔버스(160x90)는 만들지 않았다 = 업로드할 것이 없다
    expect(d.createCanvas).toHaveBeenCalledTimes(1)
  })
  it('jpeg/png가 아닌 형식(emf)은 쓰지 않는다', async () => {
    expect(await createPptxThumbnail(fileOf('a.pptx', zip([['docProps/thumbnail.emf', EMF]])), {}, pptxDeps(content))).toBeNull()
  })
  it('깨진 파일·디코딩 실패는 조용히 null', async () => {
    expect(await createPptxThumbnail(fileOf('a.pptx', new Uint8Array([1, 2, 3])), {}, pptxDeps(content))).toBeNull()
    const d = pptxDeps(content); d.createImageBitmap = vi.fn(async () => { throw new Error('decode') })
    expect(await createPptxThumbnail(fileOf('a.pptx', zip([['docProps/thumbnail.jpeg', JPEG]])), {}, d)).toBeNull()
  })
})
