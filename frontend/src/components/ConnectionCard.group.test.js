import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }))

const me = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: 1 })
const ctx = { states: ref({}), invite: vi.fn(), cancel() {}, open() {}, confirm: vi.fn() }
const mountCard = (devices, provide = true) =>
  mount(ConnectionCard, { props: { devices, mySocketId: 'me', myIdentity: me }, global: { plugins: [i18n], provide: provide ? { [PAIR_CONTEXT_KEY]: ctx } : {} } })

beforeEach(() => { sessionStorage.clear(); i18n.global.locale.value = 'ko' })
afterEach(() => vi.restoreAllMocks())

describe('ConnectionCard 그룹 방 만들기 진입 버튼', () => {
  it('혼자일 때 빈 방 안내 맨 아래에 한 줄 버튼이 있고 누르면 group-create', async () => {
    const w = mountCard([dev('me', me)])
    await flushPromises()
    const btn = w.find('[data-testid="empty-state-group-create"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('다른 와이파이나 데이터를 쓰는 기기와 연결하려면 방을 만드세요')
    // 빈 방 안내 영역의 마지막 요소
    expect(w.find('[data-testid="empty-state"]').element.lastElementChild).toBe(btn.element)
    expect(btn.classes()).toContain('min-h-[44px]')
    await btn.trigger('click')
    expect(w.emitted('group-create')).toHaveLength(1)
  })

  it('다른 기기가 있으면 빈 방 안내와 함께 사라진다', async () => {
    const w = mountCard([dev('me', me), dev('a', { adj: 0, animal: 0 })])
    await flushPromises()
    expect(w.find('[data-testid="empty-state-group-create"]').exists()).toBe(false)
  })

  it('1:1 연결 기능이 꺼진 환경(문맥 없음)에서는 버튼이 없다 (기존 화면 그대로)', async () => {
    const w = mountCard([dev('me', me)], false)
    await flushPromises()
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(w.find('[data-testid="empty-state-group-create"]').exists()).toBe(false)
  })
})
