import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import i18n from '../i18n/index.js'

const showSuccess = vi.fn()
vi.mock('../composables/useNotification', () => ({ useNotification: () => ({ showSuccess }) }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (v) => `data:${v}`) } }))
const track = vi.fn()
vi.mock('../utils/analytics', () => ({ trackEvent: (...a) => track(...a) }))

const { default: RoomWakeQr } = await import('./RoomWakeQr.vue')

const peer = { socketId: 'p1', identity: { adj: 1, animal: 1, suffix: 0 } }
const room1 = (status, roomId = 'prv-0123456789abcdef01234567') => ({ roomId, status, peer })
const group = 'prv-g-0123456789abcdef01234567'
const URL1 = 'https://www.clipboardapp.org/#/qc?s=a&r=TAGTAGTAGTA'
let w
const mk = (props) => (w = mount(RoomWakeQr, { props: { qrUrl: URL1, ...props }, global: { plugins: [i18n] } }))
const has = (id) => w.find(`[data-testid="${id}"]`).exists()

beforeEach(() => { i18n.global.locale.value = 'ko'; sessionStorage.clear(); showSuccess.mockClear(); track.mockClear() })
afterEach(() => { w?.unmount(); vi.useRealTimers() })

describe('RoomWakeQr', () => {
  it('1:1 상대가 온라인이면 안 보이고, 오프라인이면 접힌 줄만 보인다', async () => {
    mk({ room: room1('online') })
    expect(has('room-wake-qr')).toBe(false)
    await w.setProps({ room: room1('offline') })
    expect(has('room-wake-qr')).toBe(true)
    expect(w.find('[data-testid="room-wake-qr-toggle"]').text()).toBe('휴대폰에서 이 방 바로 열기')
    expect(has('room-wake-qr-panel')).toBe(false)
  })

  it('누르면 방 꼬리표가 든 QR을 펼치고, 측정은 한 번만', async () => {
    mk({ room: room1('offline', 'prv-aaaaaaaaaaaaaaaaaaaaaaaa') })
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="room-wake-qr-img"]').attributes('data-qr-value')).toBe(URL1)
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('room_qr_open', { room_kind: 'private' })
  })

  it('연결 중은 3초 넘게 이어질 때만 보인다', async () => {
    vi.useFakeTimers()
    mk({ room: room1('connecting', 'prv-bbbbbbbbbbbbbbbbbbbbbbbb') })
    expect(has('room-wake-qr')).toBe(false)
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(has('room-wake-qr')).toBe(true)
  })

  it('펼쳐 둔 사이 상대가 들어오면 줄이 사라지고 한 번 알린다', async () => {
    mk({ room: room1('offline', 'prv-cccccccccccccccccccccccc') })
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await w.setProps({ room: room1('online', 'prv-cccccccccccccccccccccccc') })
    expect(has('room-wake-qr')).toBe(false)
    expect(showSuccess).toHaveBeenCalledTimes(1)
    expect(showSuccess.mock.calls[0][0]).toContain('이 방에 들어왔어요')
  })

  it('접어 둔 채로 들어오거나 다른 방으로 옮기면 알리지 않는다', async () => {
    mk({ room: room1('offline', 'prv-dddddddddddddddddddddddd') })
    await w.setProps({ room: room1('online', 'prv-dddddddddddddddddddddddd') })
    await w.setProps({ room: room1('offline', 'prv-dddddddddddddddddddddddd') })
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await w.setProps({ room: room1('online', 'prv-eeeeeeeeeeeeeeeeeeeeeeee') })
    expect(showSuccess).not.toHaveBeenCalled()
  })

  it('그룹 방: 목록이 오기 전에는 숨기고, 나 말고 아무도 없을 때만 보인다', async () => {
    mk({ room: { roomId: group, status: 'online' }, others: null })
    expect(has('room-wake-qr')).toBe(false)
    await w.setProps({ others: [] })
    expect(has('room-wake-qr')).toBe(true)
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await w.setProps({ others: [peer] })
    expect(has('room-wake-qr')).toBe(false)
    expect(showSuccess).toHaveBeenCalledTimes(1)
  })

  it('같은 네트워크 모드: 방 없이 접힌 줄, 펼치면 빈 화면과 같은 QR, 들어옴 알림 없음', async () => {
    const IPURL = 'https://www.clipboardapp.org/#/qc?s=a&g=AbCd12'
    mk({ network: true, qrUrl: IPURL })
    expect(w.find('[data-testid="room-wake-qr-toggle"]').text()).toBe('QR로 휴대폰 연결하기')
    await w.find('[data-testid="room-wake-qr-toggle"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="room-wake-qr-img"]').attributes('data-qr-value')).toBe(IPURL)
    expect(w.find('[data-testid="room-wake-qr-panel"]').text()).toContain('다른 네트워크의 휴대폰이면 연결 요청이 와요')
    expect(track).toHaveBeenCalledWith('room_qr_open', { room_kind: 'ip' })
    expect(showSuccess).not.toHaveBeenCalled()
  })
})
