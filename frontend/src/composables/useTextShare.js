/**
 * @composable useTextShare
 * @description 룸 내에서 텍스트를 공유하는 기능을 제공하는 컴포저블.
 *              사용자가 붙여넣기를 통해 텍스트를 추가, 삭제, 클립보드 복사할 수 있습니다.
 *
 * Vue 3 Best Practice:
 * - ref를 사용한 반응형 상태 관리
 * - computed를 사용한 파생 상태
 * - 명확한 함수 명명과 JSDoc 주석
 */
import { ref, computed } from 'vue'

export function useTextShare() {
  /**
   * 공유된 텍스트 목록
   * @type {import('vue').Ref<Array<{id: string, content: string, timestamp: number}>>}
   */
  const sharedTexts = ref([])

  /**
   * 텍스트 개수
   * @type {import('vue').ComputedRef<number>}
   */
  const textCount = computed(() => sharedTexts.value.length)

  /**
   * 고유 ID 생성
   * @returns {string} 고유 ID
   */
  function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 새로운 텍스트를 추가합니다.
   *
   * @param {string} content - 추가할 텍스트 내용
   * @returns {object|null} 추가된 텍스트 객체 또는 null (빈 텍스트인 경우)
   */
  function addText(content) {
    // 빈 텍스트는 추가하지 않음
    if (!content || content.trim().length === 0) {
      return null
    }

    const newText = {
      id: generateId(),
      content: content.trim(),
      timestamp: Date.now()
    }

    sharedTexts.value.push(newText)
    return newText
  }

  /**
   * ID로 텍스트를 삭제합니다.
   *
   * @param {string} id - 삭제할 텍스트의 ID
   * @returns {boolean} 삭제 성공 여부
   */
  function removeText(id) {
    const index = sharedTexts.value.findIndex(text => text.id === id)
    if (index !== -1) {
      sharedTexts.value.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 모든 텍스트를 삭제합니다.
   */
  function clearAllTexts() {
    sharedTexts.value = []
  }

  /**
   * 특정 텍스트를 클립보드에 복사합니다.
   *
   * @param {string} id - 복사할 텍스트의 ID
   * @returns {Promise<{success: boolean, error?: Error}>} 복사 결과
   */
  async function copyTextToClipboard(id) {
    try {
      const text = sharedTexts.value.find(t => t.id === id)
      if (!text) {
        throw new Error('텍스트를 찾을 수 없습니다')
      }

      await navigator.clipboard.writeText(text.content)
      return { success: true }
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  return {
    sharedTexts,
    textCount,
    addText,
    removeText,
    clearAllTexts,
    copyTextToClipboard
  }
}
