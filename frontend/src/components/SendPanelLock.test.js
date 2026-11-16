import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RoomScreen from './RoomScreen.vue'
import TextShareBox from './TextShareBox.vue'
import FileUploadSection from './FileUploadSection.vue'
import i18n from '../i18n/index.js'
import { useLockState } from '../composables/useLockState'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const stubs = { AppHeader: true, AppFooter: true, LandingContent: true, TransferProgress: true, ConnectionCard: true }
const G = 'prv-g-' + 'ab12'.repeat(6)
const me = { socketId: 'me', identity: { adj: 0, animal: 0 } }
const base = { roomId: 'r', files: [], texts: [], scope: 'ip', mySocketId: 'me', myIdentity: me.identity, pairEnabled: true, privateRooms: [], ipRoomDevices: [], globalRoomDevices: [] }
const mountScreen = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })
const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(null), devices: ref([]) } }

describe('보내기 패널: 잠금 칩은 머리에 하나', () => {
  beforeEach(() => { const l = useLockState(); l.clearLock('ip'); l.clearLock('global') })

  it.each(['ip', 'global'])('%s 범위: 워크스페이스에 잠금 칩이 정확히 하나, 패널 머리 안에 있다', (scope) => {
    const w = mountScreen({ scope })
    expect(w.findAll('[data-testid="lock-chip"]')).toHaveLength(1)
    expect(w.find('[data-testid="send-panel-header"] [data-testid="lock-chip"]').exists()).toBe(true)
    expect(w.find('[data-testid="private-upload-hint"]').exists()).toBe(false)
  })

  it('큰 상태·한 줄 막대 모두 칩은 하나뿐', () => {
    const w = mountScreen({ scope: 'ip', files: [{ name: 'a.png', roomId: 'r', url: 'https://x/a.png', size: 1, created: '2026-01-01T00:00:00.000Z' }] })
    expect(w.find('[data-state="compact"]').exists()).toBe(true)
    expect(w.findAll('[data-testid="lock-chip"]')).toHaveLength(1)
  })

  it('1:1·그룹 방: 칩 없이 같은 머리 자리에 자동 암호화 안내', () => {
    const w = mountScreen({ scope: 'prv:' + G, privateRooms: [{ roomId: G, name: '우리 방', peer: null, status: 'online' }], privateDevices: { [G]: [me] } })
    expect(w.find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(w.find('[data-testid="send-panel-header"] [data-testid="private-upload-hint"]').exists()).toBe(true)
  })

  it('업로드 영역과 텍스트 입력 자체에는 잠금 칩이 없다', () => {
    expect(mount(FileUploadSection, { props: { scope: 'ip' }, global: { plugins: [i18n] } }).find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(mount(FileUploadSection, { props: { scope: 'ip', compact: true }, global: { plugins: [i18n] } }).find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(mount(TextShareBox, { props: { scope: 'ip', storageMode: 'plain' }, global: { plugins: [i18n], provide } }).find('[data-testid="lock-chip"]').exists()).toBe(false)
  })

  it('머리의 칩 하나로 켠 잠금을 파일 업로드와 텍스트 전송이 같은 범위 상태로 읽는다', async () => {
    const w = mountScreen({ scope: 'ip' })
    await w.find('[data-testid="lock-start"]').trigger('click')
    await w.find('[data-testid="lock-password"]').setValue('abcd')
    await w.find('form.lock-form').trigger('submit')
    await new Promise((r) => setTimeout(r, 1500))
    const lock = useLockState()
    // App.vue의 파일(handleUploadFiles)·텍스트(handleShareText) 경로가 모두 쓰는 getLock(scope)
    expect(lock.isLocked('ip')).toBe(true)
    expect(lock.getLock('ip')).toBeTruthy()
    expect(lock.isLocked('global')).toBe(false)
    expect(w.find('[data-testid="lock-chip"] .lock-chip.on').exists()).toBe(true)
  })
})
