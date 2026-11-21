<script setup>
/**
 * 방에서 한글(.hwp/.hwpx)·Office(.docx/.xlsx/.pptx) 파일을 누르면 열리는 미리보기 시트. 화면 이동 없이 방 위에 뜬다.
 * Office는 간단 미리보기만 한다(렌더러는 종류별 지연 로드, 출력은 sanitize 후 표시, 수정 없음, 하단 "받기").
 *  1단계: 파일 안의 미리보기(그림·글)만 즉시 보여 준다 (엔진 없음)
 *  2단계: "모든 쪽 보기" — studio를 시트 안에서 숨겨 불러오고 쪽을 SVG 목록으로 보여 준다 (읽기 전용)
 *  3단계: "수정" (폰 제외) — 같은 studio가 화면 가득 보이고, 방에 올리기/내려받기
 * 이 컴포넌트와 엔진(SDK)은 모두 지연 로드된다. 뒤로 가기는 시트만 닫는다(주소·소켓은 그대로).
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../utils/fileUtils'
import { isPhone } from '../utils/isPhone'
import { officeKindOf } from '../utils/hwpName'
import { renderOffice, sizeCapFor } from '../services/officePreview'
import { extractPreview } from '../services/hwpPreview'
import { preloadEngine, progressText } from '../services/hwpEngine'
import { renderPages } from '../services/hwpViewer'
import { editedName, isEditedHwp, validateUpload, svgToPng, refreshHwpxPreview } from '../services/hwpFiles'

const props = defineProps({
  file: { type: Object, required: true },
  scope: { type: String, default: null },
  // { maxBytes, getBytes(file)=>{name,bytes}, existingNames(roomId)=>string[], upload(File, scope)=>Promise<boolean> }
  hooks: { type: Object, required: true },
  // 잠긴 파일은 복호화 전에는 이름을 모르므로, 방에서 알고 있는 원래 이름을 힌트로 받는다
  nameHint: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const STR = {
  ko: { recv: '받기', tooBig: '파일이 커서 미리보기를 건너뛰었어요', cantMake: '미리보기를 만들 수 없어요', all: '모든 쪽 보기', edit: '수정', loading: '불러오는 중…', fail: '파일을 불러오지 못했습니다.', none: '이 파일에는 미리보기가 들어 있지 않습니다.', stale: '수정한 파일이라 저장된 미리보기를 쓰지 않습니다.', file: '파일 받는 중…', close: '닫기', engine: '편집기를 불러오는 중…', save: '저장 ▾', up: '방에 올리기', dlx: 'HWPX로 내려받기', dl: 'HWP로 내려받기', changed: '변경됨', confirm: '저장하지 않은 변경이 있습니다. 닫으면 사라집니다. 닫을까요?', upping: '방에 올리는 중…', upok: '방에 올렸습니다: ', upfail: '방에 올리지 못했습니다.', home: '미리보기', size: '크기' },
  en: { recv: 'Download', tooBig: 'The file is large, so the preview was skipped', cantMake: 'Could not create a preview', all: 'View all pages', edit: 'Edit', loading: 'Loading…', fail: 'Could not load the file.', none: 'This file has no embedded preview.', stale: 'This file was edited, so its stored preview is not used.', file: 'Fetching the file…', close: 'Close', engine: 'Loading the editor…', save: 'Save ▾', up: 'Upload to room', dlx: 'Download as HWPX', dl: 'Download as HWP', changed: 'Modified', confirm: 'You have unsaved changes. They will be lost if you close. Close anyway?', upping: 'Uploading…', upok: 'Uploaded to the room: ', upfail: 'Could not upload to the room.', home: 'Preview', size: 'Size' },
}
const { locale } = useI18n()
const s = computed(() => (String(locale.value).startsWith('ko') ? STR.ko : STR.en))

const phone = isPhone()
const kind = officeKindOf(props.nameHint || props.file.name) // docx | xlsx | pptx | null(한글)
const stage = ref(kind ? 'office' : phone ? 'p2' : 'p1') // office | p1(데스크톱만) | p2 | edit
const officeState = ref('loading') // loading | ok | skip | fail
const officeBusy = ref(true) // 받는 중 + 그리는 중 (스피너)
const officeEl = ref(null)
let officeHandle = null
const boot = ref(null) // 엔진 받는 진행률 / 그리는 중
const name = ref(props.file.name)
const loading = ref(true)
const error = ref('')
const sizeText = ref('')
const imgUrl = ref('')
const staleSkip = ref(false)
const noPreview = computed(() => !loading.value && !error.value && !imgUrl.value)
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

async function loadBytes() {
  const r = await props.hooks.getBytes(props.file)
  name.value = r.name
  bytes = new Uint8Array(r.bytes)
  sizeText.value = formatFileSize(bytes.length)
}

/** 데스크톱 1단계: 파일 안의 미리보기 그림만 즉시 (엔진 없음). 폰은 1단계 없이 바로 모든 쪽 */
async function loadStage1() {
  try {
    await loadBytes()
    staleSkip.value = isEditedHwp(name.value)
    if (!staleSkip.value) {
      const p = await extractPreview(bytes)
      if (p.image) imgUrl.value = URL.createObjectURL(p.image)
    }
  } catch {
    error.value = s.value.fail
  } finally {
    loading.value = false
  }
}

async function startOffice() {
  const cap = sizeCapFor(phone)
  try {
    if ((props.file.size || 0) > cap) { officeState.value = 'skip'; sizeText.value = formatFileSize(props.file.size); return }
    await loadBytes()
    if (bytes.length > cap) { bytes = null; officeState.value = 'skip'; return }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    bytes = null // 렌더러에 넘긴 뒤에는 쥐고 있지 않는다
    officeState.value = 'ok' // 컨테이너가 자리를 잡은 뒤 그린다 (폭 측정이 필요). 스피너가 위에 덮여 있다
    await nextTick()
    officeHandle = await renderOffice(kind, buf, officeEl.value)
  } catch {
    officeState.value = 'fail'
  } finally {
    officeBusy.value = false
  }
}

async function startPhone() {
  boot.value = { phase: 'file' }
  try {
    await loadBytes()
  } catch {
    boot.value = null
    error.value = s.value.fail
    loading.value = false
    return
  }
  loading.value = false
  await showAll()
}

const bootText = computed(() => (boot.value?.phase === 'file' ? s.value.file : progressText(boot.value, String(locale.value).startsWith('ko') ? 'ko' : 'en')))
const bootPct = computed(() => (boot.value?.phase === 'download' ? Math.min(100, (boot.value.loaded / boot.value.total) * 100) : 100))

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
  await preloadEngine((p) => { boot.value = p }) // 받는 동안 진행률, 캐시에 있으면 건너뜀
  boot.value = { phase: 'render' }
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
  stage.value = 'p2'
  try {
    const st = await ensureStudio()
    await nextTick()
    viewer?.destroy()
    viewer = renderPages(viewerEl.value, st, pageCount)
    await viewer.ready
  } catch {
    error.value = s.value.fail
  } finally {
    boot.value = null
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
    boot.value = null
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
  if (kind) startOffice()
  else if (phone) startPhone()
  else loadStage1()
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPop)
  document.removeEventListener('keydown', onKey)
  clearTimeout(msgTimer)
  viewer?.destroy()
  officeHandle?.destroy()
  bytes = null
  try { studio?.destroy() } catch { /* 이미 정리됨 */ }
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value)
})
</script>

<template>
  <div class="hp-root" data-testid="hwp-sheet" @click.self="requestClose">
    <div class="hp-panel" :class="{ 'hp-edit': stage === 'edit', 'hp-phone': phone }" role="dialog" aria-modal="true" :aria-label="name">
      <div v-if="stage !== 'edit'" class="hp-head">
        <span class="hp-title" :title="name">{{ name }}</span>
        <span v-if="sizeText" class="hp-size">{{ sizeText }}</span>
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

      <div v-if="kind" class="hp-body hp-office" data-testid="office-body">
        <div v-if="officeState === 'skip' || officeState === 'fail'" class="hp-failbox" data-testid="office-fail">
          <svg class="hp-fileicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
          <p>{{ officeState === 'skip' ? s.tooBig : s.cantMake }}</p>
        </div>
        <div v-if="officeBusy" class="hp-spin-wrap" role="status" data-testid="office-spin"><span class="hp-spin" aria-hidden="true"></span><span>{{ s.loading }}</span></div>
        <div v-show="officeState === 'ok'" ref="officeEl" class="hp-office-host" :class="'hp-office-' + kind" data-testid="office-host"></div>
      </div>

      <div v-if="kind" class="hp-foot">
        <span class="hp-spacer"></span>
        <button type="button" class="hp-btn hp-btn-primary" data-testid="office-download" @click="props.hooks.download && props.hooks.download(props.file)">{{ s.recv }}</button>
      </div>

      <div v-show="stage === 'p1'" class="hp-body hp-p1" :class="{ 'hp-p1-img': !!imgUrl }">
        <p v-if="loading" class="hp-note">{{ s.loading }}</p>
        <p v-else-if="error" class="hp-note">{{ error }}</p>
        <template v-else>
          <img v-if="imgUrl" :src="imgUrl" :alt="name" class="hp-img" data-testid="hwp-prv-img" />
          <p v-if="staleSkip" class="hp-note">{{ s.stale }}</p>
          <p v-else-if="noPreview" class="hp-note">{{ s.none }}</p>
        </template>
      </div>

      <div v-show="stage === 'p2'" class="hp-body hp-pages">
        <p v-if="error" class="hp-note hp-pad">{{ error }}</p>
        <div ref="viewerEl" class="hp-viewer" data-testid="hwp-pages"></div>
      </div>

      <div v-if="boot" class="hp-boot" role="status" data-testid="hwp-boot">
        <p>{{ bootText }}</p>
        <div class="hp-boot-bar"><div class="hp-boot-fill" :class="{ busy: boot.phase !== 'download' }" :style="{ width: boot.phase === 'download' ? bootPct + '%' : '' }"></div></div>
      </div>

      <!-- 데스크톱 하단: 왼쪽 "모든 쪽 보기"(1단계), 오른쪽 "수정" (폰은 수정 없음) -->
      <div v-if="!kind && stage !== 'edit' && !phone" class="hp-foot">
        <button v-if="stage === 'p1'" type="button" class="hp-btn hp-btn-primary" :disabled="engineBusy || loading || !!error" data-testid="hwp-all" @click="showAll">{{ engineBusy ? s.engine : s.all }}</button>
        <span class="hp-spacer"></span>
        <button type="button" class="hp-btn" :class="{ 'hp-btn-primary': stage === 'p2' }" :disabled="engineBusy || loading" data-testid="hwp-edit" @click="startEdit">{{ s.edit }}</button>
      </div>

      <div ref="hostEl" class="hp-studio" :class="{ 'hp-studio-on': stage === 'edit' }"></div>
    </div>
  </div>
</template>

<style scoped>
.hp-root { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); }
.hp-panel { position: relative; display: flex; flex-direction: column; width: min(880px, 100%); height: min(92dvh, 100%); background: var(--color-surface); color: var(--color-text-primary); border: 2px solid var(--color-ink); border-radius: 0; overflow: hidden; }
.hp-panel.hp-phone, .hp-panel.hp-edit { width: 100%; height: 100dvh; border: 0; }
.hp-head { display: flex; align-items: center; gap: 8px; flex: none; min-height: 52px; padding: 0 4px 0 16px; border-bottom: 1px solid var(--color-border); }
.hp-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.hp-size { flex: none; color: var(--color-text-secondary); font-size: 12px; white-space: nowrap; }
.hp-head .hp-x { margin-left: auto; flex: none; }
.hp-x { width: 44px; height: 44px; border: 1px solid var(--color-border); border-radius: 0; background: transparent; color: var(--color-ink); font-size: 18px; font-weight: 700; cursor: pointer; }
.hp-x:hover { background: var(--color-tint); }
.hp-body { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px 16px; }
.hp-pages { display: flex; flex-direction: column; padding: 0; background: var(--color-tint); }
.hp-viewer { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.hp-viewer :deep(.cb-page) { max-width: 820px; margin: 0 auto 8px; background: #fff; box-shadow: 0 0 0 1px var(--color-border); }
.hp-viewer :deep(.cb-page svg) { display: block; width: 100%; height: auto; }
.hp-p1-img { display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* 1단계 그림: 본문 높이를 가득 채우고(확대 허용) 가운데, 비율 유지 */
.hp-img { display: block; height: 100%; width: auto; max-width: 100%; object-fit: contain; background: #fff; border: 1px solid var(--color-border); }
.hp-note { margin: 12px 0; color: var(--color-text-secondary); font-size: 14px; }

.hp-pad { padding: 12px 16px; }
.hp-office { position: relative; display: flex; flex-direction: column; padding: 0; background: var(--color-tint); }
.hp-office-host { flex: 1; min-height: 0; overflow: auto; position: relative; }
.hp-office-xlsx { background: #fff; }
.hp-office-docx { background: #e5e7eb; overflow-x: hidden; }
.hp-spin-wrap { position: absolute; left: 0; right: 0; top: 0; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--color-surface); font-size: 14px; color: var(--color-text-secondary); }
.hp-spin { width: 20px; height: 20px; border: 3px solid var(--color-border); border-top-color: var(--color-ink); border-radius: 50%; animation: hp-rot 0.8s linear infinite; }
@keyframes hp-rot { to { transform: rotate(360deg); } }
.hp-failbox { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 16px; color: var(--color-text-secondary); font-size: 14px; }
.hp-fileicon { width: 48px; height: 48px; }
.hp-foot { display: flex; align-items: center; gap: 8px; flex: none; padding: 8px 12px; background: var(--color-surface); border-top: 1px solid var(--color-border); }
.hp-spacer { flex: 1; }
.hp-boot { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; width: min(420px, calc(100% - 32px)); padding: 16px; background: var(--color-surface); border: 2px solid var(--color-ink); }
.hp-boot p { margin: 0 0 10px; font-size: 14px; font-weight: 700; }
.hp-boot-bar { height: 8px; background: var(--color-tint); border: 1px solid var(--color-border); }
.hp-boot-fill { height: 100%; width: 0; background: var(--color-ink); transition: width 0.15s linear; }
.hp-boot-fill.busy { width: 100%; opacity: 0.35; }
.hp-btn { min-height: 44px; padding: 0 16px; border: 2px solid var(--color-ink); border-radius: 0; background: transparent; color: var(--color-ink); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.hp-btn:hover { background: var(--color-tint); }
.hp-btn:disabled { opacity: 0.6; cursor: default; }
.hp-btn-primary { background: var(--color-ink); color: var(--color-on-ink); font-weight: 800; }
.hp-btn-primary:hover { background: var(--color-ink); opacity: 0.9; }

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
