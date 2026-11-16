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
  it('혼자일 때 빈 방 안내 맨 아래에 작은 버튼 두 개가 나란히 있고, 방 만들기를 누르면 group-create', async () => {
    const w = mountCard([dev('me', me)])
    await flushPromises()
    const btn = w.find('[data-testid="empty-state-group-create"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('새 방 만들기')
    // 왜 방이 필요한지는 설명 글(title)로 남긴다
    expect(btn.attributes('title')).toBe('다른 와이파이나 데이터를 쓰는 기기와 연결하려면 방을 만드세요')
    // 그림으로 들어가기 버튼이 바로 옆, 두 버튼 묶음이 빈 방 안내의 마지막 요소
    const actions = w.find('[data-testid="empty-state-actions"]')
    expect(btn.element.nextElementSibling).toBe(w.find('[data-testid="empty-state-code-enter"]').element)
    expect(actions.element.lastElementChild).toBe(w.find('[data-testid="empty-state-code-enter"]').element)
    expect(w.find('[data-testid="empty-state"]').element.lastElementChild).toBe(actions.element)
    expect(btn.classes()).not.toContain('w-full')
    await btn.trigger('click')
    expect(w.emitted('group-create')).toHaveLength(1)
  })

  it('빈 방 안내에 "그림으로 들어가기" 버튼이 있고 누르면 code-enter', async () => {
    const w = mountCard([dev('me', me)])
    await flushPromises()
    const btn = w.find('[data-testid="empty-state-code-enter"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('그림으로 들어가기')
    expect(btn.classes()).not.toContain('w-full')
    await btn.trigger('click')
    expect(w.emitted('code-enter')).toHaveLength(1)
    expect(w.emitted('group-create')).toBeUndefined()
  })

  it('1:1 연결 기능이 꺼진 환경에서는 그림으로 들어가기 버튼도 없다', async () => {
    const w = mountCard([dev('me', me)], false)
    await flushPromises()
    expect(w.find('[data-testid="empty-state-code-enter"]').exists()).toBe(false)
  })

  it('다른 기기가 있으면 빈 방 안내와 함께 사라진다', async () => {
    const w = mountCard([dev('me', me), dev('a', { adj: 0, animal: 0 })])
    await flushPromises()
    expect(w.find('[data-testid="empty-state-group-create"]').exists()).toBe(false)
    expect(w.find('[data-testid="empty-state-code-enter"]').exists()).toBe(false)
  })

  it('1:1 연결 기능이 꺼진 환경(문맥 없음)에서는 버튼이 없다 (기존 화면 그대로)', async () => {
    const w = mountCard([dev('me', me)], false)
    await flushPromises()
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(w.find('[data-testid="empty-state-group-create"]').exists()).toBe(false)
  })
})
