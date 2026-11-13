import { describe, it, expect, vi } from 'vitest'
import { createRoomPresence, presenceKey } from './roomPresence.js'

const dev = (socketId, adj, animal) => ({ socketId, identity: { adj, animal } })
const ME = { mySocketId: 'me', myKey: '9-9-0' }
const me = dev('me', 9, 9)

function setup(graceMs = 20000) {
  const events = []
  const timers = []
  const p = createRoomPresence({
    graceMs,
    onJoin: (room, d) => events.push(`join:${room}:${d.socketId}`),
    onLeave: (room, d) => events.push(`leave:${room}:${d.socketId}`),
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t },
    clearTimer: (t) => { t.cleared = true },
  })
  const fire = () => { for (const t of timers.splice(0)) if (!t.cleared) t.fn() }
  return { p, events, timers, fire }
}

describe('roomPresence', () => {
  it('이름표 키: adj-animal-suffix, 없으면 소켓', () => {
    expect(presenceKey(dev('a', 1, 2))).toBe('1-2-0')
    expect(presenceKey({ socketId: 'x', identity: { adj: 1, animal: 2, suffix: 3 } })).toBe('1-2-3')
    expect(presenceKey({ socketId: 'x' })).toBe('s:x')
  })

  it('처음 목록(내가 보일 때까지)은 알리지 않고, 그 뒤 새 기기만 그 방 이름으로 알린다', () => {
    const { p, events } = setup()
    p.update('ip', [dev('a', 1, 1)], ME) // 아직 내 소켓 없음
    p.update('ip', [dev('a', 1, 1), me], ME) // 기준 확정
    expect(events).toEqual([])
    p.update('ip', [dev('a', 1, 1), me, dev('b', 2, 2)], ME)
    expect(events).toEqual(['join:ip:b'])
  })

  it('나와 같은 이름표(같은 브라우저 다른 탭)는 세지 않는다', () => {
    const { p, events } = setup()
    p.update('room1', [me], ME)
    p.update('room1', [me, dev('tab2', 9, 9)], ME)
    expect(events).toEqual([])
  })

  it('나감은 20초 기다렸다 알린다', () => {
    const { p, events, timers, fire } = setup()
    p.update('room1', [me, dev('a', 1, 1)], ME)
    p.update('room1', [me], ME)
    expect(events).toEqual([])
    expect(timers[0].ms).toBe(20000)
    fire()
    expect(events).toEqual(['leave:room1:a'])
  })

  it('잠깐 끊겼다 새 소켓으로 돌아오면 나감·들어옴 둘 다 알리지 않는다', () => {
    const { p, events, fire } = setup()
    p.update('room1', [me, dev('a', 1, 1)], ME)
    p.update('room1', [me], ME)
    p.update('room1', [me, dev('a2', 1, 1)], ME)
    fire()
    expect(events).toEqual([])
  })

  it('방마다 따로 센다 (같은 기기가 같은 네트워크와 방에 들어오면 각각 알린다)', () => {
    const { p, events } = setup()
    p.update('ip', [me], ME)
    p.update('room1', [me], ME)
    p.update('ip', [me, dev('a', 1, 1)], ME)
    p.update('room1', [me, dev('a', 1, 1)], ME)
    expect(events).toEqual(['join:ip:a', 'join:room1:a'])
  })

  it('재접속(markInitial) 뒤 첫 목록은 다시 기준이고, 기다리던 나감은 버린다', () => {
    const { p, events, fire } = setup()
    p.update('ip', [me, dev('a', 1, 1)], ME)
    p.update('ip', [me], ME)
    p.markInitial()
    fire()
    p.update('ip', [me, dev('b', 2, 2)], ME)
    expect(events).toEqual([])
    p.update('ip', [me, dev('b', 2, 2), dev('c', 3, 3)], ME)
    expect(events).toEqual(['join:ip:c'])
  })

  it('forget: 내가 나간 방은 기다리던 나감도 알리지 않는다', () => {
    const { p, events, fire } = setup()
    p.update('room1', [me, dev('a', 1, 1)], ME)
    p.update('room1', [me], ME)
    p.forget('room1')
    fire()
    expect(events).toEqual([])
  })
})
