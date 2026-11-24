import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useI18n: () => ({ t: (k) => k, locale: { value: 'ko' } }),
}))

import FileEditSheet from './FileEditSheet.vue'

function fakeClientFactory(opts = {}) {
  const handlers = {}
  const c = {
    calls: [],
    handlers,
    emit: (ev, d = {}) => (handlers[ev] || []).forEach((f) => f({ cbEdit: 1, event: ev, ...d })),
    on: (ev, fn) => { (handlers[ev] ||= []).push(fn); return () => {} },
    whenReady: () => (opts.neverReady ? new Promise(() => {}) : Promise.resolve({ editor: 'office' })),
    open: vi.fn(async (name, buf) => { c.calls.push(['open', name, buf.byteLength]); if (opts.openFail) throw new Error('x'); return {} }),
    export: vi.fn(async (fmt) => { c.calls.push(['export', fmt]); return { bytes: new ArrayBuffer(4), ext: opts.ext || 'docx', mime: 'application/octet-stream' } }),
    markSaved: vi.fn(async () => ({})),
    setTheme: vi.fn(async () => ({})),
    destroy: vi.fn(),
  }
  return c
}

let wrapper, client
async function mountSheet({ file = { name: 'a.docx', roomId: 'r1', size: 100 }, existing = [], upload, client: cl, getBytes } = {}) {
  client = cl || fakeClientFactory()
  const hooks = {
    maxBytes: 5 * 1024 ** 3,
    getBytes: getBytes || vi.fn(async () => ({ name: file.name, bytes: new ArrayBuffer(10) })),
    existingNames: () => existing,
    upload: upload || vi.fn(async () => true),
  }
  wrapper = mount(FileEditSheet, { props: { file, scope: 'ip', hooks, clientFactory: () => client }, attachTo: document.body })
  await flushPromises()
  return hooks
}
beforeEach(() => { if (typeof window.confirm !== 'function') window.confirm = () => true; if (window.happyDOM?.settings) window.happyDOM.settings.disableIframePageLoading = true }) // 시험 중 실제 편집기 주소로 요청이 나가지 않게
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

describe('FileEditSheet', () => {
  it('iframe 주소·allow, 로딩 문구(오피스는 처음 한 번 안내), open 뒤 ready 상태', async () => {
    await mountSheet({ client: fakeClientFactory({ neverReady: true }) })
    const fr = wrapper.get('[data-testid=edit-frame]')
    expect(fr.attributes('src')).toMatch(/^https:\/\/office\.clipboardapp\.org\/\?embed=cs&theme=(light|dark)$/)
    expect(fr.attributes('allow')).toBe('clipboard-read; clipboard-write; fullscreen')
    expect(wrapper.get('[data-testid=edit-loading]').text()).toContain('편집기를 불러오는 중…')
    expect(wrapper.get('[data-testid=edit-loading]').text()).toContain('처음 한 번은 시간이 걸려요')
  })
  it('한글은 한글 편집기 주소', async () => {
    await mountSheet({ file: { name: 'a.hwp', roomId: 'r1', size: 1 } })
    expect(wrapper.get('[data-testid=edit-frame]').attributes('src')).toMatch(/^https:\/\/hwp\.clipboardapp\.org\//)
    expect(wrapper.text()).not.toContain('처음 한 번은')
  })
  it('열린 뒤 로딩이 사라지고 open 에 바이트가 넘어간다', async () => {
    await mountSheet()
    expect(client.calls[0]).toEqual(['open', 'a.docx', 10])
    expect(wrapper.find('[data-testid=edit-loading]').exists()).toBe(false)
  })
  it('chrome 색으로 상단 바를 칠하고, 변경됨 점은 dirty 이벤트를 따른다', async () => {
    await mountSheet()
    client.emit('ready', { chrome: { bg: 'rgb(1, 2, 3)', fg: '#fff', border: '#999' } })
    await flushPromises()
    expect(wrapper.get('[data-testid=edit-bar]').attributes('style')).toContain('--bar-bg: rgb(1, 2, 3)')
    expect(wrapper.find('[data-testid=edit-dirty]').exists()).toBe(false)
    client.emit('dirty', { dirty: true })
    await flushPromises()
    expect(wrapper.find('[data-testid=edit-dirty]').exists()).toBe(true)
  })
  it('방에 올리기: export → "_수정" 이름으로 upload → markSaved', async () => {
    const upload = vi.fn(async () => true)
    await mountSheet({ upload, existing: ['a.docx', 'a_수정.docx'] })
    client.emit('dirty', { dirty: true })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(client.export).toHaveBeenCalledWith(undefined)
    const [f, scope] = upload.mock.calls[0]
    expect(f.name).toBe('a_수정2.docx')
    expect(scope).toBe('ip')
    expect(client.markSaved).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid=edit-dirty]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('방에 올렸습니다: a_수정2.docx')
  })
  it('doc → docx 변환 알림과 이름', async () => {
    const upload = vi.fn(async () => true)
    await mountSheet({ file: { name: 'old.doc', roomId: 'r1', size: 1 }, upload, client: fakeClientFactory({ ext: 'docx' }) })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(upload.mock.calls[0][0].name).toBe('old_수정.docx')
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('docx로 저장됩니다')
  })
  it('올리기 실패하면 markSaved 를 부르지 않는다', async () => {
    await mountSheet({ upload: vi.fn(async () => false) })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(client.markSaved).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('올리지 못했습니다')
  })
  it('한글 저장 메뉴: 원래 형식이 위, 내려받기는 format 지정', async () => {
    await mountSheet({ file: { name: 'a.hwpx', roomId: 'r1', size: 1 } })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    const items = wrapper.findAll('[role=menuitem]').map((w) => w.text())
    expect(items).toEqual(['방에 올리기', 'HWPX로 내려받기', 'HWP로 내려받기'])
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    await wrapper.get('[data-testid=edit-dl-hwp]').trigger('click')
    await flushPromises()
    expect(client.export).toHaveBeenCalledWith('hwp')
  })
  it('오피스 저장 메뉴는 내려받기 하나', async () => {
    await mountSheet()
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    expect(wrapper.findAll('[role=menuitem]').map((w) => w.text())).toEqual(['방에 올리기', '내려받기'])
  })
  it('편집기의 saveRequest 가 오면 저장 메뉴가 열린다', async () => {
    await mountSheet()
    expect(wrapper.find('[data-testid=edit-menu]').exists()).toBe(false)
    client.emit('saveRequest')
    await flushPromises()
    expect(wrapper.find('[data-testid=edit-menu]').exists()).toBe(true)
  })
  it('닫기: 변경이 없으면 확인 없이, 있으면 confirm (취소하면 머문다)', async () => {
    await mountSheet()
    const back = vi.spyOn(history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')))
    const conf = vi.spyOn(window, 'confirm').mockReturnValue(false)
    client.emit('dirty', { dirty: true })
    await flushPromises()
    await wrapper.get('[data-testid=edit-close]').trigger('click')
    expect(conf).toHaveBeenCalledWith('저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?')
    expect(wrapper.emitted('close')).toBeUndefined()
    conf.mockReturnValue(true)
    await wrapper.get('[data-testid=edit-close]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(back).toHaveBeenCalled()
  })
  it('깨끗하면 confirm 없이 닫힌다', async () => {
    await mountSheet()
    vi.spyOn(history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')))
    const conf = vi.spyOn(window, 'confirm')
    await wrapper.get('[data-testid=edit-close]').trigger('click')
    expect(conf).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('200MB 넘으면 iframe 없이 안내 + 닫기', async () => {
    await mountSheet({ file: { name: 'big.docx', roomId: 'r1', size: 201 * 1024 * 1024 } })
    expect(wrapper.find('[data-testid=edit-frame]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=edit-error]').text()).toContain('파일이 커서 이 화면에서 수정할 수 없어요')
  })
  it('open 실패하면 오류 문구와 닫기', async () => {
    await mountSheet({ client: fakeClientFactory({ openFail: true }) })
    expect(wrapper.get('[data-testid=edit-error]').text()).toContain('편집기를 열지 못했습니다.')
    expect(wrapper.find('[data-testid=edit-error-close]').exists()).toBe(true)
  })
  it('상태 메시지는 6초 뒤 사라진다', async () => {
    vi.useFakeTimers()
    try {
      await mountSheet()
      await wrapper.get('[data-testid=edit-save]').trigger('click')
      await wrapper.get('[data-testid=edit-upload]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid=edit-msg]').text()).not.toBe('')
      vi.advanceTimersByTime(6100)
      await flushPromises()
      expect(wrapper.get('[data-testid=edit-msg]').text()).toBe('')
    } finally { vi.useRealTimers() }
  })
})
