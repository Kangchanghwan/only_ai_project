/**
 * 업로드·텍스트 종류 측정 (화면 변화 없음). 파일 이름과 글 내용은 보내지 않고 아래 범주 값만 만든다.
 */
import { trackEvent } from './analytics'

const EXT_WHITELIST = new Set(('jpg jpeg png heic heif webp gif bmp svg mp4 mov avi mkv mp3 m4a wav pdf hwp hwpx ' +
  'doc docx xls xlsx ppt pptx txt csv md zip 7z rar apk').split(' '))

export const MAX_FILE_INFO_PER_BATCH = 20
export const INAPP_KEY = 'cs_inapp_sent'

/** 확장자: 목록에 있으면 그대로, 확장자가 없으면 none, 그 외 other */
export function extOf(fileName) {
  const name = String(fileName ?? '').split(/[\\/]/).pop()
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return 'none' // ".env"처럼 점이 맨 앞이거나 끝이면 확장자 없음
  const ext = name.slice(i + 1).toLowerCase()
  return EXT_WHITELIST.has(ext) ? ext : 'other'
}

const MIB = 1024 * 1024
export function sizeBucket(bytes) {
  const n = Number(bytes) || 0
  if (n < MIB) return 'lt1m'
  if (n < 10 * MIB) return '1_10m'
  if (n < 100 * MIB) return '10_100m'
  if (n < 1024 * MIB) return '100m_1g'
  return 'gte1g'
}

const CODE_START = /^\s*(function|const|let|var|import|export|def|class|public|private|#include|package|return|if\s*\(|for\s*\(|<\/?(html|div|script|\?php)|select\s|insert\s+into|update\s|create\s+table)\b/i

/** 글 종류: locked | link | number | code | plain (앞 200자만 본다) */
export function textKind(text, { locked = false } = {}) {
  if (locked) return 'locked'
  const head = String(text ?? '').slice(0, 200).trim()
  if (!head) return 'plain'
  if (/^(https?:\/\/|www\.)\S/i.test(head)) return 'link'
  if (!/\s/.test(head) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i.test(head) && /[a-z]{2,}/i.test(head.split(/[/?#]/)[0].split('.').pop())) return 'link'
  if (/^[\d\s-]+$/.test(head) && (head.match(/\d/g) || []).length >= 4) return 'number'
  const lines = head.split('\n')
  const punct = lines.filter((l) => /[{};]\s*$/.test(l.trim())).length
  const keyword = lines.filter((l) => CODE_START.test(l) || /^\s*<[a-z!][^>]*>/i.test(l)).length
  if ((lines.length >= 2 && (punct >= 2 || keyword >= 1 && punct >= 1)) || (lines.length >= 2 && keyword >= 2) || (lines.length === 1 && /^\s*(function|const|import|def|class|<html|<!doctype|select\s.+\sfrom)\b/i.test(head) && /[{};()=<]/.test(head))) return 'code'
  return 'plain'
}

export function lenBucket(n) {
  const c = Number(n) || 0
  if (c < 50) return 'lt50'
  if (c < 500) return '50_500'
  if (c < 5000) return '500_5k'
  return 'gte5k'
}

export function inappOf(userAgent) {
  const ua = String(userAgent ?? '')
  if (/KAKAOTALK/i.test(ua)) return 'kakao'
  if (/instagram/i.test(ua)) return 'instagram'
  if (/NAVER\(\s*inapp/i.test(ua)) return 'naver'
  if (/\bLine\//i.test(ua)) return 'line'
  if (/FBAN|FBAV/i.test(ua)) return 'facebook'
  if (/everytimeApp/i.test(ua)) return 'everytime'
  return 'none'
}

/** 업로드에 성공한 파일마다 upload_file_info (배치당 최대 20개). 측정이 업로드를 막지 않는다 */
export function trackUploadFileInfo(files, scope, track = trackEvent) {
  try {
    for (const f of (files || []).slice(0, MAX_FILE_INFO_PER_BATCH)) {
      track('upload_file_info', { ext: extOf(f?.name), size_bucket: sizeBucket(f?.size), scope })
    }
  } catch { /* 측정 실패는 무시 */ }
}

/** 글 공유 이벤트에 붙일 범주 값 */
export function textMetaParams(text, locked) {
  try {
    const s = String(text ?? '')
    return { text_kind: textKind(s, { locked: !!locked }), len_bucket: lenBucket(s.length) }
  } catch { return {} }
}

/** 인앱 브라우저면 세션당 1회 inapp_open. 일반 브라우저(none)는 보내지 않는다 */
export function initInappMetric({ ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', storage, track = trackEvent } = {}) {
  try {
    const app = inappOf(ua)
    if (app === 'none') return false
    const st = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
    try {
      if (st?.getItem(INAPP_KEY)) return false
      st?.setItem(INAPP_KEY, '1')
    } catch { /* 저장소를 못 쓰면 이 로드에서만 1회 */ }
    track('inapp_open', { app })
    return true
  } catch { return false }
}
