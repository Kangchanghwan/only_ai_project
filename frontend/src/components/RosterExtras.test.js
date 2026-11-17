import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ko from '../i18n/locales/ko.json'
import RosterExtras from './RosterExtras.vue'
import { socketService } from '../services/socketService'

const i18n = createI18n({ legacy: false, locale: 'ko', fallbackLocale: 'ko', messages: { ko } })
const dev = (id) => ({ socketId: id, joinedAt: 1, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', identity: { adj: 0, animal: 1 } })
const mountIt = (props = {}) =>
  mount(RosterExtras, { props: { scope: 'global', devices: [dev('me'), dev('a')], mySocketId: 'me', ...props }, global: { plugins: [i18n] } })

describe('RosterExtras', () => {
  beforeEach(() => {
    socketService.globalRoomTruncated.value = false
    socketService.globalRoomTotal.value = 0
  })

  it('잘리지 않았으면 아무것도 그리지 않는다', () => {
    socketService.globalRoomTotal.value = 3
    const w = mountIt()
    expect(w.find('[data-testid="roster-extras"]').exists()).toBe(false)
    expect(w.find('[data-testid="roster-other-more"]').exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('잘렸으면 "외 n대"와 찾기 묶음이 보인다 (n = 총 − 나 − 보이는 다른 기기)', () => {
    socketService.globalRoomTruncated.value = true
    socketService.globalRoomTotal.value = 60
    const w = mountIt()
    expect(w.find('[data-testid="roster-more"]').text()).toBe('외 58대 접속 중')
    expect(w.find('[data-testid="roster-find"]').exists()).toBe(true)
    expect(w.findAll('select')).toHaveLength(3)
  })

  it('n이 0 이하면 "외 n대" 줄을 숨긴다', () => {
    socketService.globalRoomTruncated.value = true
    socketService.globalRoomTotal.value = 2
    expect(mountIt().find('[data-testid="roster-more"]').exists()).toBe(false)
  })

  it('찾기 결과 3종: 찾음 / 없음 / 제한 / 오류', async () => {
    socketService.globalRoomTruncated.value = true
    socketService.globalRoomTotal.value = 60
    const w = mountIt()
    const spy = vi.spyOn(socketService, 'findDevice')
    spy.mockResolvedValueOnce({ ok: true, device: dev('zz') })
    await w.find('[data-testid="roster-find-button"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="roster-found"]').exists()).toBe(true)
    spy.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
    await w.find('[data-testid="roster-find-button"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="roster-failure"]').text()).toBe('지금 접속한 기기 중 이 이름이 없어요')
    expect(w.find('[data-testid="roster-found"]').exists()).toBe(false)
    spy.mockResolvedValueOnce({ ok: false, code: 'RATE_LIMITED' })
    await w.find('[data-testid="roster-find-button"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="roster-failure"]').text()).toBe('잠시 후 다시 찾아 주세요')
    spy.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    await w.find('[data-testid="roster-find-button"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="roster-failure"]').text()).toBe('찾지 못했어요. 다시 시도해 주세요')
    spy.mockRestore()
  })

  it('goFind(같은 네트워크 탭의 한 줄이 부름)는 전체 공유 탭 전환을 요청한다', () => {
    socketService.globalRoomTruncated.value = true
    socketService.globalRoomTotal.value = 60
    const w = mountIt({ scope: 'ip' })
    expect(w.find('[data-testid="roster-go-find"]').exists()).toBe(false)
    w.vm.goFind()
    expect(w.emitted('select-scope')[0]).toEqual(['global'])
  })
})
