import { describe, it, expect, vi } from 'vitest'
import { applyFileMessage } from './applyFileMessage'

describe('applyFileMessage 잠긴 파일', () => {
  it('url 없이 locked 메시지를 목록에 추가한다', () => {
    const fm = { addFile: vi.fn(() => true), removeFile: vi.fn(), clearRoomFiles: vi.fn() }
    const r = applyFileMessage({ type: 'file-uploaded', locked: true, fileName: 'abc', size: 10, created: '2026-10-13T00:00:00Z', roomId: 'room-1' }, fm)
    expect(r).toBe('added')
    expect(fm.addFile).toHaveBeenCalledWith({ name: 'abc', locked: true, size: 10, created: '2026-10-13T00:00:00Z', roomId: 'room-1' })
  })

  it('정보가 부족한 locked 메시지는 reload', () => {
    const fm = { addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn() }
    expect(applyFileMessage({ type: 'file-uploaded', locked: true, fileName: 'abc', roomId: 'r' }, fm)).toBe('reload')
  })
})
