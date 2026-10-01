import { ref, onMounted, onBeforeUnmount } from 'vue'

/** 넓은 화면(기기 목록을 옆 패널로 보여주는 폭). CSS의 @media (min-width: 1100px)와 같은 값을 유지한다. */
export const WIDE_QUERY = '(min-width: 1100px)'

/** matchMedia 결과를 반응형으로 돌려준다. 프리렌더/비지원 환경에서는 false(좁은 화면). */
export function useMediaQuery(query = WIDE_QUERY) {
  const matches = ref(false)
  let mql = null
  const update = () => { matches.value = !!mql?.matches }
  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    mql = window.matchMedia(query)
    update()
    mql.addEventListener?.('change', update)
  })
  onBeforeUnmount(() => mql?.removeEventListener?.('change', update))
  return matches
}
