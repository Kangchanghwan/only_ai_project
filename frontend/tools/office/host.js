/**
 * /tools/office/ 숨김 페이지 (PR-A). 오피스 편집기(ranuts/document)를 다른 출처에서 iframe 으로 띄우고,
 * 저장할 때 편집기가 몰래 바꾼 부분을 원래대로 되돌린다 (src/services/officeIntegrity).
 *
 * 흐름: 파일 선택 -> prepareForEditor -> document:ready 를 기다려 document:open-buffer
 *   -> document:opened 직후 document:save 로 기준본 B (사용자에게 보이지 않음) -> precheck 안내(막지 않음)
 *   -> 사용자 편집 -> "내 기기로 저장": 바뀐 게 없으면 알리고 끝, 있으면 document:save -> restoreAfterSave -> 내려받기
 *
 * 편집기 출처: 빌드 때 VITE_OFFICE_EDITOR_ORIGIN (프로덕션은 frontend/.env.production 의 https://office.clipboardapp.org).
 * 이 페이지가 localhost 에서 돌 때만 ?ed= 로 바꿀 수 있다. 출처가 없으면 "편집기 준비 중" 만 보이고 아무것도 받지 않는다.
 *
 * 편집기 빌드 확인: 편집기가 준비되면 <origin>/build-identity.json 을 받아 시험한 빌드 목록(editorBuild.js)과 맞춰 본다.
 * 목록에 없으면 짧은 안내만 띄우고 편집은 그대로 허용한다. 저장 뒤 남은 차이 보고는 항상 한다.
 */
import '../tools.css'
import './office.css'
import { resolveEditorOrigin } from './origin.js'

const $ = (id) => document.getElementById(id)
const EXTS = ['docx', 'xlsx', 'pptx']
const READY_TIMEOUT = 120000
const SAVE_TIMEOUT = 120000

const editorOrigin = resolveEditorOrigin(import.meta.env.VITE_OFFICE_EDITOR_ORIGIN, location)

let frame = null
let readyPromise = null
let readyResolve = null
const pending = new Map() // command id -> { resolve, reject, type }
let integrity = null // lazy module
let file = null // { name, base, ext, original: Uint8Array, prepared, ctx, baseline }
let baselineDone = false
let everDirty = false
let busy = false
let buildCheck = null // Promise<{ status, identity, notice }>, 편집기 하나에 한 번
let buildStatus = 'pending'
let buildNotice = ''
let precheckNotice = ''

const setStatus = (msg) => { $('status').textContent = msg; $('bar-msg').textContent = msg; $('bar-msg').title = msg }

function show(el, html) {
  el.hidden = !html
  el.innerHTML = html || ''
}
function renderNotice() {
  show($('notice'), [buildNotice && esc(buildNotice), precheckNotice].filter(Boolean).join('<br>'))
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function send(type, payload = {}, transfer) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  frame.contentWindow.postMessage({ id, type, payload }, editorOrigin, transfer || [])
  return id
}

/** Send a command and wait for the matching event (by id when the editor echoes it, else by type). */
function request(type, payload, doneType, timeout) {
  return new Promise((resolve, reject) => {
    const id = send(type, payload)
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('편집기가 응답하지 않아요')) }, timeout)
    pending.set(id, { doneType, resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
  })
}

function settle(id, type, payload) {
  let entry = id && pending.get(id)
  let key = id
  if (!entry || (type !== 'document:error' && entry.doneType !== type)) {
    // fall back to the oldest request waiting for this event type
    entry = null
    for (const [k, v] of pending) if (v.doneType === type || type === 'document:error') { entry = v; key = k; break }
  }
  if (!entry) return false
  pending.delete(key)
  if (type === 'document:error') entry.reject(new Error(payload?.message || '편집기 오류'))
  else entry.resolve(payload)
  return true
}

window.addEventListener('message', (event) => {
  if (!frame || event.origin !== editorOrigin || event.source !== frame.contentWindow) return
  const { id, type, payload } = event.data || {}
  if (typeof type !== 'string' || !type.startsWith('document:')) return
  if (type === 'document:ready') { readyResolve?.(); return }
  if (type === 'document:dirty-changed') {
    if (baselineDone && payload?.dirty) everDirty = true
    return
  }
  if (settle(id, type, payload)) return
  if (type === 'document:error') setStatus('편집기 오류: ' + (payload?.message || ''))
})

function ensureFrame() {
  if (frame) return readyPromise
  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve
    setTimeout(() => reject(new Error('편집기를 불러오지 못했어요')), READY_TIMEOUT)
  })
  frame = document.createElement('iframe')
  frame.title = '문서 편집기'
  frame.src = editorOrigin + '/editor?embed=1&locale=ko&embedOrigin=' + encodeURIComponent(location.origin)
  $('editor-wrap').appendChild(frame)
  return readyPromise
}

async function fileBytes(payloadFile) {
  if (payloadFile instanceof Blob) return new Uint8Array(await payloadFile.arrayBuffer())
  if (payloadFile instanceof ArrayBuffer) return new Uint8Array(payloadFile)
  if (payloadFile?.buffer instanceof ArrayBuffer) return new Uint8Array(payloadFile.buffer)
  throw new Error('저장 결과를 읽지 못했어요')
}

async function save() {
  const payload = await request('document:save', {}, 'document:saved', SAVE_TIMEOUT)
  return fileBytes(payload?.file)
}

function enterEditor(name) {
  document.body.classList.add('ed')
  $('editor-root').hidden = false
  $('bar-name').textContent = name
  $('bar-name').title = name
}

async function openFile(f) {
  if (busy) return
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  if (!EXTS.includes(ext)) { setStatus('docx, xlsx, pptx 파일만 열 수 있어요'); return }
  busy = true
  $('btn-save').disabled = true
  precheckNotice = ''
  renderNotice()
  show($('report'), '')
  try {
    setStatus('파일을 준비하는 중입니다')
    integrity = integrity || (await import('../../src/services/officeIntegrity/index.js'))
    const original = new Uint8Array(await f.arrayBuffer())
    const { bytes: prepared, ctx } = await integrity.prepareForEditor(original, ext)
    file = { name: f.name, base: f.name.replace(/\.[^.]+$/, ''), ext, original, ctx, baseline: null }
    baselineDone = false
    everDirty = false
    enterEditor(f.name)
    $('frame-cover').hidden = false // no typing until the baseline is saved: it must not contain user edits
    setStatus('편집기를 불러오는 중입니다')
    await ensureFrame()
    checkBuildOnce()
    setStatus('문서를 여는 중입니다')
    const buffer = prepared.slice().buffer
    await request('document:open-buffer', { fileName: f.name, buffer, readonly: false }, 'document:opened', READY_TIMEOUT)
    // baseline: one save without edits, never shown to the user
    file.baseline = await save()
    baselineDone = true
    $('frame-cover').hidden = true
    setStatus('')
    $('btn-save').disabled = false
    const { items } = await integrity.precheck({ original, baseline: file.baseline, ext, ctx })
    if (items.length) {
      const labels = [...new Set(items.map((i) => i.label + (i.where ? ' (' + i.where + ')' : '')))]
      precheckNotice = '이 편집기는 이 문서의 일부를 원래대로 저장하지 못해요: ' + esc(labels.join(', ')) + '. 편집은 그대로 할 수 있어요.'
      renderNotice()
    }
  } catch (e) {
    setStatus(e?.message || '문서를 열지 못했어요')
    $('frame-cover').textContent = e?.message || '문서를 열지 못했어요'
  } finally {
    busy = false
  }
}

/** 편집기가 준비된 뒤 한 번만. 실패해도 편집에는 영향이 없다. */
function checkBuildOnce() {
  if (buildCheck) return
  buildCheck = integrity.checkEditorBuild(editorOrigin).then((r) => {
    buildStatus = r.status
    buildNotice = r.notice
    renderNotice()
    return r
  })
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function reportHtml(report) {
  const li = (arr, f) => '<ul>' + arr.map((x) => '<li>' + esc(f(x)) + '</li>').join('') + '</ul>'
  let h = '<button type="button" class="btn icon close" data-close aria-label="닫기">✕</button>'
  h += '<strong>저장했어요.</strong>'
  if (report.restored.length) h += ' 편집기가 바꾼 부분을 원래대로 되돌렸어요:' + li(report.restored, (r) => r.label)
  else h += ' 되돌릴 부분은 없었어요.'
  if (report.remaining.length) h += '원래와 다르게 남은 부분이 있어요:' + li(report.remaining, (r) => r.label + (r.where ? ' (' + r.where + ')' : ''))
  return h
}

async function saveToDevice() {
  if (busy || !file?.baseline) return
  if (!everDirty) { setStatus('바뀐 내용이 없어요'); return }
  busy = true
  $('btn-save').disabled = true
  let saved = null
  try {
    setStatus('저장하는 중입니다')
    saved = await save()
    const { bytes, report } = await integrity.restoreAfterSave({ original: file.original, baseline: file.baseline, saved, ext: file.ext, ctx: file.ctx })
    download(bytes, `${file.base} (수정).${file.ext}`)
    setStatus('')
    show($('report'), reportHtml(report))
  } catch (e) {
    setStatus(e?.message || '저장하지 못했어요')
    if (saved) {
      show($('report'), '되돌리기 검사에 실패했어요. <button type="button" class="btn" data-raw>편집기 저장본 그대로 받기</button>')
      $('report').querySelector('[data-raw]').onclick = () => download(saved, `${file.base} (수정).${file.ext}`)
    }
  } finally {
    busy = false
    $('btn-save').disabled = false
  }
}

$('report').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) show($('report'), '') })
$('btn-save').addEventListener('click', saveToDevice)
$('btn-close').addEventListener('click', () => {
  if (everDirty && !window.confirm('저장하지 않은 변경이 있으면 사라집니다. 닫을까요?')) return
  location.reload()
})
$('btn-open').addEventListener('click', () => $('file').click())
$('file').addEventListener('change', () => { const f = $('file').files[0]; $('file').value = ''; if (f) openFile(f) })

if (editorOrigin) $('picker').hidden = false
else $('not-ready').hidden = false

// 에이전트·시험용 읽기 전용 상태
window.cbOffice = { state: () => ({ origin: editorOrigin, opened: !!file?.baseline, dirty: everDirty, busy, editorBuild: buildStatus }) }
