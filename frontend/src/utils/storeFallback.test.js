import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/r2Service.js', () => ({
  r2Service: { getDownloadUrl: vi.fn(), publicUrl: 'https://store.example' }
}))
vi.mock('./analytics.js', () => ({ trackEvent: vi.fn() }))

import { fetchOriginal, fileFromStoreUrl } from './storeFallback.js'
import { openFileInNewTab } from './openFile.js'
import { useDownload } from '../composables/useDownload.js'
import { useClipboard } from '../composables/useClipboard.js'
import { r2Service } from '../services/r2Service.js'
import { trackEvent } from './analytics.js'

const file = { name: 'a b.png', roomId: 'r1', url: 'https://store.example/r1/a%20b.png', size: 3 * 1048576 }
const okRes = { ok: true, blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })) }

beforeEach(() => {
  vi.clearAllMocks()
  r2Service.getDownloadUrl.mockReset()
  global.fetch = vi.fn()
  Object.defineProperty(global.navigator, 'clipboard', {
    value: { write: vi.fn().mockResolvedValue(undefined) }, writable: true, configurable: true
  })
  global.ClipboardItem = class { constructor(o) { this.o = o } }
})

describe('fetchOriginal', () => {
  it('presigned를 먼저 fetch하고 이벤트는 보내지 않는다', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://pre.example/x')
    fetch.mockResolvedValue(okRes)
    await fetchOriginal(file, 'copy_files')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://pre.example/x')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('presigned 발급 실패 시 store로 폴백하고 store_fallback을 보낸다', async () => {
    r2Service.getDownloadUrl.mockRejectedValue(new Error('down'))
    fetch.mockResolvedValue(okRes)
    await fetchOriginal(file, 'copy_files')
    expect(fetch).toHaveBeenCalledWith(file.url)
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', { path: 'copy_files', size_mb: 3, reason: 'presign_failed' })
  })

  it('presigned fetch가 CORS 등으로 던지면 store로 폴백한다 (reason=cors)', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://pre.example/x')
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(okRes)
    await fetchOriginal(file, 'copy_image')
    expect(fetch).toHaveBeenLastCalledWith(file.url)
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', { path: 'copy_image', size_mb: 3, reason: 'cors' })
  })

  it('fileFromStoreUrl이 roomId/name을 복원한다', () => {
    expect(fileFromStoreUrl(file.url)).toEqual({ url: file.url, roomId: 'r1', name: 'a b.png' })
    expect(fileFromStoreUrl('https://other/x.png')).toEqual({ url: 'https://other/x.png' })
  })
})

describe('복사 경로', () => {
  it('copyFilesToClipboard: presigned 우선, 이벤트 없음', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://pre.example/x')
    fetch.mockResolvedValue(okRes)
    const r = await useDownload().copyFilesToClipboard([file])
    expect(r.success).toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://pre.example/x')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('copyFilesToClipboard: 발급 실패 시 store 폴백 + 이벤트', async () => {
    r2Service.getDownloadUrl.mockRejectedValue(new Error('x'))
    fetch.mockResolvedValue(okRes)
    const r = await useDownload().copyFilesToClipboard([file])
    expect(r.success).toBe(true)
    expect(fetch).toHaveBeenCalledWith(file.url)
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', expect.objectContaining({ path: 'copy_files', reason: 'presign_failed' }))
  })

  it('copyImage: store URL에서 룸/파일명을 복원해 presigned 우선', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://pre.example/x')
    fetch.mockResolvedValue(okRes)
    const r = await useClipboard().copyImage(file.url)
    expect(r.success).toBe(true)
    expect(r2Service.getDownloadUrl).toHaveBeenCalledWith('r1', 'a b.png')
    expect(fetch).toHaveBeenCalledWith('https://pre.example/x')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('copyImage: 발급 실패 시 store 폴백 + 이벤트', async () => {
    r2Service.getDownloadUrl.mockRejectedValue(new Error('x'))
    fetch.mockResolvedValue(okRes)
    await useClipboard().copyImage(file.url)
    expect(fetch).toHaveBeenCalledWith(file.url)
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', expect.objectContaining({ path: 'copy_image' }))
  })
})

describe('기존 폴백 지점 이벤트', () => {
  it('openFileInNewTab: 정상 presigned면 이벤트 없음, 실패 시 open_tab', async () => {
    r2Service.getDownloadUrl.mockResolvedValue('https://pre.example/x')
    await openFileInNewTab(file, { open: () => ({ location: {} }) })
    expect(trackEvent).not.toHaveBeenCalled()
    r2Service.getDownloadUrl.mockRejectedValue(new Error('x'))
    await openFileInNewTab(file, { open: () => ({ location: {} }) })
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', { path: 'open_tab', size_mb: 3, reason: 'presign_failed' })
  })

  it('downloadFile: presign 실패 시 download_blob 이벤트', async () => {
    r2Service.getDownloadUrl.mockRejectedValue(new Error('x'))
    fetch.mockResolvedValue(okRes)
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    await useDownload().downloadFile(file)
    expect(trackEvent).toHaveBeenCalledWith('store_fallback', expect.objectContaining({ path: 'download_blob' }))
  })
})
