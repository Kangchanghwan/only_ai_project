import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'

describe('RoomScreen.vue', () => {
  it('props로 전달된 룸 ID와 사용자 수를 올바르게 렌더링해야 한다', () => {
    const wrapper = mount(RoomScreen, {
      props: {
        roomId: 'TEST123',
        userCount: 3,
        files: [],
        isLoading: false
      }
    })

    expect(wrapper.text()).toContain('TEST123')
    expect(wrapper.text()).toContain('3명 접속 중')
  })

  it('룸 코드 복사 버튼을 클릭하면 "copy-room-code" 이벤트를 발생시켜야 한다', async () => {
    const wrapper = mount(RoomScreen, {
      props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
    })

    await wrapper.find('.copy-button').trigger('click')

    expect(wrapper.emitted()).toHaveProperty('copy-room-code')
  })

  it('다른 룸 입장 입력 후 버튼을 클릭하면 "join-other-room" 이벤트를 발생시켜야 한다', async () => {
    const wrapper = mount(RoomScreen, {
      props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
    })

    await wrapper.find('.room-join-input').setValue('NEW456')
    await wrapper.find('.room-join-button').trigger('click')

    expect(wrapper.emitted()).toHaveProperty('join-other-room')
    expect(wrapper.emitted('join-other-room')[0][0]).toBe('NEW456')
  })

  it('파일이 없을 때 "비어있습니다" 메시지를 표시해야 한다', () => {
    const wrapper = mount(RoomScreen, {
      props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
    })

    expect(wrapper.text()).toContain('이 룸은 아직 비어있습니다.')
  })

  it('파일이 있을 때 갤러리를 표시해야 한다', () => {
    const files = [
      { name: 'test1.png', url: 'http://example.com/test1.png', created: new Date().toISOString() }
    ]
    const wrapper = mount(RoomScreen, {
      props: { roomId: 'TEST123', userCount: 1, files: files, isLoading: false }
    })

    expect(wrapper.find('.gallery').exists()).toBe(true)
    expect(wrapper.findAll('.image-card').length).toBe(1)
  })

  it('이미지 카드를 클릭하면 "copy-image" 이벤트를 발생시켜야 한다', async () => {
    const files = [
      { name: 'test1.png', url: 'http://example.com/test1.png', created: new Date().toISOString() }
    ]
    const wrapper = mount(RoomScreen, {
      props: { roomId: 'TEST123', userCount: 1, files: files, isLoading: false }
    })

    await wrapper.find('.image-card').trigger('click')

    expect(wrapper.emitted()).toHaveProperty('copy-image')
    expect(wrapper.emitted('copy-image')[0][0]).toBe('http://example.com/test1.png')
  })
})
