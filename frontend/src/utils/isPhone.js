/**
 * 폰 판별 (한 곳에서만 정의): 터치가 주 입력(pointer: coarse)이고 화면 짧은 변이 600px 미만.
 * 태블릿과 데스크톱은 false (수정 가능).
 */
export function isPhone(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    if (!win || typeof win.matchMedia !== 'function') return false
    const s = win.screen || {}
    return win.matchMedia('(pointer: coarse)').matches && Math.min(s.width, s.height) < 600
  } catch {
    return false
  }
}
