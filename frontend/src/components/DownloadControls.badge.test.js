import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ko from '../i18n/locales/ko.json'
import DownloadControls from './DownloadControls.vue'

const i18n = createI18n({ legacy: false, locale: 'ko', messages: { ko } })
const build = (props) => mount(DownloadControls, { props, global: { plugins: [i18n] } })
const badges = (w) => w.findAll('[data-testid="dc-badge"]').map((b) => b.text())

describe('DownloadControls 숫자 배지', () => {
  it('숫자는 아이콘 위 배지로, 라벨 글자에는 이름만 보인다(숫자는 스크린리더용)', () => {
    const w = build({ selectedCount: 1, totalCount: 3 })
    expect(badges(w)).toEqual(['1/3', '1', '1', '1'])
    const label = w.find('[data-testid="select-all"] .dc-label')
    expect(label.find('.sr-only').text()).toBe('(1/3)')
    expect(label.text().replace(label.find('.sr-only').text(), '').trim()).toBe('전체 선택')
    expect(w.find('[data-testid="delete-selected"] [data-testid="dc-badge"]').classes()).toContain('bg-red-600')
  })
  it('선택 0개면 전체 선택만 0/N, 나머지 배지는 숨긴다', () => {
    expect(badges(build({ selectedCount: 0, totalCount: 3 }))).toEqual(['0/3'])
  })
  it('파일이 없으면 배지가 없다', () => {
    expect(badges(build({ selectedCount: 0, totalCount: 0 }))).toEqual([])
  })
  it('100개부터 99+', () => {
    expect(badges(build({ selectedCount: 120, totalCount: 150 }))[0]).toBe('99+/99+')
  })
})
