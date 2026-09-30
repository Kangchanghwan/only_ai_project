import i18n from './index.js'

/**
 * 컴포넌트 밖(composable/service/util)에서 현재 UI 언어로 번역한다.
 * 호출 시점에 locale을 읽으므로 언어 전환이 즉시 반영된다.
 */
export function t(key, params) {
  return i18n.global.t(key, params ?? {})
}

/** 현재 UI 로케일 코드 (예: 'en', 'ko') */
export function currentLocale() {
  return i18n.global.locale.value
}
