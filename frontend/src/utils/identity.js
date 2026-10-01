/**
 * @file identity.js
 * @description 기기 정체성(형용사+동물) 표시/저장/힌트 수집 유틸.
 *              서버는 인덱스 {adj, animal, suffix?}만 주고받고, 이름은 보는 사람의 언어로 여기서 만든다.
 *              인덱스 순서는 backend/src/utils/identity.ts, i18n의 identity.adj / identity.animal 과 같아야 한다.
 */

export const ADJ_COUNT = 24
export const ANIMAL_COUNT = 24

/** 동물 인덱스 → 파일명(assets/animals/{id}.svg), 이모지(토스트용), 아바타 배경색 */
export const ANIMALS = [
  { id: 'panda', emoji: '🐼', bg: '#E8EEF4' },
  { id: 'fox', emoji: '🦊', bg: '#FFE7D1' },
  { id: 'cat', emoji: '🐱', bg: '#FFF1C7' },
  { id: 'dog', emoji: '🐶', bg: '#F3E3D3' },
  { id: 'rabbit', emoji: '🐰', bg: '#FADCE7' },
  { id: 'bear', emoji: '🐻', bg: '#EAD9C8' },
  { id: 'koala', emoji: '🐨', bg: '#DDE6EE' },
  { id: 'tiger', emoji: '🐯', bg: '#FFE3B8' },
  { id: 'lion', emoji: '🦁', bg: '#FFEDB5' },
  { id: 'penguin', emoji: '🐧', bg: '#D6E8F7' },
  { id: 'owl', emoji: '🦉', bg: '#E7DDF3' },
  { id: 'frog', emoji: '🐸', bg: '#D9F0D3' },
  { id: 'monkey', emoji: '🐵', bg: '#F1DFC8' },
  { id: 'hamster', emoji: '🐹', bg: '#FFE9CF' },
  { id: 'otter', emoji: '🦦', bg: '#D8EDEA' },
  { id: 'hedgehog', emoji: '🦔', bg: '#EBDDD0' },
  { id: 'turtle', emoji: '🐢', bg: '#D5EFDC' },
  { id: 'dolphin', emoji: '🐬', bg: '#D3EAFB' },
  { id: 'whale', emoji: '🐳', bg: '#CFE3F8' },
  { id: 'octopus', emoji: '🐙', bg: '#F9D8E3' },
  { id: 'chick', emoji: '🐥', bg: '#FFF4B8' },
  { id: 'unicorn', emoji: '🦄', bg: '#EFDDF8' },
  { id: 'raccoon', emoji: '🦝', bg: '#E3E3E8' },
  { id: 'sloth', emoji: '🦥', bg: '#E6DCCB' }
]

// 인라인(base64)하지 않고 해시된 별도 파일로 내보낸다 (JS 번들 비대화 방지, 화면에 쓰이는 것만 로드)
const svgUrls = import.meta.glob('../assets/animals/*.svg', { eager: true, query: '?no-inline', import: 'default' })

/** 동물 인덱스의 SVG URL (범위 밖이면 null) */
export function animalSrc(animal) {
  const meta = ANIMALS[animal]
  if (!meta) return null
  return svgUrls[`../assets/animals/${meta.id}.svg`] ?? null
}

export function animalEmoji(animal) {
  return ANIMALS[animal]?.emoji ?? '🐾'
}

export function animalBg(animal) {
  return ANIMALS[animal]?.bg ?? '#E5E7EB'
}

/** 서버가 준 identity가 표시 가능한 형태인지 */
export function isValidIdentity(identity) {
  return !!identity &&
    Number.isInteger(identity.adj) && identity.adj >= 0 && identity.adj < ADJ_COUNT &&
    Number.isInteger(identity.animal) && identity.animal >= 0 && identity.animal < ANIMAL_COUNT
}

/** 두 identity가 같은 조합인지 (방 안에서 조합은 유일하므로 같은 기기로 본다) */
export function sameIdentity(a, b) {
  return isValidIdentity(a) && isValidIdentity(b) &&
    a.adj === b.adj && a.animal === b.animal && (a.suffix ?? 0) === (b.suffix ?? 0)
}

const GENDER_INDEX = { m: 0, f: 1, n: 2 }

/** "Sonolento/Sonolenta" 같은 성별 활용형 중 동물 성별에 맞는 것을 고른다 */
function pickForm(raw, genderChar) {
  const forms = raw.split('/')
  const idx = GENDER_INDEX[genderChar] ?? 0
  return forms[Math.min(idx, forms.length - 1)]
}

/**
 * 보는 사람의 언어로 이름을 만든다. 예) ko "졸린 판다", en "Sleepy Panda"
 * @param {{adj:number, animal:number, suffix?:number}} identity
 * @param {(key:string, params?:object) => string} t
 */
export function identityName(identity, t) {
  if (!isValidIdentity(identity)) return ''
  const gender = t('identity.gender')
  const genderChar = /^[mfn]{24}$/.test(gender) ? gender[identity.animal] : 'm'
  const adj = pickForm(t(`identity.adj[${identity.adj}]`), genderChar)
  const animal = t(`identity.animal[${identity.animal}]`)
  const name = t('identity.nameFormat', { adj, animal })
  return identity.suffix ? `${name} ${identity.suffix}` : name
}

/** 한글 문자열 끝 글자의 받침 여부 (한글이 아니면 null) */
function koBatchim(text) {
  const code = (text || '').trim().slice(-1).charCodeAt(0)
  if (!(code >= 0xac00 && code <= 0xd7a3)) return null
  return (code - 0xac00) % 28
}

/** 조사 '으로/로': 받침이 없거나 ㄹ이면 '로' */
export function koEuro(word) {
  const b = koBatchim(word)
  return b === null || b === 0 || b === 8 ? '로' : '으로'
}

/** 조사 '이/가' */
export function koGa(word) {
  const b = koBatchim(word)
  return b === null || b === 0 ? '가' : '이'
}

const BROWSER_KEYS = {
  Chrome: 'Chrome', Safari: 'Safari', Edge: 'Edge', Firefox: 'Firefox', Opera: 'Opera', Whale: 'Whale',
  'Samsung Internet': 'Samsung', KakaoTalk: 'KakaoTalk', Naver: 'Naver', Instagram: 'Instagram', Facebook: 'Facebook'
}

/** 서버가 준 브라우저 이름의 현지화된 표기 */
export function browserName(browser, t) {
  return t(`identity.browser.${BROWSER_KEYS[browser] || 'Unknown'}`)
}

const DEVICE_KEYS = new Set(['mac', 'windows_pc', 'iphone', 'ipad', 'android_phone', 'android_tablet', 'galaxy', 'linux', 'chromebook', 'unknown'])

/** 기기 종류 표기. 안드로이드 폰은 기종명을 알면 기종명을 쓴다 (예: "Pixel 8") */
export function deviceName(source, t) {
  const label = DEVICE_KEYS.has(source?.deviceLabel) ? source.deviceLabel : 'unknown'
  if (label === 'android_phone' && source.model) return source.model
  return t(`identity.device.${label}`)
}

/** "Mac 크롬" 처럼 기기+브라우저 */
export function deviceAndBrowser(source, t) {
  return `${deviceName(source, t)} ${browserName(source.browser, t)}`
}

/**
 * "Android 크롬으로 접속한 용감한 여우" / "Brave Fox on Android Chrome"
 * source는 room-users의 device 또는 서버가 붙인 sender
 */
export function describeConnected(source, t) {
  const name = identityName(source.identity, t)
  const device = deviceName(source, t)
  const browser = browserName(source.browser, t)
  return t('identity.connectedAs', { name, device, browser, josa: koEuro(browser) })
}

/** 새 기기 토스트: "🦊 Android 크롬으로 접속한 용감한 여우가 들어왔어요" */
export function describeJoined(source, t) {
  const name = identityName(source.identity, t)
  const desc = describeConnected(source, t)
  return `${animalEmoji(source.identity.animal)} ${t('identity.toastJoined', { desc, ga: koGa(name) })}`
}

/** 접속 시점 등 상대 시간 ("3분 전"). Intl이 로케일별 문구를 만든다 */
export function formatRelativeTime(timestamp, locale, now = Date.now()) {
  const diffSec = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(diffSec)
  let rtf
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  }
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86400), 'day')
}

// === 저장된 정체성 (30일) ===

const STORAGE_KEY = 'clipboard-identity'
const STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 서버가 할당해 준 {adj, animal}을 30일간 저장한다 (접미 번호는 저장하지 않는다) */
export function saveIdentity(identity, now = Date.now()) {
  if (!isValidIdentity(identity)) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ adj: identity.adj, animal: identity.animal, savedAt: now }))
  } catch { /* 저장소 접근이 막힌 환경은 무시 */ }
}

/** 저장된 정체성. 없거나 만료/손상이면 null */
export function loadIdentity(now = Date.now()) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidIdentity(parsed) || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > STORAGE_TTL_MS) return null
    return { adj: parsed.adj, animal: parsed.animal }
  } catch {
    return null
  }
}

// === 접속 시 힌트 ===

/**
 * 서버로 보낼 기기 힌트: 안드로이드 기종(model), iPad 판별용 터치 지점 수.
 * UA-CH는 일부 브라우저에서만 되므로 실패/시간 초과는 조용히 건너뛴다.
 */
export async function collectClientHints(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const hints = {}
  if (typeof nav.maxTouchPoints === 'number') hints.maxTouchPoints = nav.maxTouchPoints
  try {
    if (nav.userAgentData?.getHighEntropyValues) {
      const values = await Promise.race([
        nav.userAgentData.getHighEntropyValues(['model']),
        new Promise((resolve) => setTimeout(() => resolve(null), 800))
      ])
      if (values?.model) hints.model = String(values.model).slice(0, 40)
    }
  } catch { /* 힌트 없이 진행 */ }
  return hints
}
