import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { notificationService } from './notificationService'

describe('NotificationService', () => {
  beforeEach(() => {
    // 각 테스트 전 상태 초기화
    notificationService.notification.value = null
    notificationService.uploads.value = new Map()
    if (notificationService.currentTimer) {
      clearTimeout(notificationService.currentTimer)
      notificationService.currentTimer = null
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('기존 알림 기능', () => {
    it('알림을 표시할 수 있어야 한다', () => {
      notificationService.showNotification('테스트 메시지')
      expect(notificationService.notification.value).toBe('테스트 메시지')
    })

    it('알림을 숨길 수 있어야 한다', () => {
      notificationService.showNotification('테스트 메시지')
      notificationService.hideNotification()
      expect(notificationService.notification.value).toBeNull()
    })
  })

  describe('업로드 진행률 관리', () => {
    describe('addUpload', () => {
      it('업로드를 추가할 수 있어야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')

        expect(notificationService.uploads.value.has(uploadId)).toBe(true)
        const upload = notificationService.uploads.value.get(uploadId)
        expect(upload.fileName).toBe('test.png')
        expect(upload.percent).toBe(0)
        expect(upload.status).toBe('uploading')
      })

      it('여러 업로드를 동시에 추가할 수 있어야 한다', () => {
        notificationService.addUpload('upload-1', 'file1.png')
        notificationService.addUpload('upload-2', 'file2.jpg')
        notificationService.addUpload('upload-3', 'file3.pdf')

        expect(notificationService.uploads.value.size).toBe(3)
      })
    })

    describe('updateUpload', () => {
      it('업로드 진행률을 업데이트할 수 있어야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')

        notificationService.updateUpload(uploadId, 50)

        const upload = notificationService.uploads.value.get(uploadId)
        expect(upload.percent).toBe(50)
        expect(upload.status).toBe('uploading')
      })

      it('존재하지 않는 업로드 ID로 업데이트해도 에러가 발생하지 않아야 한다', () => {
        expect(() => {
          notificationService.updateUpload('non-existent', 50)
        }).not.toThrow()
      })

      it('진행률이 100이 되어도 상태는 uploading을 유지해야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')

        notificationService.updateUpload(uploadId, 100)

        const upload = notificationService.uploads.value.get(uploadId)
        expect(upload.percent).toBe(100)
        expect(upload.status).toBe('uploading')
      })
    })

    describe('completeUpload', () => {
      it('업로드를 완료 상태로 변경할 수 있어야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')
        notificationService.updateUpload(uploadId, 100)

        notificationService.completeUpload(uploadId)

        const upload = notificationService.uploads.value.get(uploadId)
        expect(upload.status).toBe('completed')
        expect(upload.percent).toBe(100)
      })

      it('존재하지 않는 업로드 ID로 완료해도 에러가 발생하지 않아야 한다', () => {
        expect(() => {
          notificationService.completeUpload('non-existent')
        }).not.toThrow()
      })
    })

    describe('failUpload', () => {
      it('업로드를 실패 상태로 변경할 수 있어야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')

        notificationService.failUpload(uploadId, '네트워크 오류')

        const upload = notificationService.uploads.value.get(uploadId)
        expect(upload.status).toBe('failed')
        expect(upload.error).toBe('네트워크 오류')
      })

      it('존재하지 않는 업로드 ID로 실패 처리해도 에러가 발생하지 않아야 한다', () => {
        expect(() => {
          notificationService.failUpload('non-existent', '오류')
        }).not.toThrow()
      })
    })

    describe('removeUpload', () => {
      it('업로드를 목록에서 제거할 수 있어야 한다', () => {
        const uploadId = 'upload-1'
        notificationService.addUpload(uploadId, 'test.png')

        notificationService.removeUpload(uploadId)

        expect(notificationService.uploads.value.has(uploadId)).toBe(false)
      })

      it('존재하지 않는 업로드 ID를 제거해도 에러가 발생하지 않아야 한다', () => {
        expect(() => {
          notificationService.removeUpload('non-existent')
        }).not.toThrow()
      })

      it('여러 업로드 중 하나만 제거할 수 있어야 한다', () => {
        notificationService.addUpload('upload-1', 'file1.png')
        notificationService.addUpload('upload-2', 'file2.jpg')
        notificationService.addUpload('upload-3', 'file3.pdf')

        notificationService.removeUpload('upload-2')

        expect(notificationService.uploads.value.size).toBe(2)
        expect(notificationService.uploads.value.has('upload-1')).toBe(true)
        expect(notificationService.uploads.value.has('upload-2')).toBe(false)
        expect(notificationService.uploads.value.has('upload-3')).toBe(true)
      })
    })

    describe('clearAllUploads', () => {
      it('모든 업로드를 제거할 수 있어야 한다', () => {
        notificationService.addUpload('upload-1', 'file1.png')
        notificationService.addUpload('upload-2', 'file2.jpg')

        notificationService.clearAllUploads()

        expect(notificationService.uploads.value.size).toBe(0)
      })
    })
  })

  describe('업로드 흐름 시나리오', () => {
    it('전체 업로드 흐름이 정상적으로 동작해야 한다', () => {
      const uploadId = 'upload-1'

      // 1. 업로드 시작
      notificationService.addUpload(uploadId, 'test.png')
      expect(notificationService.uploads.value.get(uploadId).status).toBe('uploading')

      // 2. 진행률 업데이트
      notificationService.updateUpload(uploadId, 25)
      expect(notificationService.uploads.value.get(uploadId).percent).toBe(25)

      notificationService.updateUpload(uploadId, 50)
      expect(notificationService.uploads.value.get(uploadId).percent).toBe(50)

      notificationService.updateUpload(uploadId, 100)
      expect(notificationService.uploads.value.get(uploadId).percent).toBe(100)

      // 3. 완료
      notificationService.completeUpload(uploadId)
      expect(notificationService.uploads.value.get(uploadId).status).toBe('completed')

      // 4. 제거
      notificationService.removeUpload(uploadId)
      expect(notificationService.uploads.value.has(uploadId)).toBe(false)
    })

    it('병렬 업로드 시나리오가 정상적으로 동작해야 한다', () => {
      // 3개 파일 동시 업로드 시작
      notificationService.addUpload('upload-1', 'file1.png')
      notificationService.addUpload('upload-2', 'file2.jpg')
      notificationService.addUpload('upload-3', 'file3.pdf')

      // 각각 다른 진행률
      notificationService.updateUpload('upload-1', 80)
      notificationService.updateUpload('upload-2', 30)
      notificationService.updateUpload('upload-3', 100)

      expect(notificationService.uploads.value.get('upload-1').percent).toBe(80)
      expect(notificationService.uploads.value.get('upload-2').percent).toBe(30)
      expect(notificationService.uploads.value.get('upload-3').percent).toBe(100)

      // 첫 번째 완료
      notificationService.completeUpload('upload-3')
      expect(notificationService.uploads.value.get('upload-3').status).toBe('completed')

      // 두 번째 실패
      notificationService.failUpload('upload-2', '용량 초과')
      expect(notificationService.uploads.value.get('upload-2').status).toBe('failed')

      // 세 번째 완료
      notificationService.updateUpload('upload-1', 100)
      notificationService.completeUpload('upload-1')
      expect(notificationService.uploads.value.get('upload-1').status).toBe('completed')
    })
  })
})
