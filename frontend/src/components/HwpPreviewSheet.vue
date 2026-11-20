<script setup>
/**
 * 방에서 한글(.hwp/.hwpx) 파일을 누르면 열리는 미리보기 시트. 화면 이동 없이 방 위에 뜬다.
 *  1단계: 파일 안의 미리보기(그림·글)만 즉시 보여 준다 (엔진 없음)
 *  2단계: "모든 쪽 보기" — studio를 시트 안에서 숨겨 불러오고 쪽을 SVG 목록으로 보여 준다 (읽기 전용)
 *  3단계: "수정" (폰 제외) — 같은 studio가 화면 가득 보이고, 방에 올리기/내려받기
 * 이 컴포넌트와 엔진(SDK)은 모두 지연 로드된다. 뒤로 가기는 시트만 닫는다(주소·소켓은 그대로).
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../utils/fileUtils'
import { isPhone } from '../utils/isPhone'
import { extractPreview } from '../services/hwpPreview'
import { renderPages } from '../services/hwpViewer'
import { editedName, isEditedHwp, validateUpload, svgToPng, refreshHwpxPreview } from '../services/hwpFiles'

const props = defineProps({
  file: { type: Object, required: true },
  scope: { type: String, default: null },
  // { maxBytes, getBytes(file)=>{name,bytes}, existingNames(roomId)=>string[], upload(File, scope)=>Promise<boolean> }
  hooks: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const STR = {
  ko: { all: '모든 쪽 보기', phoneHint: '약 13MB, 처음 한 번만', edit: '수정', loading: '불러오는 중…', fail: '파일을 불러오지 못했습니다.', none: '이 파일에는 미리보기가 들어 있지 않습니다.', stale: '수정한 파일이라 저장된 미리보기를 쓰지 않습니다.', text: '글 미리보기', close: '닫기', engine: '편집기를 불러오는 중…', save: '저장 ▾', up: '방에 올리기', dlx: 'HWPX로 내려받기', dl: 'HWP로 내려받기', changed: '변경됨', confirm: '저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?', upping: '방에 올리는 중…', upok: '방에 올렸습니다: ', upfail: '방에 올리지 못했습니다.', home: '미리보기', size: '크기' },
  en: { all: 'View all pages', phoneHint: 'about 13 MB, first time only', edit: 'Edit', loading: 'Loading…', fail: 'Could not load the file.', none: 'This file has no embedded preview.', stale: 'This file was edited, so its stored preview is not used.', text: 'Text preview', close: 'Close', engine: 'Loading the editor…', save: 'Save ▾', up: 'Upload to room', dlx: 'Download as HWPX', dl: 'Download as HWP', changed: 'Modified', confirm: 'You have unsaved changes. They will be lost if you close. Close anyway?', upping: 'Uploading…', upok: 'Uploaded to the room: ', upfail: 'Could not upload to the room.', home: 'Preview', size: 'Size' },
}
const { locale } = useI18n()
const s = computed(() => (String(locale.value).startsWith('ko') ? STR.ko : STR.en))

const phone = isPhone()
const stage = ref('p1') // p1 | p2 | edit
const name = ref(props.file.name)
const loading = ref(true)
const error = ref('')
const sizeText = ref('')
const imgUrl = ref('')
const prvText = ref('')
const staleSkip = ref(false)
const noPreview = computed(() => !loading.value && !error.value && !imgUrl.value && !prvText.value)
const engineBusy = ref(false)
const dirty = ref(false)
const barMsg = ref('')
const menuOpen = ref(false)

const hostEl = ref(null)
const viewerEl = ref(null)
const barEl = ref(null)
let bytes = null // Uint8Array (평문, 이 브라우저 안에서만)
let studio = null
let viewer = null
let pageCount = 0
let msgTimer = null
let pushed = false
let skipConfirm = false

const setMsg = (m) => { barMsg.value = m; clearTimeout(msgTimer); if (m && !/…$/.test(m)) msgTimer = setTimeout(() => { barMsg.value = '' }, 6000) }
const isHwpx = () => /\.hwpx$/i.test(name.value)

async function loadStage1() {
  try {
    const r = await props.hooks.getBytes(props.file)
    name.value = r.name
    bytes = new Uint8Array(r.bytes)
    sizeText.value = formatFileSize(bytes.length)
    staleSkip.value = isEditedHwp(r.name)
    if (!staleSkip.value) {
      const p = await extractPreview(bytes)
      if (p.image) imgUrl.value = URL.createObjectURL(p.image)
      prvText.value = (p.text || '').trim().slice(0, 1500)
    }
  } catch {
    error.value = s.value.fail
  } finally {
    loading.value = false
  }
}

/** 같은 출처의 studio는 부팅 전에 localStorage 'rhwp-settings'를 읽는다: 지금 앱 테마(라이트/다크)와 flat 스킨 */
function syncStudioTheme() {
  try {
    const eff = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    const st = JSON.parse(localStorage.getItem('rhwp-settings') || '{}') || {}
    st.theme = { ...(st.theme || {}), mode: eff, skin: 'flat' }
    localStorage.setItem('rhwp-settings', JSON.stringify(st))
  } catch { /* 기본 테마 */ }
}

function syncBarColors() {
  const el = barEl.value
  if (!el) return
  try {
    const doc = studio.element.contentDocument
    const m = doc.getElementById('menu-bar')
    if (!m) throw new Error('no menu')
    const cs = doc.defaultView.getComputedStyle(m)
    el.style.setProperty('--bar-bg', cs.backgroundColor)
    el.style.setProperty('--bar-fg', cs.color)
    const w = parseFloat(cs.borderBottomWidth) || 0
    el.style.setProperty('--bar-bd-w', w > 0 && cs.borderBottomStyle !== 'none' ? w + 'px' : '0px')
    el.style.setProperty('--bar-bd', cs.borderBottomColor)
  } catch {
    for (const k of ['--bar-bg', '--bar-fg', '--bar-bd', '--bar-bd-w']) el.style.removeProperty(k)
  }
}

async function ensureStudio() {
  if (studio) return studio
  syncStudioTheme()
  const { createStudio } = await import('@rhwp/editor')
  const st = await createStudio(hostEl.value, {
    studioUrl: '/tools/hwp/studio/',
    plugins: ['hwpctrl'],
    chrome: { menu: false, toolbar: false, statusbar: false },
  })
  studio = st
  const res = await st.loadFile(bytes.slice(0), name.value)
  pageCount = res.pageCount
  dirty.value = false
  if (typeof st.onDocumentChanged === 'function') st.onDocumentChanged(() => { dirty.value = true })
  return st
}

async function showAll() {
  if (engineBusy.value) return
  engineBusy.value = true
  error.value = ''
  try {
    const st = await ensureStudio()
    stage.value = 'p2'
    await nextTick()
    viewer?.destroy()
    viewer = renderPages(viewerEl.value, st, pageCount)
  } catch {
    error.value = s.value.fail
  } finally {
    engineBusy.value = false
  }
}

async function startEdit() {
  if (phone || engineBusy.value) return
  engineBusy.value = true
  try {
    const st = await ensureStudio() // 이미 있으면 새로 만들지 않는다
    await st.chrome.set({ menu: true, toolbar: true, statusbar: true })
    stage.value = 'edit'
    await nextTick()
    requestAnimationFrame(syncBarColors)
    try {
      new MutationObserver(() => requestAnimationFrame(syncBarColors)).observe(st.element.contentDocument.documentElement, { attributes: true })
    } catch { /* 토큰 색 */ }
  } catch {
    error.value = s.value.fail
  } finally {
    engineBusy.value = false
  }
}

function download(u8, filename) {
  const url = URL.createObjectURL(new Blob([u8], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
const baseName = () => name.value.replace(/\.(hwpx?|HWPX?)$/, '') || '문서'

async function downloadAs(kind) {
  menuOpen.value = false
  try {
    const u8 = kind === 'hwpx' ? await studio.exportHwpx() : await studio.exportHwp()
    download(u8, `${baseName()}.${kind}`)
    try { await studio.notifySaved(`${baseName()}.${kind}`); dirty.value = false } catch { /* 표시만 */ }
  } catch { setMsg(s.value.upfail) }
}

async function uploadToRoom() {
  menuOpen.value = false
  setMsg(s.value.upping)
  try {
    const kind = isHwpx() ? 'hwpx' : 'hwp'
    let u8 = kind === 'hwp' ? await studio.exportHwp() : await studio.exportHwpx()
    if (kind === 'hwpx') {
      // 안에 든 미리보기 그림·글이 옛것이 되지 않게 첫 쪽과 앞 1000자로 바꿔 넣는다 (나머지는 원본 바이트 그대로)
      try {
        const png = await svgToPng(await studio.getPageSvg(0))
        const txt = String(await studio.hwpctrl.call('GetTextFile', ['UNICODE', '']))
        u8 = refreshHwpxPreview(u8, png, txt)
      } catch { /* 갱신 실패 시 그대로 올린다 */ }
    }
    const up = editedName(name.value, props.hooks.existingNames(props.file.roomId))
    const file = new File([u8], up, { type: 'application/octet-stream' })
    const v = validateUpload(file, { maxBytes: props.hooks.maxBytes })
    if (!v.ok) { setMsg(s.value.upfail); return }
    const ok = await props.hooks.upload(file, props.scope)
    if (ok) {
      setMsg(s.value.upok + up)
      try { await studio.notifySaved(up); dirty.value = false } catch { /* 표시만 */ }
    } else {
      setMsg(s.value.upfail)
    }
  } catch {
    setMsg(s.value.upfail)
  }
}

// 닫기/뒤로 가기: 수정 중 변경이 있으면 확인
function confirmLeave() {
  return stage.value !== 'edit' || !dirty.value || window.confirm(s.value.confirm)
}
function requestClose() {
  if (!confirmLeave()) return
  skipConfirm = true
  if (pushed) history.back()
  else finish()
}
function onPop() {
  if (!skipConfirm && !confirmLeave()) {
    history.pushState({ cbHwpPreview: 1 }, '', location.href) // 취소: 시트에 머문다
    return
  }
  pushed = false
  finish()
}
function finish() {
  skipConfirm = false
  emit('close')
}
function onKey(e) { if (e.key === 'Escape') { if (menuOpen.value) menuOpen.value = false; else requestClose() } }

onMounted(() => {
  history.pushState({ cbHwpPreview: 1 }, '', location.href) // 주소는 그대로, 뒤로 가기는 시트만 닫는다
  pushed = true
  window.addEventListener('popstate', onPop)
  document.addEventListener('keydown', onKey)
  loadStage1()
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPop)
  document.removeEventListener('keydown', onKey)
  clearTimeout(msgTimer)
  viewer?.destroy()
  try { studio?.destroy() } catch { /* 이미 정리됨 */ }
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value)
})
</script>

<template>
  <div class="hp-root" data-testid="hwp-sheet" @click.self="requestClose">
    <div class="hp-panel" :class="{ 'hp-edit': stage === 'edit', 'hp-phone': phone }" role="dialog" aria-modal="true" :aria-label="name">
      <div v-if="stage !== 'edit'" class="hp-head">
        <span class="hp-title" :title="name">{{ name }}</span>
        <button type="button" class="hp-x" :aria-label="s.close" :title="s.close" data-testid="hwp-close" @click="requestClose">✕</button>
      </div>
      <div v-else ref="barEl" class="hp-bar">
        <span class="hp-bar-name" :title="name">{{ name }}</span>
        <span v-if="dirty" class="hp-dot">{{ s.changed }}</span>
        <span class="hp-msg" role="status">{{ barMsg }}</span>
        <div class="hp-bar-actions">
          <button type="button" class="hp-g" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">{{ s.save }}</button>
          <button type="button" class="hp-g hp-gi" :aria-label="s.close" :title="s.close" @click="requestClose">✕</button>
        </div>
        <div v-if="menuOpen" class="hp-menu" role="menu">
          <button type="button" role="menuitem" class="hp-primary-item" @click="uploadToRoom">{{ s.up }}</button>
          <button type="button" role="menuitem" @click="downloadAs('hwpx')">{{ s.dlx }}</button>
          <button type="button" role="menuitem" @click="downloadAs('hwp')">{{ s.dl }}</button>
        </div>
      </div>

      <div v-show="stage === 'p1'" class="hp-body">
        <p v-if="loading" class="hp-note">{{ s.loading }}</p>
        <p v-else-if="error" class="hp-note">{{ error }}</p>
        <template v-else>
          <img v-if="imgUrl" :src="imgUrl" :alt="name" class="hp-img" data-testid="hwp-prv-img" />
          <p v-if="staleSkip" class="hp-note">{{ s.stale }}</p>
          <p v-else-if="noPreview" class="hp-note">{{ s.none }}</p>
          <details v-if="prvText" class="hp-text">
            <summary>{{ s.text }}</summary>
            <pre>{{ prvText }}</pre>
          </details>
          <p class="hp-meta">{{ s.size }}: {{ sizeText }}</p>
          <div class="hp-actions">
            <button type="button" class="hp-btn hp-btn-primary" :disabled="engineBusy" data-testid="hwp-all" @click="showAll">
              {{ engineBusy ? s.engine : s.all }}<span v-if="phone && !engineBusy" class="hp-hint"> ({{ s.phoneHint }})</span>
            </button>
            <button v-if="!phone" type="button" class="hp-btn" :disabled="engineBusy" data-testid="hwp-edit" @click="startEdit">{{ s.edit }}</button>
          </div>
        </template>
      </div>

      <div v-show="stage === 'p2'" class="hp-body hp-pages">
        <div ref="viewerEl" class="hp-viewer" data-testid="hwp-pages"></div>
        <div v-if="!phone" class="hp-actions hp-sticky">
          <button type="button" class="hp-btn hp-btn-primary" :disabled="engineBusy" data-testid="hwp-edit2" @click="startEdit">{{ engineBusy ? s.engine : s.edit }}</button>
        </div>
      </div>

      <div ref="hostEl" class="hp-studio" :class="{ 'hp-studio-on': stage === 'edit' }"></div>
    </div>
  </div>
</template>

<style scoped>
.hp-root { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); }
.hp-panel { display: flex; flex-direction: column; width: min(880px, 100%); height: min(92dvh, 100%); background: var(--color-surface); color: var(--color-text-primary); border: 2px solid var(--color-ink); border-radius: 0; overflow: hidden; }
.hp-panel.hp-phone, .hp-panel.hp-edit { width: 100%; height: 100dvh; border: 0; }
.hp-head { display: flex; align-items: center; gap: 8px; flex: none; min-height: 52px; padding: 0 4px 0 16px; border-bottom: 1px solid var(--color-border); }
.hp-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.hp-x { width: 44px; height: 44px; border: 1px solid var(--color-border); border-radius: 0; background: transparent; color: var(--color-ink); font-size: 18px; font-weight: 700; cursor: pointer; }
.hp-x:hover { background: var(--color-tint); }
.hp-body { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px 16px; }
.hp-pages { display: flex; flex-direction: column; padding: 0; background: var(--color-tint); }
.hp-viewer { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.hp-viewer :deep(.cb-page) { max-width: 820px; margin: 0 auto 8px; background: #fff; box-shadow: 0 0 0 1px var(--color-border); }
.hp-viewer :deep(.cb-page svg) { display: block; width: 100%; height: auto; }
.hp-img { display: block; width: auto; max-width: 100%; max-height: 56dvh; height: auto; margin: 0 auto; background: #fff; border: 1px solid var(--color-border); }
.hp-note { margin: 12px 0; color: var(--color-text-secondary); font-size: 14px; }
.hp-meta { margin: 8px 0; color: var(--color-text-secondary); font-size: 13px; }
.hp-text { margin: 12px 0; border: 1px solid var(--color-border); padding: 8px 12px; }
.hp-text summary { cursor: pointer; font-weight: 700; font-size: 14px; }
.hp-text pre { margin-top: 8px; white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 13px; color: var(--color-text-secondary); max-height: 240px; overflow: auto; }
.hp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.hp-body > .hp-actions { position: sticky; bottom: -16px; margin: 12px -16px -16px; padding: 10px 16px; background: var(--color-surface); border-top: 1px solid var(--color-border); }
.hp-sticky { flex: none; margin: 0; padding: 8px; background: var(--color-surface); border-top: 1px solid var(--color-border); }
.hp-btn { min-height: 44px; padding: 0 16px; border: 2px solid var(--color-ink); border-radius: 0; background: transparent; color: var(--color-ink); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.hp-btn:hover { background: var(--color-tint); }
.hp-btn:disabled { opacity: 0.6; cursor: default; }
.hp-btn-primary { background: var(--color-ink); color: var(--color-on-ink); font-weight: 800; }
.hp-btn-primary:hover { background: var(--color-ink); opacity: 0.9; }
.hp-hint { font-weight: 400; font-size: 12px; }

/* studio: 1·2단계에서는 화면 밖(다시 만들지 않으려고 같은 요소를 그대로 둔다), 3단계에서 화면 가득 */
.hp-studio { position: fixed; left: -10000px; top: 0; width: 1024px; height: 768px; }
.hp-studio.hp-studio-on { position: static; flex: 1; min-height: 0; width: auto; height: auto; }

/* 3단계 상단 바: 32px, studio 메뉴 줄 색을 읽어 같은 색으로 (--bar-*) */
.hp-bar { --bar-bg: var(--color-surface); --bar-fg: var(--color-text-primary); --bar-bd: var(--color-border); --bar-bd-w: 1px; position: relative; display: flex; align-items: center; gap: 8px; height: 32px; flex: none; padding: 0 6px 0 10px; background: var(--bar-bg); color: var(--bar-fg); border-bottom: var(--bar-bd-w) solid var(--bar-bd); font-size: 13px; white-space: nowrap; }
.hp-bar-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.hp-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; opacity: 0.75; }
.hp-dot::before { content: ''; width: 7px; height: 7px; background: var(--color-primary); }
.hp-msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px; opacity: 0.75; }
.hp-bar-actions { display: flex; gap: 2px; margin-left: auto; flex: none; }
.hp-g { height: 28px; padding: 0 8px; border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.hp-gi { width: 28px; padding: 0; }
.hp-g:hover, .hp-menu button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.hp-menu { position: absolute; right: 6px; top: calc(100% + 1px); z-index: 5; display: flex; flex-direction: column; min-width: 170px; background: var(--bar-bg); color: var(--bar-fg); border: 1px solid color-mix(in srgb, currentColor 35%, transparent); }
.hp-menu button { height: 34px; padding: 0 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.hp-primary-item { font-weight: 700; }
</style>
