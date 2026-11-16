import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RoomScreen from './RoomScreen.vue'
import TextShareBox from './TextShareBox.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const stubs = { AppHeader: true, AppFooter: true, LandingContent: true, TransferProgress: true, ConnectionCard: true }
const me = { socketId: 'me', identity: { adj: 0, animal: 0 } }
const base = { roomId: 'r', files: [], texts: [], scope: 'ip', mySocketId: 'me', myIdentity: me.identity, pairEnabled: true, privateRooms: [], ipRoomDevices: [], globalRoomDevices: [] }
const mountScreen = (props) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })
const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(null), devices: ref([]) } }
const mountBox = (props = {}) => mount(TextShareBox, { props: { scope: 'ip', ...props }, global: { plugins: [i18n], provide } })
const file = new File(['x'], 'a.png', { type: 'image/png' })

describe('통합 보내기 상자', () => {
  it('워크스페이스에 파일 선택·붙여넣기·잠금·공유가 각각 정확히 하나, 모두 한 상자 안에', () => {
    const w = mountScreen({})
    expect(w.findAll('[data-testid="send-box"]')).toHaveLength(1)
    for (const id of ['choose-files', 'paste-button', 'lock-chip', 'text-share-button', 'text-input', 'file-input']) {
      expect(w.findAll(`[data-testid="${id}"]`), id).toHaveLength(1)
      expect(w.find(`[data-testid="send-box"] [data-testid="${id}"]`).exists(), id).toBe(true)
    }
    expect(w.find('[data-testid="send-panel-header"]').exists()).toBe(false)
    expect(w.find('[data-testid="upload-dropzone"]').exists()).toBe(false)
    expect(w.find('[data-testid="send-box"]').classes()).toEqual(expect.arrayContaining(['border-2', 'border-ink', 'bg-surface', 'rounded-none']))
  })

  it('파일 선택은 범위 강조색(주황), 도구 줄 순서는 파일 선택 → 붙여넣기 → 잠금 → 공유', () => {
    const w = mountBox()
    const choose = w.find('[data-testid="choose-files"]')
    expect(choose.classes()).toEqual(expect.arrayContaining(['font-extrabold', 'min-h-[44px]', 'text-white', 'whitespace-nowrap']))
    expect(choose.classes().join(' ')).toMatch(/bg-/)
    const tb = w.find('[data-testid="send-toolbar"]')
    expect(tb.classes()).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'p-2', 'border-t', 'border-border']))
    const order = (el) => el.element.className.match(/(?<![:\w-])order-(\d)/)?.[1]
    // 모든 폭에서 한 줄: 파일 선택, 붙여넣기, 잠금, 공유(오른쪽 끝). 좁은 화면에서는 붙여넣기·잠금이 아이콘만
    expect(w.find('[data-testid="toolbar-break"]').exists()).toBe(false)
    expect([order(choose), order(w.find('[data-testid="paste-row"]')), order(w.find('[data-testid="lock-chip"]')), order(w.find('[data-testid="text-share-button"]'))]).toEqual(['1', '2', '3', '4'])
    expect(choose.classes()).toContain('flex-1')
    expect(w.find('[data-testid="paste-button"] span.hidden').exists()).toBe(true)
    expect(w.find('[data-testid="text-share-button"]').classes()).toEqual(expect.arrayContaining(['sm:ml-auto', 'bg-ink', 'text-on-ink', 'font-extrabold', 'min-h-[44px]']))
  })

  it('목록이 비면 입력 영역이 크고(tint), 항목이 있으면 48px(surface)', async () => {
    const w = mountBox()
    const ta = () => w.find('[data-testid="text-input"]')
    expect(ta().classes()).toEqual(expect.arrayContaining(['sm:min-h-[140px]', 'min-h-[100px]', 'bg-tint']))
    await w.setProps({ hasItems: true })
    expect(ta().classes()).toContain('min-h-[48px]')
    expect(ta().classes()).toContain('bg-surface')
    expect(ta().classes()).not.toContain('sm:min-h-[140px]')
    expect(ta().classes()).toContain('border-0')
    expect(ta().attributes('aria-label')).toBeTruthy()
    expect(ta().attributes('placeholder')).toBe('여기에 입력하거나 파일을 끌어다 놓으세요')
  })

  it('상자에 파일을 놓으면 upload-files가 나가고, 끄는 동안은 안쪽 오버레이를 보인다', async () => {
    const w = mountBox()
    const box = w.find('[data-testid="send-box"]')
    await box.trigger('dragenter', { dataTransfer: { types: ['Files'] } })
    const ov = w.find('[data-testid="send-drop-overlay"]')
    expect(ov.exists()).toBe(true)
    expect(ov.text()).toBe('여기에 놓으면 바로 올라가요')
    expect(ov.classes()).toEqual(expect.arrayContaining(['border-dashed', 'border-2', 'border-ink', 'bg-tint/95']))
    await box.trigger('drop', { dataTransfer: { files: [file], types: ['Files'] } })
    expect(w.emitted('upload-files')[0][0]).toEqual([file])
    expect(w.find('[data-testid="send-drop-overlay"]').exists()).toBe(false)
  })

  it('RoomScreen까지 upload-files가 전파되고, 파일 선택 input 변경도 업로드로 간다', async () => {
    const w = mountScreen({})
    await w.find('[data-testid="send-box"]').trigger('drop', { dataTransfer: { files: [file], types: ['Files'] } })
    expect(w.emitted('upload-files')[0][0]).toEqual([file])
    const input = w.find('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(w.emitted('upload-files')).toHaveLength(2)
  })

  it('붙여넣기 버튼은 paste-content를 낸다', async () => {
    const w = mountBox()
    await w.find('[data-testid="paste-button"]').trigger('click')
    expect(w.emitted('paste-content')).toHaveLength(1)
  })

  it('상자 아래 한 줄에 보관 안내와 파일 한도가 " · "로 함께 있다', () => {
    const w = mountBox({ storageMode: 'plain', receiverCount: 1 })
    const line = w.find('[data-testid="text-storage"]')
    expect(line.find('[data-testid="upload-limit"]').exists()).toBe(true)
    expect(line.text()).toContain('·')
    expect(w.find('[data-testid="send-box"] [data-testid="upload-limit"]').exists()).toBe(false)
  })
})
