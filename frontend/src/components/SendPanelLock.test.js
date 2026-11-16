import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'
import { useLockState } from '../composables/useLockState'

const stubs = { AppHeader: true, AppFooter: true, LandingContent: true, TransferProgress: true, ConnectionCard: true }
const G = 'prv-g-' + 'ab12'.repeat(6)
const me = { socketId: 'me', identity: { adj: 0, animal: 0 } }
const base = { roomId: 'r', files: [], texts: [], scope: 'ip', mySocketId: 'me', myIdentity: me.identity, pairEnabled: true, privateRooms: [], ipRoomDevices: [], globalRoomDevices: [] }
const mountScreen = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })

describe('통합 보내기 상자: 잠금 칩은 도구 줄에 하나', () => {
  beforeEach(() => { const l = useLockState(); l.clearLock('ip'); l.clearLock('global') })

  it.each(['ip', 'global'])('%s 범위: 워크스페이스에 잠금 칩이 정확히 하나, 도구 줄 안에 있다', (scope) => {
    const w = mountScreen({ scope })
    expect(w.findAll('[data-testid="lock-chip"]')).toHaveLength(1)
    expect(w.find('[data-testid="send-toolbar"] [data-testid="lock-chip"]').exists()).toBe(true)
    expect(w.find('[data-testid="private-upload-hint"]').exists()).toBe(false)
  })

  it('목록이 있어도 칩은 하나뿐', () => {
    const w = mountScreen({ scope: 'ip', files: [{ name: 'a.png', roomId: 'r', url: 'https://x/a.png', size: 1, created: '2026-01-01T00:00:00.000Z' }] })
    expect(w.findAll('[data-testid="lock-chip"]')).toHaveLength(1)
    expect(w.findAll('[data-testid="send-box"]')).toHaveLength(1)
  })

  it('1:1·그룹 방: 칩 없이 같은 도구 줄에 자동 암호화 안내', () => {
    const w = mountScreen({ scope: 'prv:' + G, privateRooms: [{ roomId: G, name: '우리 방', peer: null, status: 'online' }], privateDevices: { [G]: [me] } })
    expect(w.find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(w.find('[data-testid="send-toolbar"] [data-testid="private-upload-hint"]').exists()).toBe(true)
  })

  it('칩 하나로 켠 잠금을 파일 업로드와 텍스트 전송이 같은 범위 상태로 읽는다', async () => {
    const w = mountScreen({ scope: 'ip' })
    await w.find('[data-testid="lock-start"]').trigger('click')
    await w.find('[data-testid="lock-password"]').setValue('abcd')
    expect(w.find('[data-testid="lock-chip"]').classes()).toContain('is-editing')
    await w.find('form.lock-form').trigger('submit')
    await new Promise((r) => setTimeout(r, 1500))
    const lock = useLockState()
    expect(lock.isLocked('ip')).toBe(true)
    expect(lock.getLock('ip')).toBeTruthy()
    expect(lock.isLocked('global')).toBe(false)
    // 켜진 뒤에는 도구 줄의 칩이 사라지고 상자 위 잠금 줄이 상태를 보인다
    expect(w.find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(w.find('[data-testid="send-box"] [data-testid="lock-bar"]').attributes('data-state')).toBe('on')
  })
})
