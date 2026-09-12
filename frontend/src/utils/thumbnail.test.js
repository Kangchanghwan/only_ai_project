import { describe, it, expect, vi } from 'vitest'
import { createImageThumbnail } from './thumbnail'

function fakeCanvasFactory(recorded) {
  return (width, height) => {
    recorded.width = width
    recorded.height = height
    return {
      width,
      height,
      getContext: () => ({
        fillRect: vi.fn(),
        drawImage: vi.fn((...args) => { recorded.drawArgs = args })
      }),
      convertToBlob: async ({ type }) => new Blob(['thumb'], { type })
    }
  }
}

describe('createImageThumbnail', () => {
  it('긴 변이 maxSize가 되도록 비율을 유지해 축소한 JPEG Blob을 만든다', async () => {
    const recorded = {}
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const bitmap = { width: 1600, height: 800, close: vi.fn() }

    const blob = await createImageThumbnail(file, { maxSize: 160 }, {
      createImageBitmap: vi.fn(async () => bitmap),
      createCanvas: fakeCanvasFactory(recorded)
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/jpeg')
    expect(recorded.width).toBe(160)
    expect(recorded.height).toBe(80)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('원본이 maxSize보다 작으면 확대하지 않는다', async () => {
    const recorded = {}
    const file = new File(['x'], 'icon.png', { type: 'image/png' })

    await createImageThumbnail(file, { maxSize: 160 }, {
      createImageBitmap: async () => ({ width: 40, height: 30 }),
      createCanvas: fakeCanvasFactory(recorded)
    })

    expect(recorded.width).toBe(40)
    expect(recorded.height).toBe(30)
  })

  it('래스터 이미지가 아니면 null을 반환하고 디코딩을 시도하지 않는다', async () => {
    const createImageBitmap = vi.fn()
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const svg = new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' })

    expect(await createImageThumbnail(pdf, {}, { createImageBitmap })).toBeNull()
    expect(await createImageThumbnail(svg, {}, { createImageBitmap })).toBeNull()
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('createImageBitmap을 지원하지 않는 환경이면 null을 반환한다', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    expect(await createImageThumbnail(file, {}, { createImageBitmap: undefined })).toBeNull()
  })

  it('디코딩에 실패하면 예외 대신 null을 반환한다', async () => {
    const file = new File(['x'], 'photo.heic', { type: 'image/heic' })
    const result = await createImageThumbnail(file, {}, {
      createImageBitmap: async () => { throw new Error('unsupported') },
      createCanvas: fakeCanvasFactory({})
    })
    expect(result).toBeNull()
  })
})
