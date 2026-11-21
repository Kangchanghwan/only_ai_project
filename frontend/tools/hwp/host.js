/**
 * /tools/hwp/ 호스트 페이지.
 * 편집기(rhwp-studio)는 사용자가 파일을 열거나 "새 문서"를 누를 때에만 iframe 으로 만든다.
 * 단순 방문에서는 편집기 출처에 요청을 한 건도 보내지 않는다.
 * 편집기는 별도 출처(https://hwp.clipboardapp.org, 저장소 hwp-editor)에 따로 배포되어 있고, SDK 와 postMessage 로만 대화한다.
 * 같은 출처 가정(iframe 문서 읽기, localStorage 공유)은 쓰지 않는다 (src/services/hwpStudio.js).
 *
 * window.cbHwp (에이전트용, 안정 표면):
 *   ready()                   편집기를 만들고 준비되면 resolve
 *   open(bytes, name, {discard}) 문서 열기 -> { pageCount } (discard 기본 true: 저장 확인 대화상자 없이 바꾼다)
 *   newDocument()             새 빈 문서
 *   commands()                studio 커맨드 목록
 *   exec(id, params, opts)    커맨드 실행 (대화상자 커맨드는 opts.allowDialog:true)
 *   call(action, args)        hwpctrl.call
 *   batch(fn)                 hwpctrl.batch (한 트랜잭션)
 *   fillFields(obj)           누름틀 값 일괄 입력 (PutFieldText)
 *   exportHwpx() / exportHwp()  Uint8Array
 *   pageCount()               페이지 수
 *   layout()                  'landing' | 'editor' (문서를 열면 편집 화면이 페이지 전체를 쓴다)
 *
 * 대화상자 없이 문서를 고치는 함수 (실제 함수는 편집기 쪽 hwp-editor agent/ 에 있고, 여기서는 같은 이름·인자로
 * postMessage 창구(src/services/hwpAgentClient.js)를 거쳐 부른다. 단위는 pt):
 *   outline({from,to}) find(text) getTable(i,ctrlIdx) listObjects() check({maxPages})
 *   replaceParagraph(i,text,{expect}) insertParagraphAfter(i,text,{like}) deleteParagraphs(from,to)
 *   setParaShape(i|[from,to],{left,right,indent,align,lineSpacing,before,after}) setCharShape(i,{from,to,size,bold,italic,underline,color,font})
 *   insertTable(afterPara,{rows,cols,colWidths(mm),cells,header:{bold,align,shade},fit,anchorLeft(pt),align,cellAlign,colAlign:[..],cellSize(pt),cellPadding(mm)})
 *     너비: 기본 = 쪽 글 영역 − 앞 문단 좌·우 여백, colWidths 합이 넘으면 TOO_WIDE (fit:true 면 비율 축소)
 *     align = 표 위치(left|center|right), 칸 글 정렬은 cellAlign/colAlign/header.align, header.shade = 머리 행 배경 #RRGGBB
 *   deleteObject({para,ctrlIdx})
 *   edit(label, a => {...})   여러 편집을 undo 한 단계로 (a 의 함수는 동기)
 *   undo() redo() status() dialogs() dismissDialogs() guard(fn,{timeout})
 *   edit 의 a => {...} 는 이 페이지에서 호출을 기록해 보낸다: 앞 호출 결과는 그대로 다음 인자로 넘길 수 있고, 결과로 계산·분기는 못 한다(EDIT_REF)
 */
import './../tools.css'
import { trackEvent } from '../ga.js'
import { isPhone } from '../../src/utils/isPhone.js'
import { renderPages } from '../../src/services/hwpViewer.js'
import { preloadEngine, progressText } from '../../src/services/hwpEngine.js'
import { AGENT_METHODS } from '../../src/services/hwpAgentMethods.js'
import { editorConfig, hostTheme, applyBarColors, applyStudioTheme, watchHostTheme, watchDirty } from '../../src/services/hwpStudio.js'

const EDITOR = editorConfig() // 편집기 주소 (기본 https://hwp.clipboardapp.org/, localhost 에서만 ?hed= 로 바꿈)
const $ = (id) => document.getElementById(id)
const wrap = $('editor-wrap')
const statusEl = $('status')
const barMsg = $('bar-msg')

let studioPromise = null
let studio = null
let currentName = '문서' // 저장 파일 이름(확장자 없음)
// 폰은 보기 전용: studio는 화면 밖에 숨기고 쪽을 SVG 목록으로만 보여 준다 (메뉴·툴바·입력 없음)
const phone = isPhone()
if (phone) document.body.classList.add('phone')
const viewerEl = $('viewer')
let viewer = null
let layoutState = 'landing'
let dirty = false
let pushed = false
let skipConfirm = false

// 상태 문구: 첫 화면은 안내 문단에, 편집 화면은 상단 바 안에 보인다
const bootEl = $('boot')
function bootShow(p) {
  bootEl.hidden = false
  $('boot-text').textContent = progressText(p)
  const fill = $('boot-fill')
  fill.classList.toggle('busy', p.phase !== 'download')
  fill.style.width = p.phase === 'download' ? Math.min(100, (p.loaded / p.total) * 100) + '%' : ''
}
const bootHide = () => { bootEl.hidden = true }

let msgTimer = null
const setStatus = (msg) => {
  statusEl.textContent = msg
  barMsg.textContent = msg
  barMsg.title = msg
  // 바 안의 문구는 몇 초 뒤 사라진다 (진행 중 문구는 끝나면 다른 문구로 바뀐다)
  clearTimeout(msgTimer)
  if (msg && !/중입니다/.test(msg)) msgTimer = setTimeout(() => { barMsg.textContent = ''; barMsg.title = '' }, 6000)
}

/** 상단 바 색: 편집기 메뉴 줄과 같은 색 (다른 출처라 읽지 않고, 테마별 고정 색표를 쓴다) */
function syncBarColors() {
  return applyBarColors($('editor-root'), hostTheme())
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
  try { return !!(await studio.getDocumentState()).dirty || dirty } catch { return true }
}

async function confirmLeave() {
  return !(await isDirty()) || window.confirm('저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?')
}

let dirtyWatch = null
let stopThemeWatch = null

function ensure() {
  if (!studioPromise) {
    setLayout('editor')
    setStatus('편집기를 불러오는 중입니다. 처음에는 30MB 정도를 받아 시간이 걸릴 수 있습니다.')
    studioPromise = preloadEngine(bootShow)
      .then(() => { bootShow({ phase: 'render' }) })
      .then(() => import('@rhwp/editor'))
      .then(({ createStudio }) => createStudio(wrap, { studioUrl: EDITOR.studioUrl, plugins: ['hwpctrl'], ...(phone ? { chrome: { menu: false, toolbar: false, statusbar: false } } : {}) }))
      .then(async (s) => {
        studio = s
        // 테마는 이 페이지가 정한다. 적용될 때까지 편집기를 가려 기본 테마가 번쩍이지 않게 한다 (편집기는 자기 저장소에 기억함)
        wrap.classList.add('theming')
        try { await applyStudioTheme(s, hostTheme()) } finally { wrap.classList.remove('theming') }
        syncBarColors()
        stopThemeWatch?.()
        stopThemeWatch = watchHostTheme((mode) => { applyStudioTheme(s, mode); syncBarColors() })
        // 변경 표시: 에이전트 적용/되돌리기는 이벤트로, 타이핑은 편집 화면이 보일 때 getDocumentState 확인으로
        if (typeof s.onDocumentChanged === 'function') s.onDocumentChanged(() => setDirty(true))
        dirtyWatch = watchDirty(s, (v) => { if (v) setDirty(true) }, { active: () => layoutState === 'editor' && !phone })
        setStatus('')
        return s
      })
      .catch((e) => {
        studioPromise = null
        bootHide()
        setLayout('landing')
        setStatus('편집기를 불러오지 못했습니다: ' + (e && e.message ? e.message : e))
        throw e
      })
  }
  return studioPromise
}

const baseName = (n) => (n || '문서').replace(/\.(hwpx?|HWPX?)$/, '') || '문서'

/**
 * opts.discard: 저장하지 않은 변경이 있어도 "저장 확인" 대화상자 없이 문서를 바꾼다 (rhwp-studio main.ts:2331 loadFile 의
 * skipUnsavedGuard). 에이전트 호출(window.cbHwp.open)만 켠다. 사람이 쓰는 화면 흐름은 그대로 묻는다(confirmLeave).
 */
async function open(bytes, name, opts = {}) {
  setLayout('editor')
  const s = await ensure()
  currentName = baseName(name)
  setName(name || currentName + '.hwpx')
  const file = name || currentName + '.hwpx'
  const res = opts.discard
    ? await (await getAgent()).guard(() => s.loadFile(bytes, file, { skipUnsavedGuard: true }), { timeout: 60000 })
    : await s.loadFile(bytes, file)
  await dirtyWatch?.reset()
  syncBarColors()
  if (phone) {
    viewer?.destroy()
    viewer = renderPages(viewerEl, s, res.pageCount)
    await viewer.ready
  }
  bootHide()
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
  await dirtyWatch?.reset()
  bootHide()
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
  try { await s.notifySaved(`${currentName}.${kind}`); await dirtyWatch?.reset(); setDirty(false) } catch { /* 저장 표시는 없어도 된다 */ }
  trackEvent('tool_hwp_save', { file_type: kind })
}

// 에이전트 함수: 실제 함수는 편집기 쪽에 있고, 여기서는 postMessage 창구로 같은 이름·인자를 대신 전한다.
// 창구 코드는 처음 부를 때 불러온다 (첫 화면 번들에 넣지 않는다)
let agentPromise = null
const getAgent = () => {
  if (!agentPromise) {
    agentPromise = ensure()
      .then(() => import('../../src/services/hwpAgentClient.js'))
      .then(({ createAgentClient }) => createAgentClient({ getFrameWindow: () => wrap.querySelector('iframe')?.contentWindow, origin: EDITOR.origin, methods: AGENT_METHODS }))
      .catch((e) => { agentPromise = null; throw e })
  }
  return agentPromise
}
const agentApi = {}
for (const name of AGENT_METHODS) agentApi[name] = async (...args) => (await getAgent())[name](...args)

window.cbHwp = {
  ...agentApi,
  layout: () => layoutState,
  ready: async () => { await ensure(); return true },
  open: (bytes, name, opts) => open(bytes, name, { discard: true, ...opts }), // 에이전트: 기본으로 저장 확인 없이 연다
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
