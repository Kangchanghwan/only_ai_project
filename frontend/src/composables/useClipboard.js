/**
 * 클립보드 관련 기능을 제공하는 Composable
 */
export function useClipboard() {
  /**
   * 텍스트를 클립보드에 복사
   */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return { success: true }
    } catch (err) {
      console.error('텍스트 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 이미지를 클립보드에 복사
   */
  async function copyImage(imageUrl) {
    try {
      console.log('이미지 복사 시작:', imageUrl)

      const response = await fetch(imageUrl)
      const blob = await response.blob()

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])

      console.log('이미지 복사 성공')
      return { success: true }
    } catch (err) {
      console.error('이미지 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 붙여넣기 이벤트에서 이미지 파일 추출
   */
  function extractImagesFromPaste(event) {
    const items = event.clipboardData?.items
    if (!items) return []

    const imageFiles = []

    for (let item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    return imageFiles
  }

  return {
    copyText,
    copyImage,
    extractImagesFromPaste
  }
}
