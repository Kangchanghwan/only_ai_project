import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'

const stubs = {
  AppFooter: true, LandingContent: { template: '<div data-testid="landing-content">PC와 스마트폰 사이</div>' },
  TransferProgress: true, FileGallery: true, ConnectionCard: true, TextShareBox: true, ShareScopeTabs: true
}
const base = { files: [], texts: [], scope: 'ip', mySocketId: 'me', myIdentity: { adj: 0, animal: 0 }, ipRoomDevices: [], globalRoomDevices: [] }
const mountWith = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs }, attachTo: document.body })
const insideHelp = (el) => !!el.closest('[role="dialog"], .help-modal, [data-testid="help-modal"]')

describe('RoomScreen 검색용 본문 위치', () => {
  it('빈 목록 + ip 범위면 landing-content가 도움말 창 밖(메인 목록 아래)에 있고 1개다', async () => {
    const w = mountWith({})
    await nextTick(); await nextTick()
    const all = document.querySelectorAll('[data-testid="landing-content"]')
    expect(all).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="usage-notes"]')).toHaveLength(1)
    expect(all[0].closest('[data-testid="empty-extra-target"]')).not.toBeNull()
    expect(insideHelp(all[0])).toBe(false)
    // 보관·사용 안내는 빈 목록이어도 메인 화면에 꺼내지 않는다 (입력 칸 아래 한 줄로 충분)
    expect(document.querySelector('[data-testid="usage-notes"]').closest('[data-testid="empty-extra-target"]')).toBeNull()
    w.unmount()
  })
  it('항목이 있으면 도움말 창 안에 있고 1개다, 전환해도 1개', async () => {
    const w = mountWith({ files: [{ id: 'a' }] })
    await nextTick(); await nextTick()
    let all = document.querySelectorAll('[data-testid="landing-content"]')
    expect(all).toHaveLength(1)
    expect(all[0].closest('[data-testid="empty-extra-target"]')).toBeNull()
    await w.setProps({ files: [] })
    await nextTick()
    all = document.querySelectorAll('[data-testid="landing-content"]')
    expect(all).toHaveLength(1)
    expect(all[0].closest('[data-testid="empty-extra-target"]')).not.toBeNull()
    w.unmount()
  })
})
