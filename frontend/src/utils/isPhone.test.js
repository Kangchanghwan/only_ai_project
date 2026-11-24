import { describe, it, expect } from 'vitest'
import { isPhone } from './isPhone'
const w = (coarse, width, height) => ({ matchMedia: () => ({ matches: coarse }), screen: { width, height } })
describe('isPhone', () => {
  it('터치 + 짧은 변 < 600', () => expect(isPhone(w(true, 390, 844))).toBe(true))
  it('태블릿·데스크톱은 아님', () => {
    expect(isPhone(w(true, 820, 1180))).toBe(false)
    expect(isPhone(w(false, 390, 844))).toBe(false)
  })
  it('matchMedia 없으면 false', () => expect(isPhone({})).toBe(false))
})
