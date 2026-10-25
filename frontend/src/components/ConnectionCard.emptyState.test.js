import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState'

const track = vi.hoisted(() => vi.fn())
const qr = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,AAAA'))
vi.mock('../utils/analytics', () => ({ trackEvent: track }))
vi.mock('qrcode', () => ({ default: { toDataURL: qr } }))

const fox = { adj: 1, animal: 1 }
const other = { adj: 0, animal: 0 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: 1 })
const global = { plugins: [i18n] }
const mountCard = (devices, extra = {}) => mount(ConnectionCard, { props: { devices, mySocketId: 'me', myIdentity: fox, ...extra }, global })
const alone = () => [dev('me', fox)]
const withPeer = () => [dev('me', fox), dev('a', other)]
const names = () => track.mock.calls.map((c) => c[0])

beforeEach(() => {
  vi.useFakeTimers()
  track.mockClear(); qr.mockClear()
  sessionStorage.clear()
  i18n.global.locale.value = 'ko'
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh)')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); i18n.global.locale.value = 'ko' })

describe('ConnectionCard 빈 방 안내', () => {
  it('혼자일 때 QR(상수 URL)과 안내가 보이고, 상대가 들어오면 사라진다', async () => {
    const w = mountCard(alone())
    await flushPromises()
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(qr.mock.calls[0][0]).toBe(EMPTY_STATE_QR_URL)
    expect(w.find('[data-testid="empty-state-qr"]').attributes('data-qr-value')).toBe(EMPTY_STATE_QR_URL)
    await w.setProps({ devices: withPeer() })
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(false)
    await w.setProps({ devices: alone() })
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('ko에서만 핑.한국 줄, en에서는 없다', async () => {
    const w = mountCard(alone())
    expect(w.find('[data-testid="empty-state-ping"]').text()).toContain('핑.한국')
    i18n.global.locale.value = 'en'
    await flushPromises()
    expect(w.find('[data-testid="empty-state-ping"]').exists()).toBe(false)
    expect(w.find('[data-testid="empty-state-line1"]').exists()).toBe(true)
  })

  it('모바일: QR 없이 한 줄 안내', async () => {
    navigator.userAgent // eslint-disable-line no-unused-expressions
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')
    const w = mountCard(alone())
    await flushPromises()
    expect(w.find('[data-testid="empty-state-qr"]').exists()).toBe(false)
    expect(qr).not.toHaveBeenCalled()
    expect(w.find('[data-testid="empty-state-mobile"]').text()).toContain('clipboardapp.org')
    expect(w.find('[data-testid="empty-state-mobile"]').text()).toContain('핑.한국')
  })

  it('1:1(prv)·전체 공유에서는 표시하지 않는다', () => {
    expect(mountCard(alone(), { scope: 'prv:abc' }).find('[data-testid="empty-state"]').exists()).toBe(false)
    expect(mountCard(alone(), { scope: 'global' }).find('[data-testid="empty-state"]').exists()).toBe(false)
  })

  it('굵은 주소 클릭: 클립보드 복사 + hint-copied + empty_hint_copy', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = mountCard(alone())
    await w.find('[data-testid="empty-state-copy-ping"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('핑.한국')
    expect(w.emitted('hint-copied')).toHaveLength(1)
    expect(track).toHaveBeenCalledWith('empty_hint_copy', { target: 'ping', is_mobile: false })
  })

  it('empty_state_view: 3초 이상 보였을 때만, 세션당 1회', async () => {
    const w = mountCard(alone())
    vi.advanceTimersByTime(2000)
    expect(names()).not.toContain('empty_state_view')
    vi.advanceTimersByTime(1500)
    expect(track).toHaveBeenCalledWith('empty_state_view', { is_mobile: false, locale: 'ko' })
    w.unmount()
    mountCard(alone())
    vi.advanceTimersByTime(5000)
    expect(names().filter((n) => n === 'empty_state_view')).toHaveLength(1)
  })

  it('3초 전에 상대가 들어오면 view 없음, peer_joined는 had_empty_state=false', async () => {
    const w = mountCard(alone())
    vi.advanceTimersByTime(1000)
    await w.setProps({ devices: withPeer() })
    vi.advanceTimersByTime(5000)
    expect(names()).not.toContain('empty_state_view')
    expect(track).toHaveBeenCalledWith('peer_joined', { wait_sec: 1, had_empty_state: false, is_mobile: false })
  })

  it('peer_joined: view 뒤 합류하면 wait_sec·had_empty_state=true, 세션당 1회', async () => {
    const w = mountCard(alone())
    vi.advanceTimersByTime(10_000)
    await w.setProps({ devices: withPeer() })
    expect(track).toHaveBeenCalledWith('peer_joined', { wait_sec: 10, had_empty_state: true, is_mobile: false })
    await w.setProps({ devices: alone() })
    await w.setProps({ devices: withPeer() })
    expect(names().filter((n) => n === 'peer_joined')).toHaveLength(1)
  })

  it('처음부터 다른 기기가 있었으면 peer_joined를 보내지 않는다', async () => {
    const w = mountCard(withPeer())
    vi.advanceTimersByTime(5000)
    await w.setProps({ devices: [...withPeer(), dev('b', { adj: 2, animal: 2 })] })
    expect(names()).not.toContain('peer_joined')
    expect(names()).not.toContain('empty_state_view')
  })

  it('trackEvent가 던져도 화면은 정상', async () => {
    track.mockImplementation(() => { throw new Error('x') })
    const w = mountCard(alone())
    vi.advanceTimersByTime(4000)
    await w.setProps({ devices: withPeer() })
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(false)
    track.mockReset()
  })
})
