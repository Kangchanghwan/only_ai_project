import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'

const stubs = {
  AppHeader: true, AppFooter: true, LandingContent: true, TransferProgress: true,
  FileGallery: { name: 'FileGallery', template: '<div class="gallery"><slot name="send" /></div>', props: ['files'] },
  ConnectionCard: { name: 'ConnectionCard', template: '<button data-testid="cc-create" @click="$emit(\'group-create\')" />', props: ['otherNetworkDevices', 'devices'], emits: ['group-create'] }
}
const G = 'prv-g-' + 'ab12'.repeat(6)
const me = { socketId: 'me', identity: { adj: 0, animal: 0 } }
const other = { socketId: 'o', identity: { adj: 1, animal: 1 } }
const base = {
  roomId: G, files: [], texts: [], scope: 'prv:' + G, mySocketId: 'me', myIdentity: me.identity,
  pairEnabled: true, ipRoomDevices: [], globalRoomDevices: []
}
const room = (status = 'online') => [{ roomId: G, name: '우리 방', peer: null, status }]
const mountWith = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })

describe('RoomScreen 그룹 방', () => {
  it('Strip이 방 이름과 기기 수를 보여 주고, 기기 목록은 그 방의 접속 기기다 (room.peer 대체 목록 없음)', () => {
    const w = mountWith({ privateRooms: room(), privateDevices: { [G]: [me, other, { socketId: 'x' }] } })
    expect(w.find('[data-testid="private-strip-title"]').text()).toBe('우리 방')
    expect(w.find('[data-testid="group-members"]').text()).toMatch(/^기기 3대/)
    expect(w.findComponent({ name: 'ConnectionCard' }).props('devices')).toHaveLength(3)
  })

  it('방에 나만 있어도(offline 상태) 오프라인·나갔어요 안내 없이 텍스트를 쓸 수 있고 다시 연결 버튼이 없다', () => {
    const w = mountWith({ privateRooms: room('offline'), privateDevices: { [G]: [me] }, ipRoomDevices: [me, other] })
    expect(w.find('[data-testid="group-members"]').text()).toBe('아직 나만 있어요')
    expect(w.find('[data-testid="peer-offline-upload-note"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-input"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="peer-left-notice"]').exists()).toBe(false)
    expect(w.find('[data-testid="pair-reinvite"]').exists()).toBe(false)
  })

  it('상태가 left여도 그룹 방은 나갔어요 화면이 되지 않는다', () => {
    const w = mountWith({ privateRooms: room('left'), privateDevices: { [G]: [me, other] }, ipRoomDevices: [me, other] })
    expect(w.find('[data-testid="peer-left-notice"]').exists()).toBe(false)
    expect(w.find('[data-testid="pair-reinvite"]').exists()).toBe(false)
  })

  it('"＋ 방"(탭)과 초대 버튼(Strip)과 빈 방 안내(ConnectionCard)가 이벤트로 올라간다', async () => {
    const w = mountWith({ privateRooms: room(), privateDevices: { [G]: [me, other] } })
    await w.find('[data-testid="group-create"]').trigger('click')
    await w.find('[data-testid="cc-create"]').trigger('click')
    await w.find('[data-testid="group-invite"]').trigger('click')
    expect(w.emitted('group-create')).toHaveLength(2)
    expect(w.emitted('group-invite')[0]).toEqual([G])
  })

  it('pairEnabled가 꺼져 있으면 "＋ 방" 버튼이 없다', () => {
    const w = mountWith({ pairEnabled: false, privateRooms: [], scope: 'ip' })
    expect(w.find('[data-testid="group-create"]').exists()).toBe(false)
  })
})
