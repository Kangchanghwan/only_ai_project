/**
 * 1:1 연결 확인 그림 64장. manifest 순서 = sas 값(0..63).
 * 이름표 동물(utils/identity.js)과 같은 방식으로, JS에 인라인하지 않고 해시된 별도 SVG 파일로 내보낸다.
 */
import manifest from '../assets/sas/manifest.json'

const svgUrls = import.meta.glob('../assets/sas/*.svg', { eager: true, query: '?no-inline', import: 'default' })

/** sas 값(0..63) → { src, emoji } (범위 밖이면 null). emoji는 스크린리더용 대체 텍스트 */
export function sasImage(value) {
  const meta = manifest[value]
  if (!meta) return null
  return { src: svgUrls[`../assets/sas/${meta.id}.svg`] ?? null, emoji: meta.emoji }
}

/** sas 배열 → 이미지 배열 */
export function sasImages(sas) {
  return (sas || []).map((v) => sasImage(v)).filter(Boolean)
}
