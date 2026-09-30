import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/r2Service.js', () => ({ r2Service: { getDownloadUrl: vi.fn() } }))

import { openFileInNewTab } from './openFile.js'
import { r2Service } from '../services/r2Service.js'

const file = { name: 'p.png', roomId: 'r', url: 'https://store.example/r/p.png' }

describe('openFileInNewTab', () => {
  beforeEach(() => { r2Service.getDownloadUrl.mockReset() })

  it('탭을 먼저 동기 호출로 열고 presigned URL을 설정한다', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://presigned.example/p.png')
    const tab = { location: { href: '' } }
    const open = vi.fn(() => tab)

    await openFileInNewTab(file, { open })

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.location.href).toBe('https://presigned.example/p.png')
  })

  it('presigned 발급에 실패했을 때만 store URL을 쓴다', async () => {
    r2Service.getDownloadUrl.mockImplementation(async () => { throw new Error('down') })
    const tab = { location: { href: '' } }

    await openFileInNewTab(file, { open: () => tab })

    expect(tab.location.href).toBe(file.url)
  })

  it('팝업이 차단되어 탭이 없으면 URL로 한 번 더 열기를 시도한다', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://presigned.example/p.png')
    const open = vi.fn(() => null)

    await openFileInNewTab(file, { open })

    expect(open).toHaveBeenLastCalledWith('https://presigned.example/p.png', '_blank')
  })
})
