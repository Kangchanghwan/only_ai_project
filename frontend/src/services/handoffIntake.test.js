import { describe, it, expect, vi } from 'vitest'
import { runHandoff, stripHandoffParams } from './handoffIntake.js'

const t = (k) => k
const mk = (over = {}) => {
  const store = { read: vi.fn(async () => ({ id: 'x', name: '문서.hwpx', type: 'application/octet-stream', bytes: new Uint8Array([1, 2]).buffer, ts: 1 })), remove: vi.fn(async () => {}) }
  const deps = {
    id: 'x', store, t,
    getCurrentRoomId: vi.fn(() => null),
    createRoom: vi.fn(async () => 'grp-1'),
    upload: vi.fn(async () => true),
    openInvite: vi.fn(),
    notifyError: vi.fn(),
    clearUrl: vi.fn(),
    ...over,
  }
  return deps
}

describe('runHandoff (폰으로 보내기 받기)', () => {
  it('새 방을 만들고 파일을 올린 뒤 전달함 항목을 지우고 주소를 정리한다', async () => {
    const d = mk()
    expect(await runHandoff(d)).toBe(true)
    expect(d.createRoom).toHaveBeenCalledTimes(1)
    const files = d.upload.mock.calls[0][0]
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('문서.hwpx')
    expect(files[0].size).toBe(2)
    expect(d.store.remove).toHaveBeenCalledWith('x')
    expect(d.clearUrl).toHaveBeenCalled()
    expect(d.openInvite).not.toHaveBeenCalled() // 새 방은 createRoom 이 초대 시트를 연다
    expect(d.notifyError).not.toHaveBeenCalled()
  })

  it('이미 방에 있으면 새 방을 만들지 않고 그 방에 올린 뒤 초대 시트를 연다', async () => {
    const d = mk({ getCurrentRoomId: vi.fn(() => 'grp-9') })
    expect(await runHandoff(d)).toBe(true)
    expect(d.createRoom).not.toHaveBeenCalled()
    expect(d.upload).toHaveBeenCalledTimes(1)
    expect(d.openInvite).toHaveBeenCalledWith('grp-9')
  })

  it('항목이 없거나 만료면 한 줄 안내만 띄운다', async () => {
    const d = mk()
    d.store.read = vi.fn(async () => null)
    expect(await runHandoff(d)).toBe(false)
    expect(d.notifyError).toHaveBeenCalledWith('handoff.expired')
    expect(d.createRoom).not.toHaveBeenCalled()
    expect(d.clearUrl).toHaveBeenCalled()
  })

  it('방 만들기가 실패하면 안내하고 항목은 지운다', async () => {
    const d = mk({ createRoom: vi.fn(async () => null) })
    expect(await runHandoff(d)).toBe(false)
    expect(d.notifyError).toHaveBeenCalledWith('handoff.failed')
    expect(d.upload).not.toHaveBeenCalled()
    expect(d.store.remove).toHaveBeenCalledWith('x')
  })

  it('업로드가 실패하면 안내하고 항목은 지운다', async () => {
    const d = mk({ upload: vi.fn(async () => false) })
    expect(await runHandoff(d)).toBe(false)
    expect(d.notifyError).toHaveBeenCalledWith('handoff.failed')
    expect(d.store.remove).toHaveBeenCalledWith('x')
  })

  it('stripHandoffParams 는 handoff, from 만 지운다', () => {
    window.history.replaceState(null, '', '/?handoff=abc&from=tools-hwp&utm_source=x')
    stripHandoffParams()
    expect(window.location.search).toBe('?utm_source=x')
  })
})
