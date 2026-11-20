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
 */
import './../tools.css'
import { trackEvent } from '../ga.js'

const STUDIO_URL = '/tools/hwp/studio/'
const $ = (id) => document.getElementById(id)
const wrap = $('editor-wrap')
const statusEl = $('status')

let studioPromise = null
let studio = null
let currentName = '문서'

const setStatus = (msg) => { statusEl.textContent = msg }

function ensure() {
  if (!studioPromise) {
    wrap.classList.add('on')
    setStatus('편집기를 불러오는 중입니다. 처음에는 30MB 정도를 받아 시간이 걸릴 수 있습니다.')
    studioPromise = import('@rhwp/editor')
      .then(({ createStudio }) => createStudio(wrap, { studioUrl: STUDIO_URL, plugins: ['hwpctrl'] }))
      .then((s) => {
        studio = s
        $('save-bar').hidden = false
        setStatus('')
        return s
      })
      .catch((e) => {
        studioPromise = null
        wrap.classList.remove('on')
        setStatus('편집기를 불러오지 못했습니다: ' + (e && e.message ? e.message : e))
        throw e
      })
  }
  return studioPromise
}

const baseName = (n) => (n || '문서').replace(/\.(hwpx?|HWPX?)$/, '') || '문서'

async function open(bytes, name) {
  const s = await ensure()
  currentName = baseName(name)
  const res = await s.loadFile(bytes, name || currentName + '.hwpx')
  trackEvent('tool_hwp_open', { file_type: /\.hwp$/i.test(name || '') ? 'hwp' : 'hwpx' })
  setStatus((name || '문서') + ' 을(를) 열었습니다.')
  return res
}

async function newDocument() {
  const s = await ensure()
  currentName = '새 문서'
  const r = await s.commands.execute('file:new-doc', {}, { allowDialog: true })
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
  trackEvent('tool_hwp_save', { file_type: kind })
}

window.cbHwp = {
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
  try { await open(new Uint8Array(await file.arrayBuffer()), file.name) }
  catch (e) { setStatus('파일을 열지 못했습니다: ' + (e && e.message ? e.message : e)) }
}

const input = $('file')
$('btn-open').addEventListener('click', () => input.click())
input.addEventListener('change', () => { openFile(input.files[0]); input.value = '' })
$('btn-new').addEventListener('click', () => { newDocument().catch((e) => setStatus('새 문서를 만들지 못했습니다: ' + (e && e.message ? e.message : e))) })
$('btn-save-hwpx').addEventListener('click', () => save('hwpx').catch((e) => setStatus('저장하지 못했습니다: ' + e.message)))
$('btn-save-hwp').addEventListener('click', () => save('hwp').catch((e) => setStatus('저장하지 못했습니다: ' + e.message)))

const drop = $('drop')
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over') })
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over') })
drop.addEventListener('drop', (e) => openFile(e.dataTransfer && e.dataTransfer.files[0]))
