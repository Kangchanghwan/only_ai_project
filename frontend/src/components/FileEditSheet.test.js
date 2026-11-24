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
async function mountSheet({ file = { name: 'a.docx', roomId: 'r1', size: 100 }, upload, replace, client: cl, getBytes } = {}) {
  client = cl || fakeClientFactory()
  const hooks = {
    maxBytes: 5 * 1024 ** 3,
    getBytes: getBytes || vi.fn(async () => ({ name: file.name, bytes: new ArrayBuffer(10) })),
    replace: replace || vi.fn(async (cur, f, scope) => ({ ok: await (upload || (async () => true))(f, scope), next: cur, removed: true })),
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
  it('저장: export → 원래 이름으로 원본 덮어쓰기(replace) → markSaved', async () => {
    const replace = vi.fn(async (cur) => ({ ok: true, next: cur, removed: true }))
    const file = { name: 'a.docx', roomId: 'r1', size: 100 }
    await mountSheet({ file, replace })
    client.emit('dirty', { dirty: true })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(client.export).toHaveBeenCalledWith(undefined)
    const [cur, f, scope] = replace.mock.calls[0]
    expect(cur).toEqual(file)
    expect(f.name).toBe('a.docx')
    expect(scope).toBe('ip')
    expect(client.markSaved).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid=edit-dirty]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('저장했습니다: a.docx')
  })
  it('두 번째 저장은 첫 저장이 돌려준 새 항목을 원본으로 쓴다', async () => {
    const next = { name: 'LOCKID2', roomId: 'r1', locked: true }
    const replace = vi.fn(async () => ({ ok: true, next, removed: true }))
    await mountSheet({ file: { name: 'LOCKID1', roomId: 'r1', locked: true, size: 1 }, replace, getBytes: vi.fn(async () => ({ name: '비밀.hwpx', bytes: new ArrayBuffer(3) })) })
    for (let i = 0; i < 2; i++) { await wrapper.get('[data-testid=edit-save]').trigger('click'); await wrapper.get('[data-testid=edit-upload]').trigger('click'); await flushPromises() }
    expect(replace.mock.calls[0][1].name).toBe('비밀.docx') // 가짜 편집기 ext=docx
    expect(replace.mock.calls[1][0]).toEqual(next)
  })
  it('원본 비밀번호 키를 모르면(LOCK) 저장하지 않고 안내한다', async () => {
    const replace = vi.fn(async () => ({ ok: false, code: 'LOCK' }))
    await mountSheet({ file: { name: 'ID', roomId: 'r1', locked: true, size: 1 }, replace })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(client.markSaved).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('비밀번호 확인이 끝나지 않아')
  })
  it('원본을 못 지우면 둘 다 남았다고 알린다', async () => {
    await mountSheet({ file: { name: 'old.doc', roomId: 'r1', size: 1 }, replace: vi.fn(async (c) => ({ ok: true, next: c, removed: false })) })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('둘 다 남았어요')
  })
  it('doc → docx 변환 알림과 이름', async () => {
    const replace = vi.fn(async (c) => ({ ok: true, next: c, removed: true }))
    await mountSheet({ file: { name: 'old.doc', roomId: 'r1', size: 1 }, replace, client: fakeClientFactory({ ext: 'docx' }) })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(replace.mock.calls[0][1].name).toBe('old.docx')
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('docx로 저장됩니다')
  })
  it('저장 실패하면 markSaved 를 부르지 않는다', async () => {
    await mountSheet({ upload: vi.fn(async () => false) })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    await wrapper.get('[data-testid=edit-upload]').trigger('click')
    await flushPromises()
    expect(client.markSaved).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid=edit-msg]').text()).toContain('저장하지 못했습니다')
  })
  it('한글 저장 메뉴: 원래 형식이 위, 내려받기는 format 지정', async () => {
    await mountSheet({ file: { name: 'a.hwpx', roomId: 'r1', size: 1 } })
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    const items = wrapper.findAll('[role=menuitem]').map((w) => w.text())
    expect(items).toEqual(['저장 (원본 덮어쓰기)', 'HWPX로 내려받기', 'HWP로 내려받기'])
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    await wrapper.get('[data-testid=edit-dl-hwp]').trigger('click')
    await flushPromises()
    expect(client.export).toHaveBeenCalledWith('hwp')
  })
  it('오피스 저장 메뉴는 내려받기 하나', async () => {
    await mountSheet()
    await wrapper.get('[data-testid=edit-save]').trigger('click')
    expect(wrapper.findAll('[role=menuitem]').map((w) => w.text())).toEqual(['저장 (원본 덮어쓰기)', '내려받기'])
  })
  it('편집기의 saveRequest(Ctrl+S) 가 오면 바로 덮어쓰기 저장한다', async () => {
    const replace = vi.fn(async (c) => ({ ok: true, next: c, removed: true }))
    await mountSheet({ replace })
    client.emit('saveRequest')
    await flushPromises()
    expect(replace).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid=edit-menu]').exists()).toBe(false)
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
