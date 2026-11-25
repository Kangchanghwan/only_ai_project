import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { identityName } from '../utils/identity'

const qr = vi.hoisted(() => vi.fn(async (v) => 'data:image/png;base64,' + v.length))
vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: qr } }))

const fox = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: 1 })
const URL1 = EMPTY_STATE_QR_URL + '#/qc?s=me&g=AbCd12&x=AAAAAAAAAAAAAAAAAAAAAA&f=AAAAAAAAAAAAAAAAAAAAAA'
const URL2 = URL1.replace('AbCd12', 'ZzZz99')

beforeEach(() => { qr.mockClear(); sessionStorage.clear(); i18n.global.locale.value = 'ko' })
afterEach(() => { vi.restoreAllMocks() })

describe('ConnectionCard QR 연결', () => {
  it('QR 주소를 받으면 그 주소로 그리고(utm 유지), 회차가 바뀌면 다시 그린다', async () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox, qrUrl: URL1 }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(qr.mock.calls.at(-1)[0]).toBe(URL1)
    expect(new URL(qr.mock.calls.at(-1)[0]).searchParams.get('utm_medium')).toBe('empty_state')
    expect(w.find('[data-testid="empty-state-qr"]').attributes('data-qr-value')).toBe(URL1)
    await w.setProps({ qrUrl: URL2 })
    await flushPromises()
    expect(w.find('[data-testid="empty-state-qr"]').attributes('data-qr-value')).toBe(URL2)
  })

  it('QR로 찾은 PC는 다른 네트워크 묶음 맨 위에 있고, 목록에 없어도 보인다', async () => {
    const pair = { states: { value: {} }, invite: vi.fn(), cancel: vi.fn(), confirm: vi.fn() }
    const pc = dev('pc1', { adj: 2, animal: 3 })
    const w = mount(ConnectionCard, {
      props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox, otherNetworkDevices: [dev('z', { adj: 4, animal: 4 })], pinnedDevice: pc },
      global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: pair } },
    })
    await flushPromises()
    await w.find('[data-testid="other-network-toggle"]').trigger('click')
    const rows = w.findAll('[data-testid="other-network-group"] [data-testid="device-row"]')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain(identityName(pc.identity, i18n.global.t))
  })
})
