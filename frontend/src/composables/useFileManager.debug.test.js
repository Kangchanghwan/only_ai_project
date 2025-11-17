import { describe, it, expect } from 'vitest'

/**
 * 디버깅 테스트 - Supabase API 응답 형식 확인
 */
describe('Supabase API 응답 형식 디버깅', () => {
  it('빈 배열 반환 시나리오 1: 폴더가 비어있음', () => {
    const mockResponse = { data: [], error: null }

    const files = mockResponse.data
      .filter(file => file.name !== '.emptyFolderPlaceholder')
      .map(file => ({
        name: file.name,
        url: `https://example.com/${file.name}`,
        created: file.created_at
      }))

    expect(files).toEqual([])
  })

  it('빈 배열 반환 시나리오 2: 폴더 자체가 없음', () => {
    // Supabase는 존재하지 않는 폴더에 대해 빈 배열 반환
    const mockResponse = { data: [], error: null }

    expect(mockResponse.data).toEqual([])
  })

  it('파일이 있는 경우 정상 파싱', () => {
    const mockResponse = {
      data: [
        {
          name: '1234567890.png',
          id: 'some-id',
          created_at: '2025-11-17T05:00:00Z',
          updated_at: '2025-11-17T05:00:00Z',
          last_accessed_at: '2025-11-17T05:00:00Z',
          metadata: null
        }
      ],
      error: null
    }

    const files = mockResponse.data
      .filter(file => file.name !== '.emptyFolderPlaceholder' && file.id !== null)
      .map(file => ({
        name: file.name,
        url: `https://example.com/test/ROOM01/${file.name}`,
        created: file.created_at
      }))

    expect(files.length).toBe(1)
    expect(files[0].name).toBe('1234567890.png')
  })

  it('폴더와 파일이 섞여있는 경우 폴더 필터링', () => {
    const mockResponse = {
      data: [
        {
          name: 'subfolder',
          id: null, // 폴더는 id가 null
          created_at: '2025-11-17T05:00:00Z'
        },
        {
          name: 'file.png',
          id: 'file-id',
          created_at: '2025-11-17T05:00:00Z'
        }
      ],
      error: null
    }

    const files = mockResponse.data
      .filter(file => file.id !== null && !file.name.endsWith('/'))

    expect(files.length).toBe(1)
    expect(files[0].name).toBe('file.png')
  })

  it('실제 업로드 경로 확인', () => {
    const roomId = 'ABC123'
    const fileName = '1234567890.png'
    const uploadPath = `${roomId}/${fileName}`

    expect(uploadPath).toBe('ABC123/1234567890.png')

    // list 호출 시 경로
    const listPath = roomId

    expect(listPath).toBe('ABC123')
  })
})
