<script setup>
/**
 * 방의 한글·오피스 파일 "수정" 화면: 방 위를 덮는 전체 화면 시트 (주소는 그대로, 소켓 유지).
 * 편집기는 별도 출처(한글 hwp.clipboardapp.org, 오피스 office.clipboardapp.org)의 iframe 이고
 * cbEdit v1 규약의 postMessage 로만 대화한다 (src/services/editorClient.js).
 * 이 시트를 열기 전(수정을 누르기 전)에는 iframe 도, 편집기 주소로 가는 요청도 없다.
 * 뒤로 가기·Esc·✕ 는 시트만 닫는다. 바뀐 내용이 있으면 닫기 전에 묻는다.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '../composables/useTheme'
import { editorKindOf, extOf, baseNameOf, editedName } from '../utils/editTarget'
import { createEditorClient } from '../services/editorClient'

const props = defineProps({
  file: { type: Object, required: true },
  scope: { type: String, default: null },
  // { maxBytes, getBytes(file)=>{name,bytes}, existingNames(roomId)=>string[], upload(File, scope)=>Promise<boolean> }
  hooks: { type: Object, required: true },
  // 잠긴 파일은 복호화 전에는 이름을 모르므로, 방에서 알고 있는 원래 이름을 힌트로 받는다
  nameHint: { type: String, default: '' },
  // 시험용: 가짜 편집기 창구를 끼워 넣는다 ({ getWindow, origin }) => client
  clientFactory: { type: Function, default: null },
})
const emit = defineEmits(['close'])

const MAX_EDIT_BYTES = 200 * 1024 * 1024 // 브라우저 메모리 보호
const STR = {
  ko: { loading: '편집기를 불러오는 중…', slow: '처음 한 번은 시간이 걸려요', fileBusy: '파일을 받는 중…', fail: '편집기를 열지 못했습니다.', failFile: '파일을 불러오지 못했습니다.', tooBig: '파일이 커서 이 화면에서 수정할 수 없어요', close: '닫기', save: '저장 ▾', up: '방에 올리기', dl: '내려받기', dlHwp: 'HWP로 내려받기', dlHwpx: 'HWPX로 내려받기', changed: '변경됨', confirm: '저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?', upping: '방에 올리는 중…', upok: '방에 올렸습니다: ', upfail: '방에 올리지 못했습니다.', exfail: '저장할 내용을 만들지 못했습니다.', saveAs: (e) => `${e}로 저장됩니다`, engineDown: '편집기가 멈췄습니다. 닫고 다시 열어 주세요.' },
  en: { loading: 'Loading the editor…', slow: 'The first time takes a while', fileBusy: 'Fetching the file…', fail: 'Could not open the editor.', failFile: 'Could not load the file.', tooBig: 'This file is too large to edit on this screen', close: 'Close', save: 'Save ▾', up: 'Upload to room', dl: 'Download', dlHwp: 'Download as HWP', dlHwpx: 'Download as HWPX', changed: 'Modified', confirm: 'You have unsaved changes. They will be lost if you close. Close anyway?', upping: 'Uploading…', upok: 'Uploaded to the room: ', upfail: 'Could not upload to the room.', exfail: 'Could not prepare the file to save.', saveAs: (e) => `Will be saved as ${e}`, engineDown: 'The editor stopped. Close and open it again.' },
}
const i18n = useI18n()
const s = computed(() => (String(i18n.locale?.value ?? '').startsWith('ko') ? STR.ko : STR.en))

const kind = editorKindOf(props.nameHint || props.file.name) // 'hwp' | 'office'
const ORIGINS = {
  hwp: import.meta.env.VITE_HWP_EDITOR_ORIGIN || 'https://hwp.clipboardapp.org',
  office: import.meta.env.VITE_OFFICE_EDITOR_ORIGIN || 'https://office.clipboardapp.org',
}
const origin = String(ORIGINS[kind]).replace(/\/+$/, '')
const { currentTheme } = useTheme()
const initialTheme = currentTheme.value === 'light' ? 'light' : 'dark'
const frameSrc = `${origin}/?embed=cs&theme=${initialTheme}`

const name = ref(props.nameHint || props.file.name)
const phase = ref((props.file.size || 0) > MAX_EDIT_BYTES ? 'error' : 'loading') // loading | ready | error
const errorText = ref(phase.value === 'error' ? STR.ko.tooBig : '') // 아래에서 현재 언어로 바꿔 쓴다
const tooBig = phase.value === 'error'
const stepText = ref('')
const dirty = ref(false)
const barMsg = ref('')
const menuOpen = ref(false)
const busy = ref(false)
const chrome = ref(null)
const frameEl = ref(null)

let client = null
let msgTimer = null
let pushed = false
let skipConfirm = false
let unsubs = []

const setMsg = (m) => { barMsg.value = m; clearTimeout(msgTimer); if (m && !/…$/.test(m)) msgTimer = setTimeout(() => { barMsg.value = '' }, 6000) }
const fail = (text) => { phase.value = 'error'; errorText.value = text }
const shownError = computed(() => (tooBig ? s.value.tooBig : errorText.value))

const barStyle = computed(() => {
  const c = chrome.value
  if (!c) return {}
  const st = {}
  if (c.bg) st['--bar-bg'] = c.bg
  if (c.fg) st['--bar-fg'] = c.fg
  if (c.border) st['--bar-bd'] = c.border
  return st
})

const origExt = extOf(name.value)
const downloadItems = computed(() => {
  if (kind !== 'hwp') return [{ key: 'orig', label: s.value.dl, format: null }]
  const hwp = { key: 'hwp', label: s.value.dlHwp, format: 'hwp' }
  const hwpx = { key: 'hwpx', label: s.value.dlHwpx, format: 'hwpx' }
  return origExt === 'hwpx' ? [hwpx, hwp] : [hwp, hwpx] // 원래 형식이 위
})

async function boot() {
  try {
    const f = props.hooks.getBytes(props.file)
    stepText.value = s.value.fileBusy
    const ready = client.whenReady()
    ready.catch(() => {}) // 아래 await 에서 처리한다
    f.catch(() => {})
    let got
    try { got = await f } catch { return fail(s.value.failFile) }
    if (got.bytes.byteLength > MAX_EDIT_BYTES) { return fail(s.value.tooBig) }
    name.value = got.name || name.value
    stepText.value = ''
    try { await ready } catch { return fail(s.value.fail) }
    try {
      const buf = got.bytes
      got.bytes = null // 편집기에 넘긴 뒤에는 쥐고 있지 않는다
      await client.open(name.value, buf)
    } catch { return fail(s.value.fail) }
    dirty.value = false
    phase.value = 'ready'
  } catch {
    fail(s.value.fail)
  }
}

function setup() {
  const make = props.clientFactory || ((o) => createEditorClient(o))
  client = make({ getWindow: () => frameEl.value?.contentWindow || null, origin })
  unsubs.push(
    client.on('ready', (d) => { if (d?.chrome) chrome.value = d.chrome }),
    client.on('chrome', (d) => { if (d?.chrome) chrome.value = d.chrome }),
    client.on('dirty', (d) => { dirty.value = !!d?.dirty }),
    client.on('saveRequest', () => { if (phase.value === 'ready') menuOpen.value = true }),
    client.on('error', () => { fail(s.value.engineDown) }),
  )
  boot()
}

// 앱 테마가 바뀌면 편집기에도 알린다
watch(currentTheme, (v) => {
  if (client && phase.value === 'ready') client.setTheme(v === 'light' ? 'light' : 'dark').catch(() => {})
})

function triggerDownload(buf, filename, mime) {
  const url = URL.createObjectURL(new Blob([buf], { type: mime || 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

async function exportDoc(format) {
  const r = await client.export(format)
  const ext = String(r.ext || '').replace(/^\./, '').toLowerCase()
  return { bytes: r.bytes, ext: ext || origExt, mime: r.mime }
}
const converted = (ext) => (kind === 'office' && ext && ext !== origExt ? s.value.saveAs(ext) + ' ' : '')

async function uploadToRoom() {
  if (busy.value) return
  menuOpen.value = false
  busy.value = true
  setMsg(s.value.upping)
  try {
    let out
    try { out = await exportDoc(undefined) } catch { setMsg(s.value.exfail); return }
    const note = converted(out.ext)
    if (note) setMsg(note + s.value.upping)
    const up = editedName(name.value, props.hooks.existingNames(props.file.roomId), out.ext)
    const f = new File([out.bytes], up, { type: out.mime || 'application/octet-stream' })
    if (f.size > props.hooks.maxBytes) { setMsg(s.value.upfail); return }
    const ok = await props.hooks.upload(f, props.scope)
    if (ok) {
      setMsg(note + s.value.upok + up)
      try { await client.markSaved(); dirty.value = false } catch { /* 표시만 */ }
    } else {
      setMsg(s.value.upfail)
    }
  } catch {
    setMsg(s.value.upfail)
  } finally {
    busy.value = false
  }
}

async function downloadAs(format) {
  if (busy.value) return
  menuOpen.value = false
  busy.value = true
  try {
    const out = await exportDoc(format || undefined)
    triggerDownload(out.bytes, `${baseNameOf(name.value) || 'document'}.${out.ext}`, out.mime)
    const note = converted(out.ext)
    if (note) setMsg(note.trim())
    try { await client.markSaved(); dirty.value = false } catch { /* 표시만 */ }
  } catch {
    setMsg(s.value.exfail)
  } finally {
    busy.value = false
  }
}

// 닫기/뒤로 가기: 변경이 있으면 확인
const confirmLeave = () => !dirty.value || window.confirm(s.value.confirm)
function requestClose() {
  if (!confirmLeave()) return
  skipConfirm = true
  if (pushed) history.back()
  else finish()
}
function onPop() {
  if (!skipConfirm && !confirmLeave()) {
    history.pushState({ cbEditSheet: 1 }, '', location.href) // 취소: 시트에 머문다
    return
  }
  pushed = false
  finish()
}
function finish() {
  skipConfirm = false
  emit('close')
}
function onKey(e) {
  if (e.key !== 'Escape') return
  if (menuOpen.value) menuOpen.value = false
  else requestClose()
}

onMounted(() => {
  history.pushState({ cbEditSheet: 1 }, '', location.href) // 주소는 그대로, 뒤로 가기는 시트만 닫는다
  pushed = true
  window.addEventListener('popstate', onPop)
  document.addEventListener('keydown', onKey)
  if (!tooBig) setup()
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPop)
  document.removeEventListener('keydown', onKey)
  clearTimeout(msgTimer)
  unsubs.forEach((u) => u())
  client?.destroy()
})
</script>

<template>
  <div class="fe-root" role="dialog" aria-modal="true" :aria-label="name" data-testid="edit-sheet">
    <div class="fe-bar" :style="barStyle" data-testid="edit-bar">
      <span class="fe-name" :title="name" data-testid="edit-name">{{ name }}</span>
      <span v-if="dirty" class="fe-dot" data-testid="edit-dirty">{{ s.changed }}</span>
      <span class="fe-msg" role="status" data-testid="edit-msg">{{ barMsg }}</span>
      <div class="fe-actions">
        <button v-if="phase === 'ready'" type="button" class="fe-g" aria-haspopup="menu" :aria-expanded="menuOpen" data-testid="edit-save" @click="menuOpen = !menuOpen">{{ s.save }}</button>
        <button type="button" class="fe-g fe-gi" :aria-label="s.close" :title="s.close" data-testid="edit-close" @click="requestClose">✕</button>
      </div>
      <div v-if="menuOpen" class="fe-menu" role="menu" data-testid="edit-menu">
        <button type="button" role="menuitem" class="fe-primary-item" data-testid="edit-upload" :disabled="busy" @click="uploadToRoom">{{ s.up }}</button>
        <button v-for="it in downloadItems" :key="it.key" type="button" role="menuitem" :data-testid="'edit-dl-' + it.key" :disabled="busy" @click="downloadAs(it.format)">{{ it.label }}</button>
      </div>
    </div>

    <div class="fe-body">
      <iframe
        v-if="!tooBig"
        ref="frameEl"
        class="fe-frame"
        :src="frameSrc"
        :title="name"
        allow="clipboard-read; clipboard-write; fullscreen"
        data-testid="edit-frame"
      ></iframe>
      <div v-if="phase === 'loading'" class="fe-cover" role="status" data-testid="edit-loading">
        <span class="fe-spin" aria-hidden="true"></span>
        <p class="fe-cover-t">{{ s.loading }}</p>
        <p v-if="kind === 'office'" class="fe-cover-s">{{ s.slow }}</p>
        <p v-if="stepText" class="fe-cover-s">{{ stepText }}</p>
      </div>
      <div v-else-if="phase === 'error'" class="fe-cover" role="alert" data-testid="edit-error">
        <p class="fe-cover-t">{{ shownError }}</p>
        <button type="button" class="fe-btn" data-testid="edit-error-close" @click="requestClose">{{ s.close }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fe-root { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: var(--color-surface); color: var(--color-text-primary); border: 0; border-radius: 0; }
/* 상단 바 32px: 편집기가 알려준 메뉴줄 색(--bar-*)으로 칠해 이음새를 없앤다. 오기 전에는 앱 테마 토큰 */
.fe-bar { --bar-bg: var(--color-surface); --bar-fg: var(--color-text-primary); --bar-bd: var(--color-border); position: relative; display: flex; align-items: center; gap: 8px; height: 32px; flex: none; padding: 0 6px 0 10px; background: var(--bar-bg); color: var(--bar-fg); border-bottom: 1px solid var(--bar-bd); font-size: 13px; white-space: nowrap; }
.fe-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.fe-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; opacity: 0.75; flex: none; }
.fe-dot::before { content: ''; width: 7px; height: 7px; background: var(--color-primary); }
.fe-msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px; opacity: 0.75; }
.fe-actions { display: flex; gap: 2px; margin-left: auto; flex: none; }
.fe-g { height: 28px; padding: 0 8px; border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.fe-gi { width: 28px; padding: 0; }
.fe-g:hover, .fe-menu button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); }
.fe-menu { position: absolute; right: 6px; top: calc(100% + 1px); z-index: 5; display: flex; flex-direction: column; min-width: 170px; background: var(--bar-bg); color: var(--bar-fg); border: 2px solid var(--color-ink); border-radius: 0; }
.fe-menu button { height: 34px; padding: 0 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.fe-menu button:disabled { opacity: 0.5; cursor: default; }
.fe-primary-item { font-weight: 700; }
.fe-body { position: relative; flex: 1; min-height: 0; }
.fe-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--color-surface); }
.fe-cover { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 16px; text-align: center; background: var(--color-surface); }
.fe-cover-t { margin: 0; font-size: 14px; font-weight: 700; }
.fe-cover-s { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.fe-spin { width: 24px; height: 24px; border: 3px solid var(--color-border); border-top-color: var(--color-ink); border-radius: 50%; animation: fe-rot 0.8s linear infinite; }
@keyframes fe-rot { to { transform: rotate(360deg); } }
.fe-btn { min-height: 44px; margin-top: 8px; padding: 0 20px; border: 2px solid var(--color-ink); border-radius: 0; background: var(--color-ink); color: var(--color-on-ink); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.fe-btn:hover { opacity: 0.9; }
</style>
