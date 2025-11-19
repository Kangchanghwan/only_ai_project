import { describe, it, expect, beforeEach, vi } from 'vitest'

// Supabase 클라이언트 모킹 함수들
let mockList = vi.fn()
let mockUpload = vi.fn()
let mockRemove = vi.fn()

// Supabase 클라이언트 모킹
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        list: mockList,
        upload: mockUpload,
        remove: mockRemove
      }))
    }
  }))
}))

// 모킹 후에 import
import { supabaseService } from './supabaseService'

describe('SupabaseService - 룸 용량 관리', () => {
  beforeEach(() => {
    // 각 테스트 전에 mock 초기화
    vi.clearAllMocks()
  })

  describe('getRoomTotalSize', () => {
    it('룸의 총 파일 용량을 바이트 단위로 반환해야 한다', async () => {
      // Given: 룸에 여러 파일이 있음
      const mockFiles = [
        { name: 'file1.jpg', id: '1', metadata: { size: 1024 } },
        { name: 'file2.png', id: '2', metadata: { size: 2048 } },
        { name: 'file3.pdf', id: '3', metadata: { size: 4096 } }
      ]

      mockList.mockResolvedValueOnce({
        data: mockFiles,
        error: null
      })

      // When: 룸의 총 용량을 조회
      const totalSize = await supabaseService.getRoomTotalSize('123456')

      // Then: 모든 파일 크기의 합을 반환
      expect(totalSize).toBe(1024 + 2048 + 4096) // 7168 bytes
    })

    it('파일이 없는 룸의 경우 0을 반환해야 한다', async () => {
      // Given: 빈 룸
      mockList.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // When: 룸의 총 용량을 조회
      const totalSize = await supabaseService.getRoomTotalSize('123456')

      // Then: 0 반환
      expect(totalSize).toBe(0)
    })

    it('파일에 size 메타데이터가 없는 경우 0으로 처리해야 한다', async () => {
      // Given: size 메타데이터가 없는 파일들
      const mockFiles = [
        { name: 'file1.jpg', id: '1', metadata: {} },
        { name: 'file2.png', id: '2', metadata: { size: 1024 } },
        { name: 'file3.pdf', id: '3' } // metadata 자체가 없음
      ]

      mockList.mockResolvedValueOnce({
        data: mockFiles,
        error: null
      })

      // When: 룸의 총 용량을 조회
      const totalSize = await supabaseService.getRoomTotalSize('123456')

      // Then: size가 있는 파일만 계산
      expect(totalSize).toBe(1024)
    })

    it('Supabase 에러 발생 시 에러를 throw해야 한다', async () => {
      // Given: Supabase 에러
      const mockError = new Error('Supabase error')
      mockList.mockResolvedValueOnce({
        data: null,
        error: mockError
      })

      // When/Then: 에러를 throw
      await expect(supabaseService.getRoomTotalSize('123456')).rejects.toThrow(
        'Supabase error'
      )
    })

    it('roomId가 없는 경우 에러를 throw해야 한다', async () => {
      // When/Then: roomId 없이 호출하면 에러
      await expect(supabaseService.getRoomTotalSize()).rejects.toThrow(
        'roomId는 필수입니다'
      )
    })

    it('.emptyFolderPlaceholder 파일은 용량 계산에서 제외해야 한다', async () => {
      // Given: 플레이스홀더 파일이 포함된 파일 목록
      const mockFiles = [
        { name: '.emptyFolderPlaceholder', id: '0', metadata: { size: 100 } },
        { name: 'file1.jpg', id: '1', metadata: { size: 1024 } }
      ]

      mockList.mockResolvedValueOnce({
        data: mockFiles,
        error: null
      })

      // When: 룸의 총 용량을 조회
      const totalSize = await supabaseService.getRoomTotalSize('123456')

      // Then: 플레이스홀더 제외한 크기만 반환
      expect(totalSize).toBe(1024)
    })
  })
})
