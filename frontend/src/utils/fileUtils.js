/**
 * @file fileUtils.js
 * @description 파일 관련 유틸리티 함수 모음
 *
 * 파일 메타데이터 처리:
 * - 파일 크기 포맷팅
 * - 파일 타입 감지
 * - 파일 타입별 아이콘
 * - 업로드 시간 포맷팅
 */

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환합니다.
 *
 * @param {number} bytes - 바이트 단위의 파일 크기
 * @returns {string} 포맷된 파일 크기 (예: "1.5 KB", "10.0 MB")
 *
 * @example
 * formatFileSize(1024) // "1.0 KB"
 * formatFileSize(1048576) // "1.0 MB"
 */
export function formatFileSize(bytes) {
  // 유효성 검사
  if (bytes == null || bytes < 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  // 적절한 단위 찾기
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  // 바이트는 소수점 없이, 나머지는 소수점 한 자리
  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 파일명에서 확장자를 추출합니다.
 *
 * @param {string} fileName - 파일명
 * @returns {string} 소문자 확장자 (점 제외)
 */
function getFileExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return ''
  }
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) {
    return ''
  }
  return fileName.slice(lastDot + 1).toLowerCase()
}

/**
 * 파일명으로부터 파일 타입을 감지합니다.
 *
 * @param {string} fileName - 파일명
 * @returns {string} 파일 타입 ('image', 'video', 'audio', 'document', 'archive', 'code', 'file')
 *
 * @example
 * getFileType('photo.jpg') // "image"
 * getFileType('document.pdf') // "document"
 */
export function getFileType(fileName) {
  const ext = getFileExtension(fileName)

  if (!ext) {
    return 'file'
  }

  // 파일 타입별 확장자 매핑
  const typeMap = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
    video: ['mp4', 'avi', 'mov', 'wmv', 'webm', 'mkv', 'flv'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    code: ['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php']
  }

  // 확장자에 해당하는 타입 찾기
  for (const [type, extensions] of Object.entries(typeMap)) {
    if (extensions.includes(ext)) {
      return type
    }
  }

  return 'file'
}

/**
 * 파일 타입에 따른 이모지 아이콘을 반환합니다.
 *
 * @param {string} fileName - 파일명
 * @returns {string} 파일 타입에 해당하는 이모지
 *
 * @example
 * getFileIcon('photo.jpg') // "🖼️"
 * getFileIcon('script.js') // "💻"
 */
export function getFileIcon(fileName) {
  const type = getFileType(fileName)

  const iconMap = {
    image: '🖼️',
    video: '🎬',
    audio: '🎵',
    document: '📄',
    archive: '📦',
    code: '💻',
    file: '📁'
  }

  return iconMap[type] || iconMap.file
}

/**
 * 업로드 시간을 상대적인 시간으로 포맷팅합니다.
 *
 * @param {string|Date} timestamp - ISO 형식의 타임스탬프 또는 Date 객체
 * @returns {string} 포맷된 시간 (예: "3분 전", "2시간 전", "2024. 1. 15.")
 *
 * @example
 * formatUploadTime('2024-01-15T10:30:00Z') // "5분 전" (현재 시각에 따라 다름)
 */
export function formatUploadTime(timestamp) {
  // 유효성 검사
  if (!timestamp) {
    return '방금 전'
  }

  const past = new Date(timestamp)

  // 잘못된 날짜 처리
  if (isNaN(past.getTime())) {
    return '방금 전'
  }

  const now = new Date()
  const diffInSeconds = Math.floor((now - past) / 1000)

  // 10초 미만
  if (diffInSeconds < 10) {
    return '방금 전'
  }

  // 1분 미만
  if (diffInSeconds < 60) {
    return `${diffInSeconds}초 전`
  }

  // 1시간 미만
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes}분 전`
  }

  // 24시간 미만
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}시간 전`
  }

  // 24시간 이상은 날짜로 표시
  return past.toLocaleDateString('ko-KR')
}
