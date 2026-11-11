import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NextTimeHint from './NextTimeHint.vue'
import i18n from '../i18n/index.js'
import { IOS_SHORTCUT_GUIDE, IOS_SHORTCUT_FILE_LINK } from '../utils/iosShortcut'

const global = { plugins: [i18n] }
const mountHint = (props) => mount(NextTimeHint, { props: { visible: true, ...props }, global })
const sel = (id) => `[data-testid="${id}"]`

beforeEach(() => { i18n.global.locale.value = 'ko' })
afterEach(() => { vi.restoreAllMocks(); i18n.global.locale.value = 'ko' })

describe('NextTimeHint', () => {
  it('visible이 false이거나 variant가 없으면 그리지 않는다', () => {
    expect(mountHint({ visible: false, variant: 'install' }).find(sel('next-time-hint')).exists()).toBe(false)
    expect(mountHint({ variant: null }).find(sel('next-time-hint')).exists()).toBe(false)
  })

  it('ios_shortcut(ko): 문구, 단축어 추가 링크는 사용법 절', () => {
    const w = mountHint({ variant: 'ios_shortcut' })
    expect(w.find(sel('next-time-hint')).text()).toContain('다음엔 사진 앱 공유 버튼에서 바로 보낼 수 있어요')
    const a = w.find(sel('next-time-hint-action'))
    expect(a.element.tagName).toBe('A')
    expect(a.text()).toBe('단축어 추가')
    expect(a.attributes('href')).toBe(IOS_SHORTCUT_GUIDE)
    expect(a.attributes('target')).toBeUndefined()
  })

  it('ios_shortcut(en): iCloud 단축어 링크, 새 탭', () => {
    i18n.global.locale.value = 'en'
    const w = mountHint({ variant: 'ios_shortcut' })
    const a = w.find(sel('next-time-hint-action'))
    expect(a.attributes('href')).toBe(IOS_SHORTCUT_FILE_LINK)
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toContain('noopener')
    expect(a.text()).toBe('Add shortcut')
  })

  it('install: 문구와 설치 버튼, 클릭하면 action', async () => {
    const w = mountHint({ variant: 'install' })
    expect(w.find(sel('next-time-hint')).text()).toContain('앱으로 설치하면 다음엔 더 빨리 열 수 있어요')
    const b = w.find(sel('next-time-hint-action'))
    expect(b.element.tagName).toBe('BUTTON')
    expect(b.text()).toBe('설치')
    await b.trigger('click')
    expect(w.emitted('action')).toHaveLength(1)
  })

  it('bookmark: 버튼 없이 문구만, Mac은 ⌘D', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const w = mountHint({ variant: 'bookmark' })
    expect(w.find(sel('next-time-hint-action')).exists()).toBe(false)
    expect(w.find(sel('next-time-hint')).text()).toContain('⌘D로 즐겨찾기에 추가하면 다음에 바로 열 수 있어요')
  })

  it('bookmark: Mac이 아니면 Ctrl+D', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    const w = mountHint({ variant: 'bookmark' })
    expect(w.find(sel('next-time-hint')).text()).toContain('Ctrl+D로 즐겨찾기에')
  })

  it('닫기 버튼: aria-label과 dismiss 이벤트', async () => {
    const w = mountHint({ variant: 'bookmark' })
    const c = w.find(sel('next-time-hint-close'))
    expect(c.attributes('aria-label')).toBe('닫기')
    await c.trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
    expect(w.emitted('action')).toBeUndefined()
  })
})
