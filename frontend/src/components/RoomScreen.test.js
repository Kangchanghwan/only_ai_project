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

  describe('파일 업로드 UI', () => {
    it('파일 선택 버튼이 표시되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      expect(wrapper.find('.file-upload-button').exists()).toBe(true)
    })

    it('숨겨진 파일 입력 요소가 존재해야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const fileInput = wrapper.find('input[type="file"]')
      expect(fileInput.exists()).toBe(true)
      // 모든 파일 형식 허용 (accept 속성 없음)
      expect(fileInput.attributes('accept')).toBeUndefined()
      expect(fileInput.attributes('multiple')).toBeDefined()
    })

    it('파일 선택 버튼 클릭 시 파일 입력이 트리거되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const fileInput = wrapper.find('input[type="file"]')
      const clickSpy = vi.spyOn(fileInput.element, 'click')

      await wrapper.find('.file-upload-button').trigger('click')

      expect(clickSpy).toHaveBeenCalled()
    })

    it('파일 선택 시 "upload-files" 이벤트를 발생시켜야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const fileInput = wrapper.find('input[type="file"]')
      const mockFiles = [
        new File(['test'], 'test.png', { type: 'image/png' })
      ]

      Object.defineProperty(fileInput.element, 'files', {
        value: mockFiles,
        writable: false
      })

      await fileInput.trigger('change')

      expect(wrapper.emitted()).toHaveProperty('upload-files')
      expect(wrapper.emitted('upload-files')[0][0]).toEqual(mockFiles)
    })

    it('드래그 앤 드롭 영역이 존재해야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      expect(wrapper.find('.drop-zone').exists()).toBe(true)
    })

    it('파일 드롭 시 "upload-files" 이벤트를 발생시켜야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const mockFiles = [
        new File(['test'], 'test.png', { type: 'image/png' })
      ]

      const dropEvent = new Event('drop')
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: mockFiles }
      })

      await wrapper.find('.drop-zone').trigger('drop', { dataTransfer: { files: mockFiles } })

      expect(wrapper.emitted()).toHaveProperty('upload-files')
    })

    it('드래그 오버 시 드롭 영역에 시각적 피드백이 표시되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const dropZone = wrapper.find('.drop-zone')

      await dropZone.trigger('dragover')
      expect(dropZone.classes()).toContain('drag-over')

      await dropZone.trigger('dragleave')
      expect(dropZone.classes()).not.toContain('drag-over')
    })

    it('업로드 방법 안내가 표시되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const instructions = wrapper.find('.upload-instructions')
      expect(instructions.exists()).toBe(true)
      expect(instructions.text()).toContain('파일 선택')
      expect(instructions.text()).toContain('드래그')
    })

    it('모든 파일 형식을 허용해야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { roomId: 'TEST123', userCount: 1, files: [], isLoading: false }
      })

      const fileInput = wrapper.find('input[type="file"]')
      // accept 속성이 없으면 모든 파일 형식 허용
      expect(fileInput.attributes('accept')).toBeUndefined()
    })
  })
})
