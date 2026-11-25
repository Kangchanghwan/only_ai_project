/**
 * /tools/hwp/ 호스트 페이지 로직 (Vue 없음).
 * 편집기(https://hwp.clipboardapp.org)는 사용자가 '파일 열기'로 파일을 고르기 전에는 iframe 도, 그 출처로 가는 요청도 만들지 않는다.
 * 편집기와는 cbEdit v1 규약(src/services/editorClient.js)으로만 대화한다. 파일 이름·내용은 분석 이벤트로 보내지 않는다.
 */
import { createEditorClient } from '../../src/services/editorClient.js'
import { extOf, baseNameOf } from '../../src/utils/editTarget.js'
import { handoffStore } from '../../src/services/handoffStore.js'

export const DEFAULT_ORIGIN = 'https://hwp.clipboardapp.org'
export const MAX_BYTES = 200 * 1024 * 1024
const THEME_KEY = 'clipboard-share-theme'

const STR = {
  loading: '편집기를 불러오는 중입니다. 처음에는 시간이 걸릴 수 있습니다.',
  opening: '문서를 여는 중입니다…',
  onlyHwp: '.hwp 또는 .hwpx 파일만 열 수 있습니다.',
  tooBig: '파일이 커서 이 화면에서 열 수 없습니다.',
  openFail: '파일을 열지 못했습니다.',
  editorFail: '편집기를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  engineDown: '편집기가 멈췄습니다. 닫고 다시 열어 주세요.',
  saveFail: '저장할 내용을 만들지 못했습니다.',
  saved: (n) => `${n} 저장했습니다`,
  sending: '폰으로 보낼 파일을 준비하는 중입니다…',
  sendFail: '폰으로 보내지 못했습니다. 다시 시도해 주세요.',
  confirm: '저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?',
}

export function themeOf(doc = document) {
  return doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/**
 * @param {{ doc?: Document, win?: Window, origin?: string, store?: object, track?: Function,
 *           createClient?: Function, download?: Function, navigate?: Function, now?: Function }} [o]
 */
export function initHost(o = {}) {
  const doc = o.doc || document
  const win = o.win || window
  const origin = String(o.origin || import.meta.env?.VITE_HWP_EDITOR_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const track = o.track || (() => {})
  const make = o.createClient || createEditorClient
  const $ = (id) => doc.getElementById(id)
  const wrap = $('editor-wrap')
  const statusEl = $('status')
  const barMsg = $('bar-msg')
  const menu = $('bar-menu')
  const menuBtn = $('bar-menu-btn')
  const input = $('file')

  let frame = null
  let client = null
  let readyPromise = null
  let name = ''
  let dirty = false
  let leaving = false
  let busy = false
  let msgTimer = null
  let unsubs = []

  const download = o.download || ((bytes, filename, mime) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }))
    const a = doc.createElement('a')
    a.href = url
    a.download = filename
    doc.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  })
  const navigate = o.navigate || ((url) => win.location.assign(url))

  function setStatus(msg) {
    statusEl.textContent = msg
    barMsg.textContent = msg
    barMsg.title = msg
    clearTimeout(msgTimer)
    if (msg && !/…$/.test(msg)) msgTimer = setTimeout(() => { barMsg.textContent = ''; barMsg.title = '' }, 6000)
  }
  function setDirty(v) {
    dirty = !!v
    $('bar-dot').hidden = !dirty
  }
  function setName(n) {
    name = n
    $('bar-name').textContent = n
    $('bar-name').title = n
  }
  function showEditor(on) {
    doc.body.classList.toggle('ed', on)
  }
  function applyChrome(c) {
    const root = $('editor-root')
    if (!c) return
    if (c.bg) root.style.setProperty('--bar-bg', c.bg)
    if (c.fg) root.style.setProperty('--bar-fg', c.fg)
    if (c.border) root.style.setProperty('--bar-bd', c.border)
  }

  /** 처음 파일을 고른 뒤에 한 번만 만든다. 이 전에는 편집기 출처로 가는 요청이 없다 */
  function ensureFrame() {
    if (readyPromise) return readyPromise
    frame = doc.createElement('iframe')
    frame.title = '한글 문서 편집기'
    frame.setAttribute('allow', 'clipboard-read; clipboard-write')
    client = make({ getWindow: () => frame?.contentWindow || null, origin, win })
    unsubs = [
      client.on('ready', (d) => applyChrome(d?.chrome)),
      client.on('chrome', (d) => applyChrome(d?.chrome)),
      client.on('dirty', (d) => setDirty(d?.dirty)),
      client.on('saveRequest', () => { saveAs(null) }),
      client.on('error', () => setStatus(STR.engineDown)),
    ]
    const ready = client.whenReady()
    frame.src = `${origin}/?embed=cs&theme=${themeOf(doc)}`
    wrap.appendChild(frame)
    readyPromise = ready.then((r) => r, (e) => {
      readyPromise = null
      unsubs.forEach((u) => u?.())
      client.destroy()
      frame.remove()
      frame = null
      client = null
      throw e
    })
    return readyPromise
  }

  async function confirmDiscard() {
    return !dirty || win.confirm(STR.confirm)
  }

  async function openFile(file) {
    if (!file || busy) return
    const ext = extOf(file.name)
    if (ext !== 'hwp' && ext !== 'hwpx') { setStatus(STR.onlyHwp); return }
    if (file.size > MAX_BYTES) { setStatus(STR.tooBig); return }
    if (!(await confirmDiscard())) return
    busy = true
    showEditor(true)
    setName(file.name)
    setStatus(STR.loading)
    try {
      try { await ensureFrame() } catch { showEditor(false); setStatus(STR.editorFail); return }
      setStatus(STR.opening)
      const buf = await file.arrayBuffer()
      try {
        await client.open(file.name, buf)
      } catch {
        if (!dirty) showEditor(false)
        setStatus(STR.openFail)
        return
      }
      setDirty(false)
      setStatus('')
      track('tool_open', { ext })
    } finally {
      busy = false
    }
  }

  /** format: 'hwp' | 'hwpx' | null(원래 형식) */
  async function exportDoc(format) {
    if (!client) throw new Error('NO_EDITOR')
    return client.export(format || undefined)
  }

  async function saveAs(format) {
    if (!client) return
    try {
      const r = await exportDoc(format)
      const filename = `${baseNameOf(name) || '문서'}.${r.ext}`
      download(r.bytes, filename, r.mime)
      client.markSaved().catch(() => {})
      setDirty(false)
      setStatus(STR.saved(filename))
      track('tool_save', { format: r.ext })
    } catch {
      setStatus(STR.saveFail)
    }
  }

  async function sendToPhone() {
    if (!client) return
    setStatus(STR.sending)
    try {
      const r = await exportDoc(null)
      const filename = `${baseNameOf(name) || '문서'}.${r.ext}`
      const id = await (o.store || handoffStore()).put({ name: filename, type: r.mime, bytes: r.bytes })
      track('tool_send_to_phone')
      leaving = true // 이동할 때 "저장하지 않은 변경" 경고를 띄우지 않는다 (방금 내보낸 내용이 그대로 간다)
      setTimeout(() => navigate(`/?handoff=${encodeURIComponent(id)}&from=tools-hwp`), 150) // 측정 이벤트가 나갈 틈
    } catch {
      leaving = false
      setStatus(STR.sendFail)
    }
  }

  async function closeEditor() {
    if (!(await confirmDiscard())) return
    setDirty(false)
    showEditor(false)
    setStatus('')
  }

  const actions = {
    'save-hwpx': () => saveAs('hwpx'),
    'save-hwp': () => saveAs('hwp'),
    'send-phone': () => sendToPhone(),
    other: () => input.click(),
    close: () => closeEditor(),
  }

  const onClick = (e) => {
    const act = e.target.closest && e.target.closest('[data-act]')
    if (act && actions[act.dataset.act]) {
      menu.hidden = true
      menuBtn.setAttribute('aria-expanded', 'false')
      actions[act.dataset.act]()
      return
    }
    if (e.target === menuBtn) {
      menu.hidden = !menu.hidden
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden))
    } else if (!menu.hidden && !menu.contains(e.target)) {
      menu.hidden = true
      menuBtn.setAttribute('aria-expanded', 'false')
    }
  }
  doc.addEventListener('click', onClick)
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') menu.hidden = true
    // 편집기 밖(바)에 포커스가 있을 때의 Ctrl/Cmd+S. 편집기 안은 saveRequest 이벤트로 온다
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 's' && doc.body.classList.contains('ed')) {
      e.preventDefault()
      saveAs(null)
    }
  })
  $('btn-open').addEventListener('click', () => input.click())
  input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; openFile(f) })

  // 파일을 페이지 어디에 놓아도 연다
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
  const drop = $('drop')
  doc.addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); drop.classList.add('over') } })
  doc.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault() })
  doc.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over') })
  doc.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    drop.classList.remove('over')
    openFile(e.dataTransfer.files[0])
  })

  // 편집 중 페이지를 나가려 하면 (변경이 있을 때만) 경고
  win.addEventListener('beforeunload', (e) => {
    if (!dirty || leaving) return
    e.preventDefault()
    e.returnValue = ''
  })

  // 다크 모드: theme-init.js 가 정한 data-theme 을 따르고, 바뀌면 편집기에도 알린다
  const syncTheme = () => { if (client) client.setTheme(themeOf(doc)).catch(() => {}) }
  if (typeof win.MutationObserver === 'function') {
    new win.MutationObserver(syncTheme).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
  win.addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY || (e.newValue !== 'light' && e.newValue !== 'dark')) return
    doc.documentElement.setAttribute('data-theme', e.newValue)
    doc.body.className = e.newValue
  })

  return { openFile, saveAs, sendToPhone, closeEditor, isOpen: () => !!frame, getState: () => ({ name, dirty }) }
}
