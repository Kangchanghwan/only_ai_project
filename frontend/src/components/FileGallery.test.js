import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileGallery from './FileGallery.vue'
import i18n from '../i18n/index.js'

// 같은 파일명("dup.png")이 서로 다른 룸(room-a, room-b)에 동시에 존재하는 상황을 재현한다.
// FileGallery의 선택 Set은 roomId+name 복합 키로 추적해야 하며, 단순 file.name 키를
// 쓰면 서로 다른 룸의 동일 파일명이 함께 선택되는 버그가 발생한다.
const dupFiles = [
  { name: 'dup.png', roomId: 'room-a', url: 'https://example.com/a/dup.png', size: 100, created: '2026-01-01T00:00:00.000Z' },
  { name: 'dup.png', roomId: 'room-b', url: 'https://example.com/b/dup.png', size: 200, created: '2026-01-02T00:00:00.000Z' }
]

// FileCard는 실제로 렌더링하되 최소한의 템플릿으로 stub하여 선택 토글을 실제 이벤트로 노출한다.
// toggle-selection은 file 전체 객체를 페이로드로 emit한다 (FileGallery의 v-for 핸들러가
// 호출 시 file을 직접 넘기므로, 이 stub의 페이로드 자체는 사용되지 않지만 실제 emit 이름은 맞춰둔다).
const stubs = {
  FileCard: {
    name: 'FileCard',
    props: ['file', 'isSelected'],
    emits: ['copy-image', 'toggle-selection', 'download-file', 'delete-file'],
    // 실제 FileCard.vue와 동일하게 file 객체 전체를 emit한다 (file.name만 emit하면
    // roomId 정보가 유실되어 복합 키 충돌 버그가 재발할 수 있다).
    template: `
      <div class="file-card-stub" :data-name="file.name" :data-room="file.roomId" :data-selected="isSelected">
        <input
          type="checkbox"
          class="select-checkbox"
          :checked="isSelected"
          @change="$emit('toggle-selection', file)"
        />
      </div>
    `
  },
  FileUploadSection: {
    name: 'FileUploadSection',
    props: ['scope'],
    emits: ['upload-files', 'select-scope'],
    template: '<div class="file-upload-section-stub"></div>'
  },
  PasteSection: {
    name: 'PasteSection',
    template: '<div class="paste-section-stub"></div>'
  },
  DownloadControls: {
    name: 'DownloadControls',
    props: ['selectedCount', 'totalCount', 'allSelected'],
    emits: ['download-parallel', 'toggle-select-all', 'show-multi-qr', 'delete-selected', 'clear-storage'],
    template: `
      <div class="download-controls-stub">
        <button class="toggle-select-all-btn" @click="$emit('toggle-select-all')">toggle-all</button>
        <button class="delete-selected-btn" @click="$emit('delete-selected')">delete-selected</button>
        <span class="selected-count">{{ selectedCount }}</span>
      </div>
    `
  },
  MultiFileQRCodeModal: {
    name: 'MultiFileQRCodeModal',
    props: ['files', 'roomId', 'isOpen'],
    template: '<div class="multi-qr-modal-stub"></div>'
  },
  // @vue/test-utils는 기본적으로 transition-group을 자동 stub 처리하여 실제 TransitionGroup을
  // 렌더링하지 않는다 (config.global.stubs['transition-group'] === true가 기본값). 이 기본 stub은
  // before-enter 등 트랜지션 훅을 전혀 호출하지 않으므로, land 애니메이션 지연 테스트를 위해
  // 실제 TransitionGroup이 렌더링되도록 명시적으로 false로 재정의한다.
  // (키는 반드시 kebab-case 'transition-group'이어야 한다 — @vue/test-utils의 기본 stub 매칭은
  // pascalTag('TransitionGroup') 또는 kebabTag('transition-group') 키만 인식하며,
  // camelCase 'transitionGroup'은 매칭되지 않아 무시된다.)
  'transition-group': false
}

const mountOptions = { global: { plugins: [i18n], stubs } }

describe('FileGallery.vue - 선택 충돌(다른 룸, 동일 파일명) 수정', () => {
  it('한 룸의 파일을 선택해도 다른 룸의 동일 파일명 파일은 선택되지 않는다', async () => {
    const wrapper = mount(FileGallery, {
      props: { files: dupFiles, roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    const cards = wrapper.findAllComponents({ name: 'FileCard' })
    expect(cards).toHaveLength(2)

    // room-a의 dup.png만 선택
    await cards[0].find('.select-checkbox').setValue(true)

    // delete-selected를 통해 selectedFilesArray의 실제 내용을 공개 인터페이스로 검증
    await wrapper.find('.delete-selected-btn').trigger('click')

    expect(wrapper.emitted('delete-selected')).toBeTruthy()
    const selected = wrapper.emitted('delete-selected')[0][0]
    expect(selected).toHaveLength(1)
    expect(selected[0].roomId).toBe('room-a')
    expect(selected[0].name).toBe('dup.png')

    // DownloadControls에도 selectedCount=1만 반영되어야 한다 (둘 다 선택된 것처럼 보이면 안 됨)
    const downloadControls = wrapper.findComponent({ name: 'DownloadControls' })
    expect(downloadControls.props('selectedCount')).toBe(1)
  })

  it('전체 선택 시 서로 다른 룸의 동일 파일명 파일이 각각 별개로 선택된다', async () => {
    const wrapper = mount(FileGallery, {
      props: { files: dupFiles, roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    await wrapper.find('.toggle-select-all-btn').trigger('click')

    const downloadControls = wrapper.findComponent({ name: 'DownloadControls' })
    expect(downloadControls.props('selectedCount')).toBe(2)

    await wrapper.find('.delete-selected-btn').trigger('click')

    const selected = wrapper.emitted('delete-selected')[0][0]
    expect(selected).toHaveLength(2)
    const roomIds = selected.map(f => f.roomId).sort()
    expect(roomIds).toEqual(['room-a', 'room-b'])
  })
})

describe('FileGallery.vue - 파일 카드 land 애니메이션', () => {
  it('초기 마운트 시 이미 존재하는 파일 카드에는 진입 지연이 적용되지 않는다', () => {
    const wrapper = mount(FileGallery, {
      props: { files: dupFiles, roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    const cards = wrapper.findAll('.file-card-stub')
    expect(cards).toHaveLength(2)
    cards.forEach(card => {
      expect(card.element.style.transitionDelay).toBe('')
    })
  })

  it('마운트 이후 한 번에 여러 파일이 추가되면 순서대로 진입 지연이 커진다', async () => {
    const wrapper = mount(FileGallery, {
      props: { files: [], roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    await wrapper.setProps({
      files: [
        { name: 'first.png', roomId: 'room-a', url: 'https://example.com/first.png', size: 10, created: '2026-01-01T00:00:00.000Z' },
        { name: 'second.png', roomId: 'room-a', url: 'https://example.com/second.png', size: 20, created: '2026-01-01T00:00:01.000Z' }
      ]
    })

    const cards = wrapper.findAll('.file-card-stub')
    expect(cards).toHaveLength(2)
    expect(cards[0].element.style.transitionDelay).toBe('0ms')
    expect(cards[1].element.style.transitionDelay).toBe('80ms')
  })
})

describe('FileGallery.vue - scope 전달/전파', () => {
  it('scope prop이 FileUploadSection에 전달되어야 한다', () => {
    const wrapper = mount(FileGallery, {
      props: { files: [], roomId: 'room-shared', isLoading: false, scope: 'global' },
      ...mountOptions
    })

    const uploadSection = wrapper.findComponent({ name: 'FileUploadSection' })
    expect(uploadSection.props('scope')).toBe('global')
  })

  it('FileUploadSection의 select-scope 이벤트가 전파되어야 한다', async () => {
    const wrapper = mount(FileGallery, {
      props: { files: [], roomId: 'room-shared', isLoading: false },
      ...mountOptions
    })

    const uploadSection = wrapper.findComponent({ name: 'FileUploadSection' })
    await uploadSection.vm.$emit('select-scope', 'global')

    expect(wrapper.emitted('select-scope')).toBeTruthy()
    expect(wrapper.emitted('select-scope')[0]).toEqual(['global'])
  })
})
