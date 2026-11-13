import { watch, onBeforeUnmount } from 'vue'

/**
 * 모달이 열려 있는 동안 Escape로 닫는다.
 * @param {() => boolean} isOpen 열림 여부
 * @param {() => void} close 닫기 동작
 */
export function useEscapeClose(isOpen, close) {
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
  }
  watch(isOpen, (open, was) => {
    if (open && !was) document.addEventListener('keydown', onKey)
    else if (!open && was) document.removeEventListener('keydown', onKey)
  }, { immediate: true })
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
}
