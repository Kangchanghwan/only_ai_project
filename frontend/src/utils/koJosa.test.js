import { describe, it, expect } from 'vitest'
import { fixKoJosa } from './koJosa.js'
import i18n from '../i18n/index.js'

describe('fixKoJosa', () => {
  it('받침에 따라 와/과, 이/가, 을/를, 은/는, (으)로를 고른다', () => {
    expect(fixKoJosa('반짝이는 유니콘와(과) 연결됐어요')).toBe('반짝이는 유니콘과 연결됐어요')
    expect(fixKoJosa('졸린 판다와(과) 연결됐어요')).toBe('졸린 판다와 연결됐어요')
    expect(fixKoJosa('용감한 곰이(가) 들어왔어요')).toBe('용감한 곰이 들어왔어요')
    expect(fixKoJosa('느긋한 토끼이(가) 들어왔어요')).toBe('느긋한 토끼가 들어왔어요')
    expect(fixKoJosa('펭귄을(를) 골라요')).toBe('펭귄을 골라요')
    expect(fixKoJosa('수달은(는) 귀여워요')).toBe('수달은 귀여워요')
    expect(fixKoJosa('수달(으)로 이동')).toBe('수달로 이동')
    expect(fixKoJosa('유니콘(으)로 이동')).toBe('유니콘으로 이동')
  })
  it('앞 글자가 한글이 아니면 그대로 둔다', () => {
    expect(fixKoJosa('photo.png이(가) 복사됨')).toBe('photo.png이(가) 복사됨')
    expect(fixKoJosa('판다 2와(과) 연결')).toBe('판다 2와(과) 연결')
  })
  it('i18n 결과에 적용된다', () => {
    const { t, locale } = i18n.global
    const prev = locale.value
    locale.value = 'ko'
    expect(t('pair.connected', { name: '반짝이는 유니콘' })).toBe('반짝이는 유니콘과 연결됐어요')
    expect(t('pair.connected', { name: '졸린 판다' })).toBe('졸린 판다와 연결됐어요')
    locale.value = prev
  })
})
