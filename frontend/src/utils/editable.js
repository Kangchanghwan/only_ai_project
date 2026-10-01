/** 입력 가능한 요소(input/textarea/select/contenteditable)인지 확인한다. 전역 붙여넣기 자동 공유에서 제외하는 데 쓴다. */
export function isEditableTarget(el) {
  if (!el || typeof el !== 'object') return false
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase()
    return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color', 'image', 'reset'].includes(type)
  }
  return !!el.isContentEditable
}
