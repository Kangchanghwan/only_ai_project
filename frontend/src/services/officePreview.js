/**
 * Office(.docx/.xlsx/.pptx) 간단 미리보기 렌더러 (지연 로드). 종류별로 해당 라이브러리만 불러온다. 모두 우리 번들 안이라 외부 요청이 없다.
 * 출력 DOM은 sanitize(officeSanitize.js)를 거친다.
 */
import { watchSanitize } from './officeSanitize.js'

export const OFFICE_LIMITS = { desktop: 50 * 1024 * 1024, phone: 20 * 1024 * 1024, timeoutMs: 25000 }

export const sizeCapFor = (phone) => (phone ? OFFICE_LIMITS.phone : OFFICE_LIMITS.desktop)

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms)
  p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
})

/** 폭에 맞춰 줄이거나 조금 키운다 (transform). scroller 안에서 sizer가 줄어든 높이를 차지하고 inner를 scale한다 */
function fitWidth(scroller, sizer, inner, { maxScale = 1.25 } = {}) {
  const apply = () => {
    inner.style.transform = ''
    inner.style.transformOrigin = 'top left'
    inner.style.width = 'max-content' // 좁은 화면에서 쪽이 줄어들거나 왼쪽으로 삐져나가지 않게 원래 폭으로 둔다
    sizer.style.height = ''
    const avail = scroller.clientWidth
    const w = inner.offsetWidth
    if (!avail || !w) return
    const scale = Math.min(maxScale, avail / w)
    inner.style.transform = `scale(${scale})`
    sizer.style.height = Math.ceil(inner.offsetHeight * scale) + 'px'
  }
  apply()
  const ro = new ResizeObserver(apply)
  ro.observe(scroller)
  return () => ro.disconnect()
}

/**
 * @param {'docx'|'xlsx'|'pptx'} kind
 * @param {ArrayBuffer} buffer
 * @param {HTMLElement} host 렌더 결과가 들어갈 빈 요소
 * @returns {Promise<{destroy:()=>void}>}
 */
export async function renderOffice(kind, buffer, host, { timeoutMs = OFFICE_LIMITS.timeoutMs } = {}) {
  const cleanups = []
  const destroy = () => {
    for (const c of cleanups.splice(0).reverse()) { try { c() } catch { /* 정리 중 오류는 무시 */ } }
    host.querySelectorAll('[src^="blob:"]').forEach((el) => URL.revokeObjectURL(el.getAttribute('src')))
    host.textContent = ''
  }
  try {
    const run = (async () => {
      if (kind === 'docx') {
        const { renderAsync } = await import('docx-preview')
        const sizer = document.createElement('div')
        sizer.style.cssText = 'position:relative;overflow:hidden'
        const body = document.createElement('div')
        const styles = document.createElement('div')
        sizer.append(body)
        host.append(styles, sizer)
        await renderAsync(buffer, body, styles, { breakPages: true, inWrapper: true, ignoreLastRenderedPageBreak: true, useBase64URL: false })
        const wrapper = body.querySelector('.docx-wrapper') || body
        cleanups.push(watchSanitize(host))
        cleanups.push(fitWidth(host, sizer, wrapper))
      } else if (kind === 'pptx') {
        const { init } = await import('pptx-preview')
        const width = Math.max(240, host.clientWidth || 800)
        const box = document.createElement('div')
        host.appendChild(box)
        const previewer = init(box, { width, height: Math.round(width * 0.5625), mode: 'list' })
        cleanups.push(() => { try { previewer.destroy?.() } catch { /* */ } })
        await previewer.preview(buffer)
        cleanups.push(watchSanitize(host))
      } else if (kind === 'xlsx') {
        const [{ default: jsPreviewExcel }, cssMod] = await Promise.all([import('@js-preview/excel'), import('@js-preview/excel/lib/index.css?inline')])
        // 라이브러리 CSS는 이 시트 안(shadow root)에만 적용한다
        const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
        const style = document.createElement('style')
        style.textContent = cssMod.default
        const box = document.createElement('div')
        box.style.cssText = 'height:100%;min-height:360px'
        root.append(style, box)
        const viewer = jsPreviewExcel.init(box, { showContextmenu: false })
        cleanups.push(() => { try { viewer.destroy() } catch { /* */ } })
        await viewer.preview(buffer)
        cleanups.push(watchSanitize(root))
      } else {
        throw new Error('unsupported')
      }
    })()
    await withTimeout(run, timeoutMs)
  } catch (e) {
    destroy()
    throw e
  }
  return { destroy }
}
