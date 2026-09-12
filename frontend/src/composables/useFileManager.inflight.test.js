import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'

vi.mock('../services/r2Service', () => ({
  r2Service: {
    loadFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    deleteAllFiles: vi.fn(),
    getFileUrl: vi.fn(),
    getRoomTotalSize: vi.fn()
  }
}))

/** 호출자가 원하는 시점에 완료시킬 수 있는 loadFiles 응답 */
function deferredListing() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  r2Service.loadFiles.mockReturnValue(promise)
  return (files, nextToken = null) => resolve({ files, nextToken })
}

const listed = (name, size = 5) => ({
  name,
  url: `https://example.com/${name}`,
  created: '2026-01-01T00:00:00.000Z',
  size,
  type: 'application/octet-stream'
})

const socketFile = (roomId, name, size = 10) => ({
  name,
  url: `https://example.com/${roomId}/${name}`,
  size,
  created: '2026-09-12T00:00:00.000Z',
  roomId
})

const names = fm => fm.files.value.map(f => `${f.roomId}::${f.name}`)

describe('useFileManager — 목록 조회 중 발생한 변경(소켓/로컬) 보존', () => {
  let fileManager

  beforeEach(() => {
    vi.resetAllMocks()
    fileManager = useFileManager()
  })

  it('조회 중 addFile로 추가된 파일은 조회 결과가 도착해도 유지된다', async () => {
    const finish = deferredListing()
    const loading = fileManager.loadFilesFromRooms(['ROOM01'])

    // 목록 응답이 오기 전에 소켓 메시지로 파일이 추가됨
    fileManager.addFile(socketFile('ROOM01', 'late.png'))

    finish([listed('old.png')])
    await loading

    expect(names(fileManager)).toEqual(['ROOM01::late.png', 'ROOM01::old.png'])
    expect(fileManager.totalSize.value).toBe(15)
  })

  it('조회 중 removeFile로 삭제된 파일은 (오래된) 조회 결과에 포함돼 있어도 되살아나지 않는다', async () => {
    const finish = deferredListing()
    const loading = fileManager.loadFilesFromRooms(['ROOM01'])

    // 아직 로컬 목록에 없는 파일이라도 삭제 사실은 기억해야 한다
    fileManager.removeFile('ROOM01', 'gone.png')

    finish([listed('gone.png'), listed('kept.png')])
    await loading

    expect(names(fileManager)).toEqual(['ROOM01::kept.png'])
    expect(fileManager.totalSize.value).toBe(5)
  })

  it('조회 중 clearRoomFiles된 룸의 파일은 조회 결과에서 제외되고 다른 룸은 유지된다', async () => {
    let resolveA, resolveB
    r2Service.loadFiles
      .mockImplementationOnce(() => new Promise(r => { resolveA = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveB = r }))
    const loading = fileManager.loadFilesFromRooms(['ROOM01', 'ROOM02'])

    fileManager.clearRoomFiles('ROOM01')

    resolveA({ files: [listed('a.png')], nextToken: null })
    resolveB({ files: [listed('b.png')], nextToken: null })
    await loading

    expect(names(fileManager)).toEqual(['ROOM02::b.png'])
  })

  it('같은 파일이 조회 중 삭제됐다가 다시 추가되면 최종적으로 존재한다 (변경 순서 보존)', async () => {
    const finish = deferredListing()
    const loading = fileManager.loadFilesFromRooms(['ROOM01'])

    fileManager.removeFile('ROOM01', 'x.png')
    fileManager.addFile(socketFile('ROOM01', 'x.png', 42))

    finish([listed('x.png', 5)])
    await loading

    expect(names(fileManager)).toEqual(['ROOM01::x.png'])
    expect(fileManager.files.value[0].size).toBe(42)
    expect(fileManager.totalSize.value).toBe(42)
  })

  it('loadMore 중 삭제된 파일은 다음 페이지 결과에 포함돼 있어도 되살아나지 않는다', async () => {
    r2Service.loadFiles.mockResolvedValueOnce({ files: [listed('p1.png')], nextToken: 'tok' })
    await fileManager.loadFilesFromRooms(['ROOM01'])

    const finish = deferredListing()
    const more = fileManager.loadMore()

    fileManager.removeFile('ROOM01', 'p1.png')
    fileManager.removeFile('ROOM01', 'p2.png')

    finish([listed('p2.png'), listed('p3.png')])
    await more

    expect(names(fileManager)).toEqual(['ROOM01::p3.png'])
    expect(fileManager.totalSize.value).toBe(5)
  })

  it('조회가 끝난 뒤의 변경은 다음 조회 결과에 다시 적용되지 않는다', async () => {
    r2Service.loadFiles.mockResolvedValueOnce({ files: [listed('x.png')], nextToken: null })
    await fileManager.loadFilesFromRooms(['ROOM01'])

    // 조회가 끝난 상태에서의 삭제는 기록 대상이 아니다
    fileManager.removeFile('ROOM01', 'x.png')
    expect(names(fileManager)).toEqual([])

    // 이후 서버가 다시 x.png를 돌려주면(재업로드 등) 그대로 반영돼야 한다
    r2Service.loadFiles.mockResolvedValueOnce({ files: [listed('x.png')], nextToken: null })
    await fileManager.loadFilesFromRooms(['ROOM01'])

    expect(names(fileManager)).toEqual(['ROOM01::x.png'])
  })

  it('조회 도중 새 조회가 시작되면, 첫 조회 중의 변경도 최신 조회 결과 위에 적용된다', async () => {
    let resolveFirst, resolveSecond
    r2Service.loadFiles
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))

    const first = fileManager.loadFilesFromRooms(['ROOM01'])
    fileManager.addFile(socketFile('ROOM01', 'during-first.png'))
    const second = fileManager.loadFilesFromRooms(['ROOM01'])
    fileManager.addFile(socketFile('ROOM01', 'during-second.png'))

    resolveFirst({ files: [], nextToken: null })
    resolveSecond({ files: [listed('server.png')], nextToken: null })
    await Promise.all([first, second])

    expect(names(fileManager).sort()).toEqual([
      'ROOM01::during-first.png',
      'ROOM01::during-second.png',
      'ROOM01::server.png'
    ])
  })
})
