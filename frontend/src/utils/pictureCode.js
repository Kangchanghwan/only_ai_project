/**
 * 그림 코드: 24개 그림 중 4개(순서 있음, 중복 허용). 규격: docs/superpowers/specs/2026-11-12-picture-code-design.md
 * 그림 자산은 1:1 연결 확인 그림(assets/sas)을 그대로 쓴다. 인덱스 0..23 = PICTURE_IDS 순서.
 * 서버에는 앞 2개(route)만 보내고, 4개 전부가 SPAKE2 비밀번호가 된다.
 */
import manifest from '../assets/sas/manifest.json'

const svgUrls = import.meta.glob('../assets/sas/*.svg', { eager: true, query: '?no-inline', import: 'default' })

/** 서로 헷갈리지 않고 이름을 말하기 쉬운 24개. 순서를 바꾸면 이미 열린 코드와 호환되지 않는다 */
export const PICTURE_IDS = Object.freeze([
  'banana', 'pizza', 'rocket', 'umbrella', 'key', 'guitar', 'sunflower', 'strawberry',
  'airplane', 'bicycle', 'camera', 'moon', 'rainbow', 'trophy', 'hamburger', 'sailboat',
  'headphone', 'grapes', 'lightbulb', 'mushroom', 'watermelon', 'scissors', 'balloon', 'carrot'
])
export const PICTURE_COUNT = PICTURE_IDS.length
export const CODE_LENGTH = 4

const emojiById = Object.fromEntries(manifest.map((m) => [m.id, m.emoji]))

/** 그림 인덱스 → 이름 번역 키 (code.pic.<id>) */
export const pictureKey = (index) => `code.pic.${PICTURE_IDS[index]}`

/** 그림 인덱스 → { id, src, emoji } (범위 밖이면 null) */
export function pictureOf(index) {
  const id = PICTURE_IDS[index]
  if (!id) return null
  return { id, src: svgUrls[`../assets/sas/${id}.svg`] ?? null, emoji: emojiById[id] ?? '' }
}

/** 24개 전체 (그림판용) */
export const allPictures = () => PICTURE_IDS.map((_, i) => ({ index: i, ...pictureOf(i) }))

/** 그림 인덱스 4개 검증 */
export const isValidCode = (code) =>
  Array.isArray(code) && code.length === CODE_LENGTH && code.every((n) => Number.isInteger(n) && n >= 0 && n < PICTURE_COUNT)

/** 균일한 무작위 인덱스 하나 (거절 샘플링으로 편향 없음) */
function randomIndex() {
  const limit = 256 - (256 % PICTURE_COUNT)
  const buf = new Uint8Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % PICTURE_COUNT
  }
}

/** 무작위 그림 코드 4개 */
export const randomCode = () => Array.from({ length: CODE_LENGTH }, randomIndex)

/** 서버에 알리는 앞 2개 */
export function routeOf(code) {
  if (!isValidCode(code)) throw new Error('CODE_INVALID')
  return [code[0], code[1]]
}

/** SPAKE2 비밀번호 입력용 4바이트 */
export function codeBytes(code) {
  if (!isValidCode(code)) throw new Error('CODE_INVALID')
  return Uint8Array.from(code)
}
