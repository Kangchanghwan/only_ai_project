import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })
const entries = Object.entries(locales).map(([path, mod]) => [path.match(/([a-z]+)\.json$/)[1], mod.default || mod])
const en = Object.fromEntries(entries).en

const KEYS = ['title', 'intro', 'note', 'pageIntro', 'zipOne', 'zipMany', 'get', 'again', 'preparing', 'progress', 'done', 'started', 'failed', 'zipDone', 'zipFailed', 'fileStarted', 'close']
const placeholders = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',')

describe('i18n 여러 파일 받기(multiDownload) 블록', () => {
  it('21개 로케일 모두 키가 있고 자리표시자가 영어와 같다', () => {
    expect(entries.length).toBe(21)
    for (const [lang, json] of entries) {
      for (const key of KEYS) {
        const v = json.multiDownload?.[key]
        expect(typeof v === 'string' && v.length > 0, `${lang}.multiDownload.${key}`).toBe(true)
        expect(placeholders(v), `${lang}.multiDownload.${key}`).toBe(placeholders(en.multiDownload[key]))
        // vue-i18n이 %{x}를 옛 문법으로 해석하지 않게 한다
        expect(v.includes('%{'), `${lang}.multiDownload.${key}`).toBe(false)
      }
    }
  })

  it('다운로드 버튼 설명이 더 이상 "하나씩 순차적으로"라고 하지 않는다 (ko·en)', () => {
    const ko = Object.fromEntries(entries).ko
    expect(ko.download.downloadHint).toContain('ZIP')
    expect(en.download.downloadHint).toContain('ZIP')
  })
})
