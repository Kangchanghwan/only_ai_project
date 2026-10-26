import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'

const stubs = {
  AppHeader: true, AppFooter: true, LandingContent: true, ShareScopeTabs: true, TransferProgress: true,
  FileGallery: { name: 'FileGallery', template: '<div class="gallery"><slot name="send" /></div>', props: ['files'] },
  ConnectionCard: { name: 'ConnectionCard', template: '<div />', props: ['otherNetworkDevices', 'devices'] }
}
const me = { socketId: 'me', identity: { adj: 0, animal: 0 } }
const peer = { socketId: 'p', identity: { adj: 1, animal: 1 } }
const base = {
  roomId: 'prv-1', files: [], texts: [], scope: 'prv:prv-1', mySocketId: 'me', myIdentity: me.identity,
  pairEnabled: true, ipRoomDevices: [], globalRoomDevices: []
}
const mountWith = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })
const roomWith = (status) => [{ roomId: 'prv-1', peer, status }]

describe('RoomScreen 1:1 상태별 화면', () => {
  it('오프라인: 파일 업로드 안내 한 줄, 텍스트 입력과 공유 버튼 비활성 + 안내', () => {
    const w = mountWith({ privateRooms: roomWith('offline') })
    expect(w.find('[data-testid="peer-offline-upload-note"]').text()).toBe('상대가 접속하면 받을 수 있어요 (파일은 최대 1일 보관)')
    expect(w.find('[data-testid="text-input"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="text-share-button"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="text-compose-note"]').text()).toBe('상대가 접속하면 보낼 수 있어요')
    expect(w.find('[data-testid="peer-left-notice"]').exists()).toBe(false)
  })

  it('오프라인이어도 텍스트가 10분 보관되면 입력할 수 있고 보관 안내를 보여 준다', () => {
    const w = mountWith({ privateRooms: roomWith('offline'), textStorageMode: 'private', textReceiverCount: 0 })
    expect(w.find('[data-testid="text-input"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="text-compose-note"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-receivers"]').attributes('data-state')).toBe('queued')
  })

  it('접속 중이면 안내 없이 입력 가능, 연결 중이면 입력만 막는다', () => {
    const on = mountWith({ privateRooms: roomWith('online') })
    expect(on.find('[data-testid="peer-offline-upload-note"]').exists()).toBe(false)
    expect(on.find('[data-testid="text-input"]').attributes('disabled')).toBeUndefined()
    const cn = mountWith({ privateRooms: roomWith('connecting') })
    expect(cn.find('[data-testid="text-input"]').attributes('disabled')).toBeDefined()
    expect(cn.find('[data-testid="text-compose-note"]').exists()).toBe(false)
  })

  it('상대가 끊으면 "상대가 연결을 끊었어요" 안내와 (상대가 목록에 있으면) 다시 연결', () => {
    const w = mountWith({ privateRooms: roomWith('left'), ipRoomDevices: [me, peer] })
    expect(w.find('[data-testid="peer-left-notice"]').text()).toContain('상대가 연결을 끊었어요')
    expect(w.find('[data-testid="pair-reinvite"]').exists()).toBe(true)
  })
})

describe('RoomScreen 다른 네트워크 기기', () => {
  it('전체 공유 방에만 있는 기기(내 기기 제외)를 ConnectionCard에 내려준다', () => {
    const far = { socketId: 'far', identity: { adj: 2, animal: 2 } }
    const w = mountWith({ scope: 'ip', privateRooms: [], ipRoomDevices: [me, peer], globalRoomDevices: [me, peer, far] })
    expect(w.findComponent({ name: 'ConnectionCard' }).props('otherNetworkDevices')).toEqual([far])
  })

  it('없으면 빈 배열', () => {
    const w = mountWith({ scope: 'ip', privateRooms: [], ipRoomDevices: [me, peer], globalRoomDevices: [me, peer] })
    expect(w.findComponent({ name: 'ConnectionCard' }).props('otherNetworkDevices')).toEqual([])
  })
})
