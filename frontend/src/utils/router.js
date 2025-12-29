/**
 * 라우팅 유틸리티
 * Vue Router 없이 해시 기반 라우팅을 처리하는 유틸리티 함수들
 */

/**
 * URL 해시를 파싱하여 라우트 정보 반환
 * @param {string} hash - window.location.hash
 * @returns {Object} 라우트 정보 객체
 */
export function parseRoute(hash) {
  if (!hash || hash === '#' || hash === '#/') {
    return { type: 'home' }
  }

  // 다운로드 페이지: /#/download?r={roomId}&f={base64}
  if (hash.startsWith('#/download')) {
    try {
      // URL 객체를 사용하여 쿼리 파라미터 파싱
      // hash는 '#/download?...' 형태이므로 '?' 이후를 추출
      const queryStart = hash.indexOf('?')
      if (queryStart === -1) {
        return { type: 'home' }
      }

      const queryString = hash.substring(queryStart + 1)
      const params = new URLSearchParams(queryString)

      const roomId = params.get('r')
      const fileNamesBase64 = params.get('f')

      if (!roomId || !fileNamesBase64) {
        console.warn('[router] 다운로드 URL에 필수 파라미터가 없습니다:', { roomId, fileNamesBase64 })
        return { type: 'home' }
      }

      return {
        type: 'download',
        roomId,
        fileNamesBase64
      }
    } catch (error) {
      console.error('[router] 다운로드 URL 파싱 실패:', error)
      return { type: 'home' }
    }
  }

  // 룸 입장: /#/{roomCode}
  if (hash.startsWith('#/')) {
    const roomCode = hash.substring(2)
    // 쿼리 파라미터가 포함되어 있으면 '?' 이전까지만 추출
    const cleanRoomCode = roomCode.split('?')[0]

    if (cleanRoomCode && cleanRoomCode.length > 0) {
      return {
        type: 'room',
        roomCode: cleanRoomCode
      }
    }
  }

  return { type: 'home' }
}

/**
 * 파일명 배열을 URL-safe Base64로 인코딩
 * 한글 파일명 지원을 위해 encodeURIComponent 사용
 * URL 쿼리 파라미터에 안전하게 전달하기 위해 URL-safe Base64 사용
 *
 * @param {string[]} fileNames - 파일명 배열
 * @returns {string} URL-safe Base64 인코딩된 문자열
 */
export function encodeFileNames(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return ''
  }

  try {
    // 파일명을 쉼표로 연결
    const joined = fileNames.join(',')
    // 한글 지원을 위한 인코딩 체인
    // encodeURIComponent -> escape -> btoa
    let encoded = btoa(unescape(encodeURIComponent(joined)))

    // URL-safe Base64로 변환
    // + → - (더하기를 하이픈으로)
    // / → _ (슬래시를 언더스코어로)
    // = 제거 (패딩 제거)
    encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    return encoded
  } catch (error) {
    console.error('[router] 파일명 인코딩 실패:', error)
    return ''
  }
}

/**
 * URL-safe Base64 문자열을 파일명 배열로 디코딩
 *
 * @param {string} base64 - URL-safe Base64 인코딩된 문자열
 * @returns {string[]} 파일명 배열 (실패 시 빈 배열)
 */
export function decodeFileNames(base64) {
  if (!base64 || typeof base64 !== 'string') {
    return []
  }

  try {
    // URL-safe Base64를 일반 Base64로 복원
    // - → + (하이픈을 더하기로)
    // _ → / (언더스코어를 슬래시로)
    let normalized = base64.replace(/-/g, '+').replace(/_/g, '/')

    // Base64 패딩 추가 (= 문자)
    // Base64는 4의 배수 길이여야 하므로 패딩 추가
    while (normalized.length % 4) {
      normalized += '='
    }

    // 한글 지원을 위한 디코딩 체인
    // atob -> escape -> decodeURIComponent
    const decoded = decodeURIComponent(escape(atob(normalized)))

    // 쉼표로 분리
    const fileNames = decoded.split(',').filter(name => {
      // 빈 문자열 제거
      if (!name || name.trim().length === 0) {
        return false
      }

      // 경로 순회 공격 방지 (../ 또는 ..\)
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        console.warn('[router] 잘못된 파일명 감지:', name)
        return false
      }

      // 최대 길이 제한 (255자)
      if (name.length > 255) {
        console.warn('[router] 파일명이 너무 깁니다:', name)
        return false
      }

      return true
    })

    return fileNames
  } catch (error) {
    console.error('[router] 파일명 디코딩 실패:', error)
    return []
  }
}

/**
 * 다운로드 페이지 URL 생성
 *
 * @param {string} roomId - 룸 ID
 * @param {string[]} fileNames - 파일명 배열
 * @returns {string} 완전한 다운로드 페이지 URL
 */
export function generateDownloadUrl(roomId, fileNames) {
  if (!roomId || !Array.isArray(fileNames) || fileNames.length === 0) {
    console.warn('[router] generateDownloadUrl: 잘못된 파라미터')
    return ''
  }

  const encoded = encodeFileNames(fileNames)
  if (!encoded) {
    return ''
  }

  const origin = window.location.origin
  const path = window.location.pathname
  const url = `${origin}${path}#/download?r=${roomId}&f=${encoded}`

  // URL 길이 검증 (2000자 제한)
  if (url.length > 2000) {
    console.warn('[router] URL이 너무 깁니다:', url.length, '자')
  }

  return url
}

/**
 * URL 길이 검증
 *
 * @param {string} url - 검증할 URL
 * @returns {Object} { isValid: boolean, length: number, maxLength: number }
 */
export function validateUrlLength(url) {
  const MAX_LENGTH = 2000
  const length = url ? url.length : 0

  return {
    isValid: length <= MAX_LENGTH,
    length,
    maxLength: MAX_LENGTH,
    isTooLong: length > MAX_LENGTH
  }
}
