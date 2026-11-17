import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'

const track = vi.hoisted(() => vi.fn())
vi.mock('../utils/analytics', () => ({ trackEvent: track }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }))

const fox = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: 1 })
const mountCard = (devices, extra = {}) => mount(ConnectionCard, { props: { devices, mySocketId: 'me', myIdentity: fox, ...extra }, global: { plugins: [i18n] } })
const alone = () => [dev('me', fox)]
const withPeer = () => [dev('me', fox), dev('a', { adj: 0, animal: 0 })]
const calls = () => track.mock.calls.filter((c) => c[0] !== 'peer_joined' && c[0] !== 'empty_state_view').map((c) => [c[0], c[1]])

beforeEach(() => { vi.useFakeTimers(); track.mockClear(); sessionStorage.clear() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('ConnectionCard 활성화 측정', () => {
  it('QR 도착 세션: empty_state_view와 함께 qr_arrive_alone', async () => {
    sessionStorage.setItem('cs_am_qr', '1')
    mountCard(alone())
    vi.advanceTimersByTime(3000)
    const names = track.mock.calls.map((c) => c[0])
    expect(names.indexOf('qr_arrive_alone')).toBe(names.indexOf('empty_state_view') + 1)
  })
  it('QR 도착이 아니면 qr_arrive_alone 없음', async () => {
    mountCard(alone()); vi.advanceTimersByTime(3000)
    expect(track.mock.calls.map((c) => c[0])).not.toContain('qr_arrive_alone')
  })
  it('처음부터 상대가 있으면 ip_existing', () => {
    mountCard(withPeer())
    expect(calls()).toEqual([['connected_any', { way: 'ip_existing' }]])
  })
  it('혼자였다가 합류하면 ip_first, 1회', async () => {
    const w = mountCard(alone()); await flushPromises()
    await w.setProps({ devices: withPeer() }); await w.setProps({ devices: alone() }); await w.setProps({ devices: withPeer() })
    expect(calls()).toEqual([['connected_any', { way: 'ip_first' }]])
  })
  it('전체 공유·비공개 방 스코프의 ConnectionCard는 ip 방식을 보내지 않는다', () => {
    mountCard(withPeer(), { scope: 'global' }); mountCard(withPeer(), { scope: 'prv:abc' })
    expect(calls()).toEqual([])
  })
})
