import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { renderToString } from 'vue/server-renderer'
import { createSSRApp } from 'vue'
import LocaleNotice from './LocaleNotice.vue'
import i18n from '../i18n/index.js'

const global = { plugins: [i18n] }
const mnt = async () => { const w = mount(LocaleNotice, { global }); await flushPromises(); return w }
const sel = (id) => `[data-testid="${id}"]`
function setup({ lang = 'ja-JP', path = '/', search = '', hash = '' } = {}) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(lang)
  window.history.replaceState({}, '', `${path}${search}${hash}`)
  window.gtag = vi.fn()
}
beforeEach(() => { localStorage.clear(); i18n.global.locale.value = 'ja' })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); delete window.gtag; window.history.replaceState({}, '', '/') })

describe('LocaleNotice', () => {
  it('비한국어 브라우저의 /에서 보이고 링크는 query/hash를 유지한다', async () => {
    setup({ search: '?a=1', hash: '#faq' })
    const w = await mnt()
    expect(w.find(sel('locale-notice-link')).attributes('href')).toBe('/ja/?a=1#faq')
    expect(window.gtag).toHaveBeenCalledWith('event', 'locale_notice_shown', { target_locale: 'ja' })
  })
  it('미지원 언어는 /en/ 로 안내한다', async () => {
    setup({ lang: 'de-DE' })
    i18n.global.locale.value = 'en'
    const w = await mnt()
    expect(w.find(sel('locale-notice-link')).attributes('href')).toBe('/en/')
  })
  it('클릭 시 locale_notice_click 전송', async () => {
    setup()
    const w = await mnt()
    await w.find(sel('locale-notice-link')).trigger('click')
    expect(window.gtag).toHaveBeenCalledWith('event', 'locale_notice_click', { target_locale: 'ja' })
  })
  it('닫으면 사라지고 localStorage에 저장되어 다시 안 뜬다', async () => {
    setup()
    const w = await mnt()
    await w.find(sel('locale-notice-dismiss')).trigger('click')
    expect(w.find(sel('locale-notice')).exists()).toBe(false)
    expect((await mnt()).find(sel('locale-notice')).exists()).toBe(false)
  })
  it('한국어 브라우저, 저장된 언어, /en/ 경로에서는 안 보인다', async () => {
    setup({ lang: 'ko-KR' })
    expect((await mnt()).find(sel('locale-notice')).exists()).toBe(false)
    setup({ lang: 'en-US', path: '/en/' })
    expect((await mnt()).find(sel('locale-notice')).exists()).toBe(false)
    setup({ lang: 'en-US' })
    localStorage.setItem('user-locale', 'en')
    expect((await mnt()).find(sel('locale-notice')).exists()).toBe(false)
  })
  it('서버 렌더(프리렌더) HTML에는 들어가지 않는다', async () => {
    setup()
    const app = createSSRApp(LocaleNotice)
    app.use(i18n)
    expect(await renderToString(app)).not.toContain('locale-notice')
  })
})
