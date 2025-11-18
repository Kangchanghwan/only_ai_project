import { describe, it, expect, beforeEach } from 'vitest'
import { useTextShare } from './useTextShare'

describe('useTextShare', () => {
  let textShare

  beforeEach(() => {
    textShare = useTextShare()
  })

  describe('텍스트 추가', () => {
    it('텍스트를 추가할 수 있어야 한다', () => {
      textShare.addText('Hello World')

      expect(textShare.sharedTexts.value).toHaveLength(1)
      expect(textShare.sharedTexts.value[0].content).toBe('Hello World')
      expect(textShare.sharedTexts.value[0].timestamp).toBeDefined()
      expect(textShare.sharedTexts.value[0].id).toBeDefined()
    })

    it('여러 텍스트를 추가할 수 있어야 한다', () => {
      textShare.addText('First text')
      textShare.addText('Second text')
      textShare.addText('Third text')

      expect(textShare.sharedTexts.value).toHaveLength(3)
      expect(textShare.sharedTexts.value[0].content).toBe('First text')
      expect(textShare.sharedTexts.value[1].content).toBe('Second text')
      expect(textShare.sharedTexts.value[2].content).toBe('Third text')
    })

    it('빈 텍스트는 추가하지 않아야 한다', () => {
      textShare.addText('')
      textShare.addText('   ')

      expect(textShare.sharedTexts.value).toHaveLength(0)
    })

    it('각 텍스트는 고유한 ID를 가져야 한다', () => {
      textShare.addText('Text 1')
      textShare.addText('Text 2')

      const ids = textShare.sharedTexts.value.map(t => t.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(2)
    })
  })

  describe('텍스트 삭제', () => {
    it('ID로 텍스트를 삭제할 수 있어야 한다', () => {
      textShare.addText('Text to delete')
      const textId = textShare.sharedTexts.value[0].id

      textShare.removeText(textId)

      expect(textShare.sharedTexts.value).toHaveLength(0)
    })

    it('존재하지 않는 ID로 삭제하면 아무 일도 일어나지 않아야 한다', () => {
      textShare.addText('Text 1')
      textShare.addText('Text 2')

      textShare.removeText('non-existent-id')

      expect(textShare.sharedTexts.value).toHaveLength(2)
    })

    it('특정 텍스트만 삭제되어야 한다', () => {
      textShare.addText('Text 1')
      textShare.addText('Text 2')
      textShare.addText('Text 3')

      const textId = textShare.sharedTexts.value[1].id
      textShare.removeText(textId)

      expect(textShare.sharedTexts.value).toHaveLength(2)
      expect(textShare.sharedTexts.value[0].content).toBe('Text 1')
      expect(textShare.sharedTexts.value[1].content).toBe('Text 3')
    })
  })

  describe('모든 텍스트 삭제', () => {
    it('모든 텍스트를 한번에 삭제할 수 있어야 한다', () => {
      textShare.addText('Text 1')
      textShare.addText('Text 2')
      textShare.addText('Text 3')

      textShare.clearAllTexts()

      expect(textShare.sharedTexts.value).toHaveLength(0)
    })

    it('빈 상태에서 모든 텍스트 삭제를 호출해도 에러가 발생하지 않아야 한다', () => {
      expect(() => textShare.clearAllTexts()).not.toThrow()
      expect(textShare.sharedTexts.value).toHaveLength(0)
    })
  })

  describe('텍스트 복사', () => {
    it('특정 텍스트를 클립보드에 복사할 수 있어야 한다', async () => {
      textShare.addText('Copy this text')
      const textId = textShare.sharedTexts.value[0].id

      const result = await textShare.copyTextToClipboard(textId)

      expect(result.success).toBe(true)
    })

    it('존재하지 않는 ID로 복사하면 실패해야 한다', async () => {
      const result = await textShare.copyTextToClipboard('non-existent-id')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('텍스트 개수', () => {
    it('텍스트 개수를 정확히 반환해야 한다', () => {
      expect(textShare.textCount.value).toBe(0)

      textShare.addText('Text 1')
      expect(textShare.textCount.value).toBe(1)

      textShare.addText('Text 2')
      textShare.addText('Text 3')
      expect(textShare.textCount.value).toBe(3)

      textShare.removeText(textShare.sharedTexts.value[0].id)
      expect(textShare.textCount.value).toBe(2)
    })
  })

  describe('텍스트 형식', () => {
    it('추가된 텍스트는 올바른 형식을 가져야 한다', () => {
      textShare.addText('Test content')
      const text = textShare.sharedTexts.value[0]

      expect(text).toHaveProperty('id')
      expect(text).toHaveProperty('content')
      expect(text).toHaveProperty('timestamp')
      expect(typeof text.id).toBe('string')
      expect(typeof text.content).toBe('string')
      expect(typeof text.timestamp).toBe('number')
    })

    it('timestamp는 현재 시간과 가까워야 한다', () => {
      const beforeTime = Date.now()
      textShare.addText('Test')
      const afterTime = Date.now()

      const timestamp = textShare.sharedTexts.value[0].timestamp

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })
  })
})
