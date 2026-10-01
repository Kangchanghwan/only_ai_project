import { describe, it, expect } from 'vitest'
import { createNewDeviceTracker } from './newDevices.js'

const d = (id) => ({ socketId: id })

describe('createNewDeviceTracker (새 기기 토스트 조건)', () => {
  it('내 접속 직후의 초기 목록은 알리지 않는다', () => {
    const tracker = createNewDeviceTracker()
    expect(tracker.update([d('a'), d('me')], 'me')).toEqual([])
  })

  it('초기 목록 이후 새로 들어온 기기만 알린다', () => {
    const tracker = createNewDeviceTracker()
    tracker.update([d('a'), d('me')], 'me')
    expect(tracker.update([d('a'), d('me'), d('b')], 'me')).toEqual([d('b')])
    // 같은 목록이 다시 와도 중복 알림 없음
    expect(tracker.update([d('a'), d('me'), d('b')], 'me')).toEqual([])
  })

  it('내 소켓은 알리지 않는다', () => {
    const tracker = createNewDeviceTracker()
    tracker.update([d('a')], 'me') // 아직 내 소켓이 목록에 없음: 초기 상태 유지
    expect(tracker.update([d('a'), d('me')], 'me')).toEqual([])
  })

  it('이미 본 기기가 나갔다 같은 소켓 ID로 복구되면 알리지 않는다', () => {
    const tracker = createNewDeviceTracker()
    tracker.update([d('a'), d('me')], 'me')
    tracker.update([d('me')], 'me')
    expect(tracker.update([d('me'), d('a')], 'me')).toEqual([])
  })

  it('내가 재접속한 뒤 처음 받는 목록은 초기 목록으로 취급한다', () => {
    const tracker = createNewDeviceTracker()
    tracker.update([d('a'), d('me')], 'me')
    tracker.markInitial()
    // 재접속하는 사이 들어온 b는 알리지 않고, 이후 c만 알린다
    expect(tracker.update([d('a'), d('b'), d('me2')], 'me2')).toEqual([])
    expect(tracker.update([d('a'), d('b'), d('me2'), d('c')], 'me2')).toEqual([d('c')])
  })

  it('빈/비정상 입력에 안전하다', () => {
    const tracker = createNewDeviceTracker()
    expect(tracker.update(undefined, 'me')).toEqual([])
    expect(tracker.update([null, {}], 'me')).toEqual([])
  })
})
