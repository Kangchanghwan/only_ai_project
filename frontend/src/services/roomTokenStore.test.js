import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  setRoomTokens,
  setRoomTokenRefresher,
  getRoomToken,
  roomAuthHeaders,
  invalidateRoomToken,
  clearRoomTokens,
  _hasRoomToken
} from './roomTokenStore'

describe('roomTokenStore', () => {
  beforeEach(() => {
    clearRoomTokens()
    setRoomTokenRefresher(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('서버가 토큰을 준 적 없으면(구버전 백엔드) 헤더를 만들지 않고 재발급도 시도하지 않는다', async () => {
    const refresher = vi.fn()
    setRoomTokenRefresher(refresher)

    expect(await getRoomToken('room-a')).toBeNull()
    expect(await roomAuthHeaders('room-a')).toEqual({})
    expect(refresher).not.toHaveBeenCalled()
  })

  it('registered 페이로드의 토큰을 룸별로 저장하고 헤더로 만든다', async () => {
    setRoomTokens({ roomTokens: { 'room-shared': 't-g', 'room-a': 't-a' }, roomTokenTtlSec: 7200 })

    expect(await getRoomToken('room-a')).toBe('t-a')
    expect(await roomAuthHeaders('room-shared')).toEqual({ 'X-Room-Token': 't-g' })
  })

  it('토큰이나 유효 시간이 없는 페이로드는 무시한다', async () => {
    setRoomTokens({ globalRoomId: 'room-shared', ipRoomId: 'room-a' })
    setRoomTokens({ roomTokens: { 'room-a': 't-a' } })
    setRoomTokens(null)

    expect(_hasRoomToken('room-a')).toBe(false)
  })

  it('만료 5분 전이 되면 재발급 함수를 호출해 새 토큰을 쓴다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T00:00:00Z'))
    setRoomTokens({ roomTokens: { 'room-a': 'old' }, roomTokenTtlSec: 3600 })

    const refresher = vi.fn().mockResolvedValue({ roomTokens: { 'room-a': 'new' }, roomTokenTtlSec: 3600 })
    setRoomTokenRefresher(refresher)

    vi.setSystemTime(new Date('2026-09-29T00:50:00Z'))
    expect(await getRoomToken('room-a')).toBe('old')
    expect(refresher).not.toHaveBeenCalled()

    vi.setSystemTime(new Date('2026-09-29T00:56:00Z'))
    expect(await getRoomToken('room-a')).toBe('new')
    expect(refresher).toHaveBeenCalledTimes(1)
  })

  it('동시에 여러 요청이 재발급을 필요로 해도 한 번만 요청한다', async () => {
    setRoomTokens({ roomTokens: { 'room-a': 'old' }, roomTokenTtlSec: 3600 })
    invalidateRoomToken('room-a')

    const refresher = vi.fn().mockResolvedValue({ roomTokens: { 'room-a': 'new' }, roomTokenTtlSec: 3600 })
    setRoomTokenRefresher(refresher)

    const results = await Promise.all([getRoomToken('room-a'), getRoomToken('room-a'), getRoomToken('room-a')])
    expect(results).toEqual(['new', 'new', 'new'])
    expect(refresher).toHaveBeenCalledTimes(1)
  })

  it('재발급이 실패해도 아직 만료 전이면 기존 토큰을 쓴다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T00:00:00Z'))
    setRoomTokens({ roomTokens: { 'room-a': 'old' }, roomTokenTtlSec: 3600 })
    setRoomTokenRefresher(vi.fn().mockRejectedValue(new Error('timeout')))

    vi.setSystemTime(new Date('2026-09-29T00:58:00Z'))
    expect(await getRoomToken('room-a')).toBe('old')

    vi.setSystemTime(new Date('2026-09-29T01:00:01Z'))
    expect(await getRoomToken('room-a')).toBeNull()
  })
})
