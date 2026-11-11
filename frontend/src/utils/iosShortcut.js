// iOS는 PWA 공유 대상(Web Share Target)을 지원하지 않는다. 공유 메뉴로 보내려면 iOS 단축어(quick-send API)를 쓴다.
export const IOS_SHORTCUT_GUIDE = '/how-to-use.html#ios-shortcut'
export const IOS_SHORTCUT_FILE_LINK = 'https://www.icloud.com/shortcuts/feee389a0a124572bbdf641802930de1'

/** 한국어는 설명이 있는 사용법 절로, 그 외 언어는 단축어 추가 링크로 바로 보낸다 (영어 사용법 페이지가 없음) */
export function iosShortcutHrefFor(locale) {
  return locale === 'ko' ? IOS_SHORTCUT_GUIDE : IOS_SHORTCUT_FILE_LINK
}
