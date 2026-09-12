import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguageSelector from './LanguageSelector.vue'
import i18n, { languages, savedLocale } from '../i18n/index.js'

describe('LanguageSelector.vue', () => {
  let wrapper = null

  function mountSelector() {
    wrapper = mount(LanguageSelector, { global: { plugins: [i18n] } })
    return wrapper
  }

  /** 드롭다운 안의 언어 버튼들 (토글 버튼은 제외) */
  function langButtons() {
    return wrapper.findAll('.dropdown-item button')
  }

  beforeEach(() => {
    localStorage.clear()
    savedLocale.value = null
    i18n.global.locale.value = 'ko'
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
    wrapper = null
    localStorage.clear()
    savedLocale.value = null
    i18n.global.locale.value = 'ko'
  })

  it('드롭다운을 열면 언어마다 type="button" 버튼이 렌더링되고 a[href="#"]는 하나도 없다', async () => {
    mountSelector()

    await wrapper.find('.dropdown-toggle').trigger('click')

    expect(wrapper.find('.langselector-dropdown-menu').isVisible()).toBe(true)

    const buttons = langButtons()
    expect(buttons).toHaveLength(languages.length)
    buttons.forEach((btn) => {
      expect(btn.attributes('type')).toBe('button')
    })
    expect(wrapper.findAll('a[href="#"]')).toHaveLength(0)
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('토글 버튼도 type="button"이라 폼 안에서 submit으로 동작하지 않는다', () => {
    mountSelector()
    expect(wrapper.find('.dropdown-toggle').attributes('type')).toBe('button')
  })

  it('English 버튼을 클릭하면 locale이 en으로 바뀌고 localStorage에 저장되며 토글 라벨도 갱신된다', async () => {
    mountSelector()

    await wrapper.find('.dropdown-toggle').trigger('click')

    const englishButton = langButtons().find((btn) => btn.text() === 'English')
    expect(englishButton).toBeTruthy()

    await englishButton.trigger('click')

    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem('user-locale')).toBe('en')
    expect(savedLocale.value).toBe('en')
    expect(wrapper.find('.dropdown-toggle').text()).toBe('English')
  })

  it('locale이 en이면 English 항목의 li에만 active 클래스가 붙는다', async () => {
    i18n.global.locale.value = 'en'
    mountSelector()

    await wrapper.find('.dropdown-toggle').trigger('click')

    const items = wrapper.findAll('.dropdown-item')
    const activeItems = items.filter((item) => item.classes().includes('active'))
    expect(activeItems).toHaveLength(1)
    expect(activeItems[0].find('button').text()).toBe('English')
  })

  it('현재 언어는 색상 말고 aria-current로도 드러난다', async () => {
    i18n.global.locale.value = 'en'
    mountSelector()

    await wrapper.find('.dropdown-toggle').trigger('click')

    const current = wrapper.findAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].text()).toContain('English')
  })
})
