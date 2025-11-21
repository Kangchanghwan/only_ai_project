import { describe, it, expect, beforeEach } from 'vitest'
import { useNotification } from './useNotification'
import { notificationService } from '../services/notificationService'

describe('useNotification', () => {
  let notification

  beforeEach(() => {
    notification = useNotification()
    // 상태 초기화
    notificationService.notification.value = null
    notificationService.uploads.value = new Map()
  })

  describe('uploads 상태', () => {
    it('uploads 상태를 readonly로 제공해야 한다', () => {
      expect(notification.uploads).toBeDefined()
    })

    it('uploads는 Map이어야 한다', () => {
      expect(notification.uploads.value instanceof Map).toBe(true)
    })
  })

  describe('업로드 메서드', () => {
    it('addUpload 메서드를 제공해야 한다', () => {
      expect(typeof notification.addUpload).toBe('function')
    })

    it('updateUpload 메서드를 제공해야 한다', () => {
      expect(typeof notification.updateUpload).toBe('function')
    })

    it('completeUpload 메서드를 제공해야 한다', () => {
      expect(typeof notification.completeUpload).toBe('function')
    })

    it('failUpload 메서드를 제공해야 한다', () => {
      expect(typeof notification.failUpload).toBe('function')
    })

    it('removeUpload 메서드를 제공해야 한다', () => {
      expect(typeof notification.removeUpload).toBe('function')
    })

    it('clearAllUploads 메서드를 제공해야 한다', () => {
      expect(typeof notification.clearAllUploads).toBe('function')
    })
  })

  describe('메서드 동작', () => {
    it('addUpload를 호출하면 uploads에 추가되어야 한다', () => {
      notification.addUpload('test-id', 'test.png')

      // notificationService를 통해 확인 (readonly라서 직접 수정은 안됨)
      expect(notificationService.uploads.value.has('test-id')).toBe(true)
    })

    it('updateUpload를 호출하면 진행률이 업데이트되어야 한다', () => {
      notification.addUpload('test-id', 'test.png')
      notification.updateUpload('test-id', 50)

      const upload = notificationService.uploads.value.get('test-id')
      expect(upload.percent).toBe(50)
    })

    it('completeUpload를 호출하면 상태가 completed로 변경되어야 한다', () => {
      notification.addUpload('test-id', 'test.png')
      notification.completeUpload('test-id')

      const upload = notificationService.uploads.value.get('test-id')
      expect(upload.status).toBe('completed')
    })

    it('failUpload를 호출하면 상태가 failed로 변경되어야 한다', () => {
      notification.addUpload('test-id', 'test.png')
      notification.failUpload('test-id', '에러')

      const upload = notificationService.uploads.value.get('test-id')
      expect(upload.status).toBe('failed')
      expect(upload.error).toBe('에러')
    })

    it('removeUpload를 호출하면 uploads에서 제거되어야 한다', () => {
      notification.addUpload('test-id', 'test.png')
      notification.removeUpload('test-id')

      expect(notificationService.uploads.value.has('test-id')).toBe(false)
    })

    it('clearAllUploads를 호출하면 모든 uploads가 제거되어야 한다', () => {
      notification.addUpload('test-1', 'file1.png')
      notification.addUpload('test-2', 'file2.png')
      notification.clearAllUploads()

      expect(notificationService.uploads.value.size).toBe(0)
    })
  })
})
