/**
 * @file thumbnail.js
 * @description 업로드 시 브라우저에서 작은 JPEG 썸네일을 만드는 유틸리티.
 *              목록 화면이 원본(최대 수십 MB)을 내려받지 않도록 한다.
 */

/** 썸네일을 만들 수 있는 래스터 이미지 MIME 타입 */
export const THUMBNAIL_SOURCE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/heic',
  'image/heif'
])

/** 썸네일 MIME 타입 (모든 브라우저 canvas가 인코딩 가능) */
export const THUMBNAIL_CONTENT_TYPE = 'image/jpeg'

function defaultCreateCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * 이미지 파일의 축소 썸네일(JPEG)을 만듭니다.
 * 래스터 이미지가 아니거나 디코딩/인코딩이 불가능하면 null을 반환합니다(예외 없음).
 *
 * @param {File|Blob} file - 원본 이미지
 * @param {{maxSize?: number, quality?: number}} [options]
 * @param {{createImageBitmap?: Function, createCanvas?: Function}} [deps] - 테스트용 의존성 주입
 * @returns {Promise<Blob|null>}
 */
export async function createImageThumbnail(file, options = {}, deps = {}) {
  const { maxSize = 160, quality = 0.72 } = options
  const createBitmap = deps.createImageBitmap ?? globalThis.createImageBitmap
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas

  if (!file || !THUMBNAIL_SOURCE_TYPES.has(file.type) || typeof createBitmap !== 'function') {
    return null
  }

  try {
    const bitmap = await createBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    // JPEG는 투명도가 없으므로 흰 배경 위에 그린다
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await canvasToBlob(canvas, THUMBNAIL_CONTENT_TYPE, quality)
    return blob && blob.type === THUMBNAIL_CONTENT_TYPE ? blob : null
  } catch (error) {
    console.warn('[thumbnail] 썸네일 생성 실패, 원본만 업로드합니다:', error)
    return null
  }
}
