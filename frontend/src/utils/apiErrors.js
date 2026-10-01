/** 서버 에러 code → 사용자에게 그대로 보여줄 i18n 메시지 (키 + 인자) */
export const SERVER_ERROR_MESSAGES = {
  DAILY_QUOTA_EXCEEDED: { key: 'errors.dailyQuotaExceeded' },
  SINGLE_PUT_TOO_LARGE: { key: 'errors.singlePutTooLarge' },
  FILE_TOO_LARGE: { key: 'notification.fileTooLarge', params: { limit: 5120 } },
  ROOM_SIZE_EXCEEDED: { key: 'errors.serverRoomSizeExceeded' },
  SIZE_MISMATCH: { key: 'errors.sizeMismatch' },
}

/** 메시지가 이미 i18n 처리된 서버 에러 code 집합 */
export const FRIENDLY_ERROR_CODES = new Set(Object.keys(SERVER_ERROR_MESSAGES))
