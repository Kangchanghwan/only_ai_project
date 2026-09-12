import { describe, it, expect, vi, afterEach } from 'vitest'
import { trackEvent } from './analytics'

describe('trackEvent', () => {
  afterEach(() => { delete window.gtag })

  it('gtag가 없으면 false를 돌려주고 아무 일도 하지 않는다', () => {
    expect(trackEvent('file_upload', { file_count: 1 })).toBe(false)
  })

  it('gtag가 있으면 event 호출로 이름과 파라미터를 전달한다', () => {
    window.gtag = vi.fn()
    expect(trackEvent('text_share', { scope: 'ip' })).toBe(true)
    expect(window.gtag).toHaveBeenCalledWith('event', 'text_share', { scope: 'ip' })
  })

  it('gtag가 예외를 던져도 삼키고 false를 돌려준다', () => {
    window.gtag = vi.fn(() => { throw new Error('boom') })
    expect(trackEvent('file_download')).toBe(false)
  })
})
