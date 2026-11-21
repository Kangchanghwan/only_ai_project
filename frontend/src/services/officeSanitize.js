/**
 * Office 미리보기 출력 DOM 정리. 방의 파일은 다른 사람이 올린 것이라 렌더러가 만든 DOM을 믿지 않는다.
 *  - script / iframe / object / embed (그리고 base, meta, link, form) 제거
 *  - on* 속성 제거
 *  - href / src 류 값은 http, https, data:image/*, blob: 만 허용 (문서 안 이동 '#...'은 허용), 아니면 속성 제거
 *  - 링크는 target=_blank rel="noopener noreferrer"
 */
const REMOVE = 'script,iframe,object,embed,base,meta,link,form,frame,frameset,applet'
const URL_ATTRS = ['href', 'src', 'xlink:href', 'srcset', 'action', 'formaction', 'poster', 'data', 'background']

/** 허용되는 URL 값인지 */
export function isSafeUrl(value) {
  const v = String(value).replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase() // 공백·제어문자로 스킴을 숨기는 수법 방지
  if (v === '') return true
  if (v.startsWith('#')) return true
  if (/^https?:/.test(v)) return true
  if (v.startsWith('blob:')) return true
  if (/^data:image\/[a-z0-9.+-]+[;,]/.test(v)) return !v.startsWith('data:image/svg') // svg는 스크립트를 품을 수 있어 제외
  return false
}

function styleHasUnsafeUrl(style) {
  const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi
  let m
  while ((m = re.exec(style))) if (!isSafeUrl(m[2])) return true
  return /expression\s*\(|@import|javascript:/i.test(style)
}

function cleanElement(el) {
  for (const attr of Array.from(el.attributes)) {
    const n = attr.name.toLowerCase()
    if (n.startsWith('on')) { el.removeAttribute(attr.name); continue }
    if (URL_ATTRS.includes(n)) {
      const val = n === 'srcset' ? attr.value.split(',').map((x) => x.trim().split(/\s+/)[0]).join(' ') : attr.value
      if (!val.split(/\s+/).every(isSafeUrl)) el.removeAttribute(attr.name)
    } else if (n === 'style' && styleHasUnsafeUrl(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }
  const tag = el.tagName.toLowerCase()
  if (tag === 'a' || (tag === 'a' && el.namespaceURI)) {
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer')
  }
}

/** root 아래(와 root 자신)를 정리한다 */
export function sanitizeTree(root) {
  if (!root) return
  if (root.nodeType === 1 && root.matches?.(REMOVE)) { root.remove(); return }
  if (root.querySelectorAll) {
    root.querySelectorAll(REMOVE).forEach((n) => n.remove())
    root.querySelectorAll('*').forEach(cleanElement)
  }
  if (root.nodeType === 1) cleanElement(root)
}

/** 렌더 뒤에 생기는 노드(예: 엑셀 시트 탭 전환)도 계속 정리한다. 반환값을 부르면 멈춘다. */
export function watchSanitize(root) {
  sanitizeTree(root)
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => { if (n.nodeType === 1) sanitizeTree(n) })
      if (r.type === 'attributes' && r.target.nodeType === 1) cleanElement(r.target)
    }
  })
  mo.observe(root, { childList: true, subtree: true, attributes: true })
  return () => mo.disconnect()
}
