/**
 * /tools/hwp/ 호스트 페이지.
 * 편집기(rhwp-studio)는 사용자가 파일을 열거나 "새 문서"를 누를 때에만 iframe 으로 만든다.
 * 단순 방문에서는 /tools/hwp/studio/ 아래 파일을 한 건도 요청하지 않는다.
 *
 * window.cbHwp (에이전트용, 안정 표면):
 *   ready()                   편집기를 만들고 준비되면 resolve
 *   open(bytes, name)         문서 열기 -> { pageCount }
 *   newDocument()             새 빈 문서
 *   commands()                studio 커맨드 목록
 *   exec(id, params, opts)    커맨드 실행 (대화상자 커맨드는 opts.allowDialog:true)
 *   call(action, args)        hwpctrl.call
 *   batch(fn)                 hwpctrl.batch (한 트랜잭션)
 *   fillFields(obj)           누름틀 값 일괄 입력 (PutFieldText)
 *   exportHwpx() / exportHwp()  Uint8Array
 *   pageCount()               페이지 수
 *   layout()                  'landing' | 'editor' (문서를 열면 편집 화면이 페이지 전체를 쓴다)
 */
import './../tools.css'
import { trackEvent } from '../ga.js'

const STUDIO_URL = '/tools/hwp/studio/'
const $ = (id) => document.getElementById(id)
const wrap = $('editor-wrap')
const statusEl = $('status')
const barMsg = $('bar-msg')

let studioPromise = null
let studio = null
let currentName = '문서' // 저장 파일 이름(확장자 없음)
let layoutState = 'landing'
let dirty = false
let pushed = false
let skipConfirm = false

// 상태 문구: 첫 화면은 안내 문단에, 편집 화면은 상단 바 안에 보인다
let msgTimer = null
const setStatus = (msg) => {
  statusEl.textContent = msg
  barMsg.textContent = msg
  barMsg.title = msg
  // 바 안의 문구는 몇 초 뒤 사라진다 (진행 중 문구는 끝나면 다른 문구로 바뀐다)
  clearTimeout(msgTimer)
  if (msg && !/중입니다/.test(msg)) msgTimer = setTimeout(() => { barMsg.textContent = ''; barMsg.title = '' }, 6000)
}

/** studio 메뉴 줄의 배경·글자·아래 테두리 색을 읽어 우리 바에 같은 색을 준다 (같은 출처 iframe) */
function syncBarColors() {
  const root = $('editor-root')
  try {
    const doc = wrap.querySelector('iframe').contentDocument
    const el = doc.getElementById('menu-bar')
    if (!el) throw new Error('no menu')
    const cs = doc.defaultView.getComputedStyle(el)
    root.style.setProperty('--bar-bg', cs.backgroundColor)
    root.style.setProperty('--bar-fg', cs.color)
    const w = parseFloat(cs.borderBottomWidth) || 0
    root.style.setProperty('--bar-bd-w', w > 0 && cs.borderBottomStyle !== 'none' ? w + 'px' : '0px')
    root.style.setProperty('--bar-bd', cs.borderBottomColor)
    return true
  } catch {
    for (const k of ['--bar-bg', '--bar-fg', '--bar-bd', '--bar-bd-w']) root.style.removeProperty(k) // 토큰 색으로
    return false
  }
}
function watchStudioTheme() {
  try {
    const de = wrap.querySelector('iframe').contentDocument.documentElement
    new MutationObserver(() => requestAnimationFrame(syncBarColors)).observe(de, { attributes: true })
  } catch { /* 읽을 수 없으면 토큰 색 */ }
}

function setName(n) {
  $('bar-name').textContent = n
  $('bar-name').title = n
}
function setDirty(v) { dirty = v; $('bar-dot').hidden = !v }

function setLayout(mode) {
  layoutState = mode
  document.body.classList.toggle('ed', mode === 'editor')
  if (mode === 'editor' && !pushed) {
    pushed = true
    history.pushState({ cbHwpEditor: 1 }, '', location.href) // 뒤로 가기는 첫 화면으로
  }
}

/** 저장하지 않은 변경이 있는지. 읽을 수 없으면 있다고 보고 항상 묻는다 */
async function isDirty() {
  if (!studio) return false
  try { return !!(await studio.getDocumentState()).dirty } catch { return true }
}

async function confirmLeave() {
  return !(await isDirty()) || window.confirm('저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?')
}

/**
 * 같은 출처의 studio는 부팅 전에 localStorage 'rhwp-settings'(theme.mode/skin)를 읽는다.
 * 이 페이지의 실제 테마(라이트/다크)와 스킨을 미리 넣어 편집기도 같은 테마로 열게 한다. 다른 설정은 그대로 둔다.
 */
const STUDIO_SKIN = 'flat'
function syncStudioTheme() {
  try {
    const effective = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    const settings = JSON.parse(localStorage.getItem('rhwp-settings') || '{}') || {}
    settings.theme = { ...(settings.theme || {}), mode: effective, skin: STUDIO_SKIN }
    localStorage.setItem('rhwp-settings', JSON.stringify(settings))
  } catch { /* 저장소를 못 쓰면 studio 기본 테마로 열린다 */ }
}

function ensure() {
  if (!studioPromise) {
    syncStudioTheme()
    setLayout('editor')
    setStatus('편집기를 불러오는 중입니다. 처음에는 30MB 정도를 받아 시간이 걸릴 수 있습니다.')
    studioPromise = import('@rhwp/editor')
      .then(({ createStudio }) => createStudio(wrap, { studioUrl: STUDIO_URL, plugins: ['hwpctrl'] }))
      .then((s) => {
        studio = s
        if (typeof s.onDocumentChanged === 'function') s.onDocumentChanged(() => setDirty(true))
        wrap.querySelector('iframe').addEventListener('load', () => { syncBarColors(); watchStudioTheme() })
        syncBarColors(); watchStudioTheme()
        setStatus('')
        return s
      })
      .catch((e) => {
        studioPromise = null
        setLayout('landing')
        setStatus('편집기를 불러오지 못했습니다: ' + (e && e.message ? e.message : e))
        throw e
      })
  }
  return studioPromise
}

const baseName = (n) => (n || '문서').replace(/\.(hwpx?|HWPX?)$/, '') || '문서'

async function open(bytes, name) {
  setLayout('editor')
  const s = await ensure()
  currentName = baseName(name)
  setName(name || currentName + '.hwpx')
  const res = await s.loadFile(bytes, name || currentName + '.hwpx')
  syncBarColors()
  setDirty(false)
  trackEvent('tool_hwp_open', { file_type: /\.hwp$/i.test(name || '') ? 'hwp' : 'hwpx' })
  setStatus('')
  return res
}

async function newDocument() {
  setLayout('editor')
  const s = await ensure()
  currentName = '새 문서'
  setName('새 문서')
  const r = await s.commands.execute('file:new-doc', {}, { allowDialog: true })
  setDirty(false)
  trackEvent('tool_hwp_open', { file_type: 'new' })
  return r
}

function download(bytes, filename, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

async function save(kind) {
  const s = await ensure()
  const bytes = kind === 'hwpx' ? await s.exportHwpx() : await s.exportHwp()
  download(bytes, `${currentName}.${kind}`, 'application/octet-stream')
  try { await s.notifySaved(`${currentName}.${kind}`); setDirty(false) } catch { /* 저장 표시는 없어도 된다 */ }
  trackEvent('tool_hwp_save', { file_type: kind })
}

window.cbHwp = {
  layout: () => layoutState,
  ready: async () => { await ensure(); return true },
  open,
  newDocument,
  commands: async () => (await ensure()).commands.list(),
  exec: async (id, params, opts) => (await ensure()).commands.execute(id, params, opts),
  call: async (action, args) => (await ensure()).hwpctrl.call(action, args),
  batch: async (fn) => (await ensure()).hwpctrl.batch(fn),
  fillFields: async (obj) => (await ensure()).hwpctrl.batch((h) => {
    for (const [k, v] of Object.entries(obj || {})) h.PutFieldText(k, String(v))
  }),
  exportHwpx: async () => (await ensure()).exportHwpx(),
  exportHwp: async () => (await ensure()).exportHwp(),
  pageCount: async () => (await ensure()).pageCount(),
}

async function openFile(file) {
  if (!file) return
  if (!/\.hwpx?$/i.test(file.name)) { setStatus('.hwp 또는 .hwpx 파일만 열 수 있습니다.'); return }
  if (layoutState === 'editor' && !(await confirmLeave())) return
  try { await open(new Uint8Array(await file.arrayBuffer()), file.name) }
  catch (e) { setStatus('파일을 열지 못했습니다: ' + (e && e.message ? e.message : e)) }
}

async function closeEditor() {
  if (!(await confirmLeave())) return
  skipConfirm = true
  if (pushed) history.back() // popstate 에서 첫 화면으로 돌아간다
  else { setLayout('landing'); skipConfirm = false }
}

window.addEventListener('popstate', async () => {
  if (layoutState !== 'editor') return
  if (!skipConfirm && !(await confirmLeave())) {
    history.pushState({ cbHwpEditor: 1 }, '', location.href) // 취소: 편집 화면에 머문다
    return
  }
  skipConfirm = false
  pushed = false
  setLayout('landing')
  setStatus('')
})

const input = $('file')
const menu = $('bar-menu')
const menuBtn = $('bar-menu-btn')
const fail = (what) => (e) => setStatus(what + ': ' + (e && e.message ? e.message : e))

const actions = {
  'save-hwpx': () => save('hwpx').catch(fail('저장하지 못했습니다')),
  'save-hwp': () => save('hwp').catch(fail('저장하지 못했습니다')),
  other: () => input.click(),
  close: () => closeEditor(),
}

document.addEventListener('click', (e) => {
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
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true })

$('btn-open').addEventListener('click', () => input.click())
input.addEventListener('change', () => { openFile(input.files[0]); input.value = '' })
$('btn-new').addEventListener('click', () => { newDocument().catch(fail('새 문서를 만들지 못했습니다')) })

// 파일을 페이지 어디에 놓아도 편집 화면으로 연다
const dragHasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
const drop = $('drop')
document.addEventListener('dragenter', (e) => { if (dragHasFiles(e)) { e.preventDefault(); drop.classList.add('over') } })
document.addEventListener('dragover', (e) => { if (dragHasFiles(e)) e.preventDefault() })
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over') })
document.addEventListener('drop', (e) => {
  if (!dragHasFiles(e)) return
  e.preventDefault()
  drop.classList.remove('over')
  openFile(e.dataTransfer.files[0])
})
