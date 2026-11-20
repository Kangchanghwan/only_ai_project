/**
 * 방의 한글 파일을 고쳐 다시 올릴 때 쓰는 규칙들 (이름, 검증, 미리보기 갱신)
 */
import { isHwpName } from '../utils/hwpName.js'
import { replaceZipEntries } from './hwpZip.js'

/** 서버가 올릴 때 이름에서 걸러 내는 규칙을 같게 흉내 낸다 (백엔드 sanitizeFileName: 공백→_, 허용 문자 외 제거) */
function serverKey(name) {
  const i = name.lastIndexOf('.')
  const base = i > 0 ? name.slice(0, i) : name
  const ext = i > 0 ? name.slice(i) : ''
  return (base.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9\p{Script=Hangul}._-]/gu, '') + ext).toLowerCase()
}

/** 같은 이름이 방에 있으면 확장자 앞에 " (수정)", 그것도 있으면 " (수정 2)"… (일반 파일은 이름이 저장 키라 덮어쓰게 되므로) */
export function editedName(name, existingNames = []) {
  const taken = new Set(existingNames.filter(Boolean).map(serverKey))
  if (!taken.has(serverKey(name))) return name
  const i = name.lastIndexOf('.')
  const base = i > 0 ? name.slice(0, i) : name
  const ext = i > 0 ? name.slice(i) : ''
  let candidate = `${base} (수정)${ext}`
  for (let n = 2; taken.has(serverKey(candidate)) && n < 100; n++) candidate = `${base} (수정 ${n})${ext}`
  return candidate
}

/** 수정해서 올린 .hwp(.hwpx 아님) 파일인지: 안에 든 미리보기가 옛것이라 Stage 1에서 그림을 쓰지 않는다 */
// 서버는 올릴 때 이름을 정리하므로(공백→_, 괄호 제거) "a (수정).hwp"는 "a_수정.hwp", "a (수정 2).hwp"는 "a_수정_2.hwp"로 저장된다. 둘 다 본다.
export const isEditedHwp = (name) => /(\s\(수정[^)]*\)|_수정(_\d+)?)\.hwp$/i.test(name || '')

/** 올리기 전 검증: 확장자, 비어 있지 않음, 크기 한도(일반 업로드와 같은 값) */
export function validateUpload(file, { maxBytes }) {
  if (!file || !isHwpName(file.name)) return { ok: false, reason: 'extension' }
  if (!file.size) return { ok: false, reason: 'empty' }
  if (file.size > maxBytes) return { ok: false, reason: 'size' }
  return { ok: true }
}

/** 첫 쪽 SVG를 PNG로 (HWPX 미리보기 그림 갱신용) */
export async function svgToPng(svg, maxWidth = 724) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w0 = img.naturalWidth || 794
    const h0 = img.naturalHeight || 1123
    const scale = Math.min(1, maxWidth / w0)
    const c = document.createElement('canvas')
    c.width = Math.round(w0 * scale)
    c.height = Math.round(h0 * scale)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** HWPX의 Preview/PrvImage.png, Preview/PrvText.txt만 바꿔 쓴다 (나머지 항목은 원본 바이트 그대로) */
export function refreshHwpxPreview(hwpx, png, text) {
  const repl = new Map()
  if (png) repl.set('Preview/PrvImage.png', png)
  repl.set('Preview/PrvText.txt', new TextEncoder().encode((text || '').slice(0, 1000)))
  return replaceZipEntries(hwpx, repl)
}
