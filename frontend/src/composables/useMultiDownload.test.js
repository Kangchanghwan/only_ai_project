import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useMultiDownload } from './useMultiDownload.js'

const MB = 1024 * 1024
const f = (name, mb) => ({ name, roomId: 'room-a', size: Math.round(mb * MB) })
const t = (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k)

function setup({ zipImpl, fileOk = true, inMemory = false, extra = {} } = {}) {
  const notification = { addUpload: vi.fn(), updateUpload: vi.fn(), completeUpload: vi.fn(), failUpload: vi.fn(), removeUpload: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }
  const download = { downloadFile: vi.fn(async () => ({ success: fileOk })) }
  const downloadZip = vi.fn(zipImpl || (async ({ onProgress }) => { onProgress(50); onProgress(100) }))
  const onSuccess = vi.fn()
  const m = useMultiDownload({ download, t, notification, onSuccess, downloadZip, zipInMemory: () => inMemory, now: () => new Date(2026, 10, 13, 9, 5), ...extra })
  return { m, notification, download, downloadZip, onSuccess }
}

describe('useMultiDownload', () => {
  it('작은 파일 여러 개: 시트 없이 ZIP 하나를 바로 받고, 다 받으면 "받았어요"와 성공 집계(zip)', async () => {
    const { m, downloadZip, notification, onSuccess, download } = setup()
    await m.start([f('a.jpg', 1), f('b.jpg', 2), f('a.jpg', 1)])
    expect(m.sheet.value).toBeNull()
    expect(download.downloadFile).not.toHaveBeenCalled()
    const arg = downloadZip.mock.calls[0][0]
    expect(arg.zipName).toBe('clipboard-share-20261113-0905.zip')
    expect(arg.names).toEqual(['a.jpg', 'b.jpg', 'a (2).jpg'])
    expect(notification.updateUpload).toHaveBeenCalledWith(expect.any(String), 50)
    expect(notification.showSuccess).toHaveBeenCalledWith('multiDownload.zipDone:{"count":3}')
    expect(onSuccess).toHaveBeenCalledWith(3, 'zip')
  })

  it('파일 1개면 브라우저로 바로 받고 "다운로드를 시작했어요"(완료라고 말하지 않음)', async () => {
    const { m, downloadZip, download, notification, onSuccess } = setup()
    await m.start([f('a.jpg', 1)])
    expect(downloadZip).not.toHaveBeenCalled()
    expect(download.downloadFile).toHaveBeenCalledTimes(1)
    expect(notification.showSuccess).toHaveBeenCalledWith('multiDownload.fileStarted')
    expect(onSuccess).toHaveBeenCalledWith(1, 'native')
  })

  it('큰 파일이 섞이면 시트를 열고 첫 건(ZIP)만 시작한다. 큰 파일은 사용자가 눌러야 받는다', async () => {
    const { m, downloadZip, download } = setup()
    await m.start([f('a', 1), f('b', 1), f('movie.mp4', 1200)])
    const items = m.sheet.value.items
    expect(items.map((i) => i.type)).toEqual(['zip', 'file'])
    expect(items[0].state).toBe('done')
    expect(items[1].state).toBe('idle')
    expect(downloadZip).toHaveBeenCalledTimes(1)
    expect(download.downloadFile).not.toHaveBeenCalled()
    await m.run(items[1])
    expect(download.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'movie.mp4' }))
    expect(items[1].state).toBe('started')
    m.close()
    await nextTick()
    expect(m.sheet.value).toBeNull()
  })

  it('묶음이 여럿이면 이름에 번호가 붙는다 (메모리 방식 300MB)', async () => {
    const { m } = setup({ inMemory: true })
    const items = m.buildItems([f('a', 150), f('b', 150), f('c', 150), f('d', 150)])
    expect(items.map((i) => i.zipName)).toEqual(['clipboard-share-20261113-0905-1.zip', 'clipboard-share-20261113-0905-2.zip'])
    expect(items.map((i) => [i.index, i.zipCount])).toEqual([[0, 2], [1, 2]])
  })

  it('ZIP 실패: 상태 failed, 오류 안내, 성공 집계 없음. 다시 누르면 다시 시도한다', async () => {
    let fail = true
    const { m, notification, onSuccess, downloadZip } = setup({ zipImpl: async () => { if (fail) throw Object.assign(new Error('x'), { code: 'ZIP_STALLED' }) } })
    await m.start([f('a', 1), f('b', 1), f('big', 300)])
    const zipItem = m.sheet.value.items[0]
    expect(zipItem.state).toBe('failed')
    expect(notification.showError).toHaveBeenCalledWith('multiDownload.zipFailed')
    expect(onSuccess).not.toHaveBeenCalled()
    fail = false
    await m.run(zipItem)
    expect(zipItem.state).toBe('done')
    expect(downloadZip).toHaveBeenCalledTimes(2)
  })

  it('받는 중인 항목은 다시 눌러도 두 번 시작하지 않는다', async () => {
    let release
    const { m, downloadZip } = setup({ zipImpl: () => new Promise((r) => { release = r }) })
    const p = m.start([f('a', 1), f('b', 1), f('big', 300)])
    await nextTick()
    const zipItem = m.sheet.value.items[0]
    expect(zipItem.state).toBe('running')
    await m.run(zipItem)
    expect(downloadZip).toHaveBeenCalledTimes(1)
    release()
    await p
  })
})

describe('useMultiDownload: 방(잠긴) 파일', () => {
  const lf = (id, mb) => ({ name: id, roomId: 'prv-g-x', size: Math.round(mb * MB), locked: true })

  it('원래 이름을 풀어 ZIP 안 이름으로 쓰고, getLockedEntry를 ZIP 받기에 넘긴다', async () => {
    const getLockedEntry = vi.fn()
    const resolveNames = vi.fn(async (files) => files.map((f) => ({ ...f, zipName: '계약서.pdf' })))
    const { m, downloadZip } = setup({ extra: { resolveNames, getLockedEntry } })
    await m.start([lf('id1', 1), lf('id2', 1)])
    const arg = downloadZip.mock.calls[0][0]
    expect(arg.names).toEqual(['계약서.pdf', '계약서 (2).pdf'])
    expect(arg.files.map((f) => f.name)).toEqual(['id1', 'id2'])
    expect(arg.getLockedEntry).toBe(getLockedEntry)
  })

  it('200MB 넘는 방 파일은 따로: 누르면 downloadLockedFile로 이 기기에서 풀어 받고 "받음"', async () => {
    const downloadLockedFile = vi.fn(async () => ({ success: true }))
    const resolveNames = async (files) => files.map((f) => ({ ...f, zipName: 'n-' + f.name }))
    const { m, download, onSuccess } = setup({ extra: { resolveNames, downloadLockedFile } })
    await m.start([lf('a', 1), lf('b', 1), lf('big', 300)])
    const items = m.sheet.value.items
    expect(items[1].file.zipName).toBe('n-big')
    await m.run(items[1])
    expect(downloadLockedFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'big' }))
    expect(download.downloadFile).not.toHaveBeenCalled()
    expect(items[1].state).toBe('done')
    expect(onSuccess).toHaveBeenCalledWith(1, 'locked')
  })

  it('이름을 풀지 못하면 ZIP을 시작하지 않고 실패를 알린다', async () => {
    const { m, downloadZip, notification } = setup({ extra: { resolveNames: async () => { throw new Error('NEED_PASSWORD') } } })
    await m.start([lf('a', 1), lf('b', 1)])
    expect(downloadZip).not.toHaveBeenCalled()
    expect(notification.showError).toHaveBeenCalledWith('multiDownload.zipFailed')
  })
})
