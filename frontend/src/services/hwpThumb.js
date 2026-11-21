/**
 * 한글 문서(.hwp/.hwpx) 업로드 시 파일 안에 든 첫 쪽 미리보기로 목록 썸네일(JPEG)을 만든다. 지연 로드된다.
 * 크기·품질 규칙은 이미지 썸네일과 같다(createImageThumbnail). 실패는 null이고 파일 업로드를 막지 않는다.
 */
import { createImageThumbnail } from '../utils/thumbnail.js'
import { extractPreview } from './hwpPreview.js'
import { isEditedHwp } from './hwpFiles.js'
import { readZipEntries, readZipEntry } from './hwpZip.js'

const MAX_SOURCE_BYTES = 200 * 1024 * 1024 // 이보다 큰 문서는 통째로 읽지 않는다

export async function createHwpThumbnail(file, options = {}, deps = {}) {
  try {
    if (!file || file.size > MAX_SOURCE_BYTES) return null
    // 우리 편집기에서 고쳐 올린 .hwp는 안의 미리보기가 옛것이라 만들지 않는다 (HWPX는 올리기 전에 미리보기를 새로 써 넣는다)
    if (isEditedHwp(file.name)) return null
    const { image } = await extractPreview(new Uint8Array(await file.arrayBuffer()))
    if (!image) return null
    return await createImageThumbnail(image, options, deps)
  } catch {
    return null
  }
}

// ---- .pptx: 파일 안의 docProps/thumbnail.(jpeg|png) (PowerPoint가 첫 슬라이드로 저장). docx·xlsx는 만들지 않는다 ----

/** 거의 빈(흰) 이미지인지: 밝기 표준편차 < 3 이거나 (최대-최소) < 8. data는 RGBA 바이트(ImageData.data) */
export function isNearBlank(data) {
  let n = 0, sum = 0, sumSq = 0, min = 255, max = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    n++; sum += y; sumSq += y * y
    if (y < min) min = y
    if (y > max) max = y
  }
  if (n === 0) return true
  const mean = sum / n
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  return std < 3 || max - min < 8
}

const imageType = (b) => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  return null // emf 등은 쓰지 않는다
}

async function embeddedPptxThumbnail(u8) {
  const { entries } = readZipEntries(u8)
  const e = entries.find((x) => /^docprops\/thumbnail\.(jpe?g|png)$/i.test(x.name)) || entries.find((x) => /^docprops\/thumbnail\./i.test(x.name))
  if (!e) return null
  const b = await readZipEntry(u8, e)
  const type = imageType(b)
  return type ? new Blob([b], { type }) : null
}

export async function createPptxThumbnail(file, options = {}, deps = {}) {
  try {
    if (!file || file.size > MAX_SOURCE_BYTES) return null
    const image = await embeddedPptxThumbnail(new Uint8Array(await file.arrayBuffer()))
    if (!image) return null
    const createBitmap = deps.createImageBitmap ?? globalThis.createImageBitmap
    const createCanvas = deps.createCanvas ?? ((w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })))
    // 빈 썸네일(흰 바탕 템플릿 등)은 쓰지 않는다
    const bmp = await createBitmap(image)
    const w = Math.max(1, Math.min(64, bmp.width))
    const h = Math.max(1, Math.round((bmp.height * w) / bmp.width))
    const ctx = createCanvas(w, h).getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    if (isNearBlank(ctx.getImageData(0, 0, w, h).data)) return null
    return await createImageThumbnail(image, options, deps)
  } catch {
    return null
  }
}
