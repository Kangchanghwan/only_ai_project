import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const G = 'prv-g-' + 'ab12'.repeat(6)
const grp = (over = {}) => ({ roomId: G, name: '우리 방', peer: null, status: 'online', ...over })

describe('PrivateRoomStrip 그룹 방', () => {
  it('제목은 방 이름, 상태는 "기기 n대", 초대 버튼이 있다', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 3 } })
    expect(w.find('[data-testid="private-strip-title"]').text()).toBe('우리 방')
    expect(w.find('[data-testid="group-members"]').text()).toBe('기기 3대')
    expect(w.find('[data-testid="group-invite"]').text()).toBe('초대')
    expect(w.find('[data-testid="private-status"]').exists()).toBe(false) // 1:1 상태 점이 없다
    expect(w.text()).toContain('방에 있는 모든 기기가 볼 수 있어요')
  })

  it('혼자면 "아직 나만 있어요", 인원을 모르면 같은 문구', () => {
    expect(mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 1 } }).find('[data-testid="group-members"]').text()).toBe('아직 나만 있어요')
    expect(mount(PrivateRoomStrip, { ...opts, props: { room: grp() } }).find('[data-testid="group-members"]').text()).toBe('아직 나만 있어요')
  })

  it('이름이 비어 있으면 "이름 없는 방"', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp({ name: '' }), memberCount: 1 } })
    expect(w.find('[data-testid="private-strip-title"]').text()).toBe('이름 없는 방')
  })

  it('초대 버튼은 roomId와 함께 invite를 올린다', async () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 2 } })
    await w.find('[data-testid="group-invite"]').trigger('click')
    expect(w.emitted('invite')[0]).toEqual([G])
  })

  it('메뉴 "방 나가기" → 확인 문구(이 기기에서만 지워요) → leave', async () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 2 } })
    await w.find('[data-testid="private-menu"]').trigger('click')
    expect(w.find('[data-testid="private-leave"]').text()).toBe('방 나가기')
    await w.find('[data-testid="private-leave"]').trigger('click')
    expect(w.find('[data-testid="private-leave-confirm"]').text()).toContain('이 기기에서만 방을 지워요. 다른 기기는 계속 쓸 수 있어요')
    await w.find('[data-testid="private-leave-ok"]').trigger('click')
    expect(w.emitted('leave')[0]).toEqual([G])
  })

  it('예전 방은 상대 이름 기준 표시 + 초대 버튼(누르면 안내 시트로 이어짐), 인원 표시 없음', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: { roomId: 'prv-' + 'a'.repeat(24), status: 'online', peer: { identity: { adj: 1, animal: 1 } } } } })
    expect(w.find('[data-testid="group-invite"]').exists()).toBe(true)
    expect(w.find('[data-testid="group-members"]').exists()).toBe(false)
    expect(w.find('[data-testid="private-status"]').exists()).toBe(true)
    expect(w.find('[data-testid="private-strip-title"]').text()).toMatch(/와 쓰는 방$/)
  })
})

describe('PrivateRoomStrip 상태 줄과 아바타 (방 합치기)', () => {
  const dev = (n, extra = {}) => ({ socketId: 's' + n, identity: { adj: n, animal: n }, ...extra })
  it('다른 기기가 0대면 "아직 나만 있어요"', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 1, others: [] } })
    expect(w.find('[data-testid="group-members"]').text()).toBe('아직 나만 있어요')
  })
  it('1대 이상이면 "기기 n대 · 이름" (나 포함 n, 이름은 최대 2개)', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 2, others: [dev(1)] } })
    const text = w.find('[data-testid="group-members"]').text()
    expect(text).toMatch(/^기기 2대 · .+/)
    expect(text.split(' · ')).toHaveLength(2)
    const w4 = mount(PrivateRoomStrip, { ...opts, props: { room: grp(), memberCount: 4, others: [dev(1), dev(2), dev(3)] } })
    const t4 = w4.find('[data-testid="group-members"]').text()
    expect(t4).toMatch(/^기기 4대/)
    expect(t4.split(' · ')).toHaveLength(3) // 대수 + 이름 2개
    expect(w4.findAll('[data-testid="group-avatars"] > *')).toHaveLength(3)
  })
  it('연결로 만든 새 방도(peer가 있어도) 초대 버튼이 있다', async () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: grp({ peer: dev(1) }), memberCount: 2, others: [dev(1)] } })
    await w.find('[data-testid="group-invite"]').trigger('click')
    expect(w.emitted('invite')[0]).toEqual([G])
  })
  it('예전 방에서도 초대 버튼이 있고 roomId를 올린다', async () => {
    const legacy = 'prv-' + 'a'.repeat(24)
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: { roomId: legacy, status: 'online', peer: dev(1) } } })
    await w.find('[data-testid="group-invite"]').trigger('click')
    expect(w.emitted('invite')[0]).toEqual([legacy])
  })
})

