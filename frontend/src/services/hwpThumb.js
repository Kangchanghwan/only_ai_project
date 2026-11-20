/**
 * 한글 문서(.hwp/.hwpx) 업로드 시 파일 안에 든 첫 쪽 미리보기로 목록 썸네일(JPEG)을 만든다. 지연 로드된다.
 * 크기·품질 규칙은 이미지 썸네일과 같다(createImageThumbnail). 실패는 null이고 파일 업로드를 막지 않는다.
 */
import { createImageThumbnail } from '../utils/thumbnail.js'
import { extractPreview } from './hwpPreview.js'
import { isEditedHwp } from './hwpFiles.js'

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
