import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyFileMessage } from './applyFileMessage'
import { useFileManager } from '../composables/useFileManager'

vi.mock('../services/r2Service', () => ({
  r2Service: {
    loadFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    deleteAllFiles: vi.fn(),
    getFileUrl: vi.fn(),
    getRoomTotalSize: vi.fn(),
    getUploadUrls: vi.fn(),
    putToPresignedUrl: vi.fn(),
    getThumbUrl: vi.fn()
  }
}))

const uploaded = {
  type: 'file-uploaded',
  fileName: 'photo.png',
  url: 'https://store/room-x/photo.png',
  roomId: 'room-x',
  size: 1234,
  created: '2026-09-11T00:00:00.000Z'
}

describe('applyFileMessage', () => {
  let fm

  beforeEach(() => {
    fm = useFileManager()
  })

  it('size와 created가 있는 file-uploaded는 목록에 추가하고 added를 반환한다', () => {
    const action = applyFileMessage(uploaded, fm)

    expect(action).toBe('added')
    expect(fm.files.value).toEqual([
      { name: 'photo.png', url: 'https://store/room-x/photo.png', size: 1234, created: uploaded.created, roomId: 'room-x' }
    ])
  })

  it('이미 있는 파일(예: 내가 올린 파일의 브로드캐스트)은 updated를 반환하고 중복 추가하지 않는다', () => {
    fm.addFile({ name: 'photo.png', url: uploaded.url, size: 1234, created: uploaded.created, roomId: 'room-x' })

    expect(applyFileMessage(uploaded, fm)).toBe('updated')
    expect(fm.files.value).toHaveLength(1)
  })

  it('size나 created가 없는 구버전 file-uploaded는 reload를 반환하고 목록을 바꾸지 않는다', () => {
    const legacy = { type: 'file-uploaded', fileName: 'x.png', url: 'u', roomId: 'room-x' }

    expect(applyFileMessage(legacy, fm)).toBe('reload')
    expect(fm.files.value).toEqual([])
  })

  it('file-deleted는 해당 파일을 제거하고 removed를 반환한다', () => {
    fm.addFile({ name: 'photo.png', url: 'u', size: 1, created: 'c', roomId: 'room-x' })

    expect(applyFileMessage({ type: 'file-deleted', fileName: 'photo.png', roomId: 'room-x' }, fm)).toBe('removed')
    expect(fm.files.value).toEqual([])
  })

  it('file-deleted가 목록에 없는 파일을 가리키면 ignored를 반환한다', () => {
    expect(applyFileMessage({ type: 'file-deleted', fileName: 'ghost.png', roomId: 'room-x' }, fm)).toBe('ignored')
  })

  it('files-cleared는 해당 룸의 파일만 비우고 cleared를 반환한다', () => {
    fm.addFile({ name: 'a.png', url: 'u', size: 1, created: 'c', roomId: 'room-x' })
    fm.addFile({ name: 'b.png', url: 'u', size: 1, created: 'c', roomId: 'room-y' })

    expect(applyFileMessage({ type: 'files-cleared', roomId: 'room-x' }, fm)).toBe('cleared')
    expect(fm.files.value.map(f => f.roomId)).toEqual(['room-y'])
  })

  it('파일과 무관한 메시지나 잘못된 입력은 ignored를 반환한다', () => {
    expect(applyFileMessage({ type: 'text-shared', content: 'hi' }, fm)).toBe('ignored')
    expect(applyFileMessage(null, fm)).toBe('ignored')
    expect(applyFileMessage('nope', fm)).toBe('ignored')
  })
})
