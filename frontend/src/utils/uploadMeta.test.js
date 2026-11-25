import { describe, it, expect, vi } from 'vitest'
import { extOf, sizeBucket, textKind, lenBucket, inappOf, trackUploadFileInfo, textMetaParams, initInappMetric } from './uploadMeta'

const store = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v } } }

describe('extOf', () => {
  it.each([['photo.HEIC', 'heic'], ['a.tar.gz', 'other'], ['.env', 'none'], ['README', 'none'], ['x.', 'none'], ['a.JPEG', 'jpeg'], ['보고서.hwpx', 'hwpx'], ['a.xyz', 'other'], ['dir/b.PDF', 'pdf'], [null, 'none']])('%s -> %s', (n, e) => expect(extOf(n)).toBe(e))
})
describe('sizeBucket', () => {
  it.each([[0, 'lt1m'], [1048575, 'lt1m'], [1048576, '1_10m'], [10 * 1048576, '10_100m'], [100 * 1048576, '100m_1g'], [1073741824, 'gte1g']])('%s -> %s', (b, r) => expect(sizeBucket(b)).toBe(r))
})
describe('textKind', () => {
  it('locked wins', () => expect(textKind('https://a.com', { locked: true })).toBe('locked'))
  it.each(['https://example.com/a?b=1', 'http://x.io', 'www.naver.com', 'example.com/path'])('link %s', (t) => expect(textKind(t)).toBe('link'))
  it.each(['123456', '010-1234-5678', '110 123 456789'])('number %s', (t) => expect(textKind(t)).toBe('number'))
  it('short digits are plain', () => expect(textKind('123')).toBe('plain'))
  it('code', () => {
    expect(textKind('function a() {\n  return 1;\n}')).toBe('code')
    expect(textKind('import os\ndef f():\n  pass')).toBe('code')
    expect(textKind('<html>\n<body></body>')).toBe('code')
    expect(textKind('SELECT * FROM t;')).toBe('code')
  })
  it('plain', () => {
    expect(textKind('안녕하세요 오늘 회의 자료입니다')).toBe('plain')
    expect(textKind('link: see https://a.com')).toBe('plain')
    expect(textKind('')).toBe('plain')
  })
  it('only first 200 chars', () => expect(textKind('a'.repeat(300) + ' https://x.com')).toBe('plain'))
})
describe('lenBucket', () => {
  it.each([[0, 'lt50'], [49, 'lt50'], [50, '50_500'], [499, '50_500'], [500, '500_5k'], [4999, '500_5k'], [5000, 'gte5k']])('%s -> %s', (n, r) => expect(lenBucket(n)).toBe(r))
})
describe('inappOf', () => {
  it.each([['Mozilla KAKAOTALK 10.0', 'kakao'], ['Instagram 300.0', 'instagram'], ['x NAVER(inapp; search)', 'naver'], ['x Line/12.0', 'line'], ['[FBAN/FBIOS;FBAV/1]', 'facebook'], ['x everytimeApp', 'everytime'], ['Chrome Safari', 'none'], ['kakaotalk', 'kakao'], ['', 'none'], [undefined, 'none']])('%s -> %s', (ua, r) => expect(inappOf(ua)).toBe(r))
})
describe('trackUploadFileInfo', () => {
  it('sends only derived values, max 20', () => {
    const track = vi.fn()
    const files = Array.from({ length: 25 }, (_, i) => ({ name: `secret${i}.PNG`, size: 5 * 1048576 }))
    trackUploadFileInfo(files, 'ip', track)
    expect(track).toHaveBeenCalledTimes(20)
    expect(track).toHaveBeenCalledWith('upload_file_info', { ext: 'png', size_bucket: '1_10m', scope: 'ip' })
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret')
  })
  it('never throws', () => {
    expect(() => trackUploadFileInfo([{ name: 'a.png' }], 'ip', () => { throw new Error('x') })).not.toThrow()
    expect(() => trackUploadFileInfo(null, 'ip', vi.fn())).not.toThrow()
  })
})
describe('textMetaParams', () => {
  it('category only', () => expect(textMetaParams('hello', false)).toEqual({ text_kind: 'plain', len_bucket: 'lt50' }))
  it('locked', () => expect(textMetaParams('x'.repeat(600), true)).toEqual({ text_kind: 'locked', len_bucket: '500_5k' }))
})
describe('initInappMetric', () => {
  it('once per session, only for in-app', () => {
    const track = vi.fn(); const storage = store()
    expect(initInappMetric({ ua: 'KAKAOTALK', storage, track })).toBe(true)
    expect(initInappMetric({ ua: 'KAKAOTALK', storage, track })).toBe(false)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('inapp_open', { app: 'kakao' })
  })
  it('skips normal browser', () => {
    const track = vi.fn()
    expect(initInappMetric({ ua: 'Chrome', storage: store(), track })).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })
  it('survives broken storage', () => {
    const track = vi.fn()
    const storage = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
    expect(() => initInappMetric({ ua: 'Instagram', storage, track })).not.toThrow()
    expect(track).toHaveBeenCalledWith('inapp_open', { app: 'instagram' })
  })
})

describe('inappOf 네이버 오탐 방지', () => {
  it('네이버 앱 UA는 naver, 다른 앱의 " app)" 문구는 none', () => {
    expect(inappOf('Mozilla/5.0 (iPhone) NAVER(inapp; search; 1000; 11.6.5)')).toBe('naver')
    expect(inappOf('Mozilla/5.0 (Linux; Android 14; SomeVendor app) Chrome/120')).toBe('none')
  })
})
