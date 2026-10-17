import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileGallery from './FileGallery.vue'
import i18n from '../i18n/index.js'

// 1:1 방: 파일은 전부 방 키로 잠겨 올라간다 (locked: true). 두 기기 모두 방 키가 있어 지울 수 있으므로
// 모두 선택·선택 삭제는 켜고, 공개 URL을 쓰는 선택 받기·QR·비우기는 숨긴다.
const PRV = 'prv:room-p'
const lockedFiles = [
  { name: 'l1', roomId: 'room-p', locked: true, size: 10, created: '2026-10-01T00:00:00.000Z' },
  { name: 'l2', roomId: 'room-p', locked: true, size: 20, created: '2026-10-02T00:00:00.000Z' }
]

const stubs = {
  LockedFileCard: {
    name: 'LockedFileCard',
    props: ['file', 'scope', 'selectable', 'isSelected'],
    emits: ['toggle-selection', 'delete-file'],
    template: `<div class="locked-stub" :data-selected="isSelected">
      <input v-if="selectable" type="checkbox" class="locked-check" :checked="isSelected" @change="$emit('toggle-selection', file)" />
    </div>`
  },
  FileUploadSection: { name: 'FileUploadSection', template: '<div></div>' },
  PasteSection: { name: 'PasteSection', template: '<div></div>' },
  MultiFileQRCodeModal: { name: 'MultiFileQRCodeModal', props: ['files', 'roomId', 'isOpen'], template: '<div></div>' }
}

const mountGallery = (props) => mount(FileGallery, {
  props: { files: lockedFiles, roomId: 'room-p', isLoading: false, ...props },
  global: { plugins: [i18n], stubs }
})

describe('FileGallery - 1:1 방 모두 선택·선택 삭제', () => {
  it('1:1 범위에서는 잠긴 파일도 선택 대상이고, 컨트롤은 모두 선택·선택 삭제 2개만 보인다', () => {
    const w = mountGallery({ scope: PRV })
    const dc = w.findComponent({ name: 'DownloadControls' })
    expect(dc.props('totalCount')).toBe(2)
    expect(dc.props('privateMode')).toBe(true)
    expect(dc.findAll('button')).toHaveLength(2)
    expect(dc.find('[data-testid="select-all"]').attributes('disabled')).toBeUndefined()
    expect(w.findAll('.locked-check')).toHaveLength(2)
  })

  it('모두 선택 후 선택 삭제를 누르면 잠긴 파일 전부를 delete-selected로 넘긴다', async () => {
    const w = mountGallery({ scope: PRV })
    await w.find('[data-testid="select-all"]').trigger('click')
    expect(w.find('[data-testid="select-all"]').text()).toContain('(2/2)')
    const del = w.find('[data-testid="delete-selected"]')
    expect(del.attributes('disabled')).toBeUndefined()
    await del.trigger('click')
    const payload = w.emitted('delete-selected')[0][0]
    expect(payload.map((f) => f.name)).toEqual(['l1', 'l2'])
  })

  it('하나만 골라 지울 수 있다', async () => {
    const w = mountGallery({ scope: PRV })
    await w.findAll('.locked-check')[1].setValue(true)
    await w.find('[data-testid="delete-selected"]').trigger('click')
    expect(w.emitted('delete-selected')[0][0].map((f) => f.name)).toEqual(['l2'])
  })

  it('목록에서 사라진 파일은 선택 개수에서 빠진다 (삭제 뒤 남은 키로 숫자가 틀리지 않게)', async () => {
    const w = mountGallery({ scope: PRV })
    await w.find('[data-testid="select-all"]').trigger('click')
    await w.setProps({ files: [lockedFiles[0]] })
    const dc = w.findComponent({ name: 'DownloadControls' })
    expect(dc.props('selectedCount')).toBe(1)
    expect(dc.props('allSelected')).toBe(true)
  })

  it('범위를 바꾸면 선택이 비워진다', async () => {
    const w = mountGallery({ scope: PRV })
    await w.find('[data-testid="select-all"]').trigger('click')
    await w.setProps({ scope: 'prv:room-q' })
    expect(w.findComponent({ name: 'DownloadControls' }).props('selectedCount')).toBe(0)
  })

  it('1:1이 아닌 범위에서는 지금처럼 잠긴 파일을 고를 수 없다', () => {
    const w = mountGallery({ scope: 'ip' })
    const dc = w.findComponent({ name: 'DownloadControls' })
    expect(dc.props('totalCount')).toBe(0)
    expect(dc.props('privateMode')).toBe(false)
    expect(dc.findAll('button')).toHaveLength(5)
    expect(w.findAll('.locked-check')).toHaveLength(0)
  })
})
