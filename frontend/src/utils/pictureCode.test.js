import { describe, it, expect, vi } from 'vitest'
import { PICTURE_IDS, PICTURE_COUNT, CODE_LENGTH, randomCode, routeOf, codeBytes, isValidCode, pictureOf, pictureKey, allPictures } from './pictureCode.js'
import manifest from '../assets/sas/manifest.json'

describe('pictureCode', () => {
  it('그림 24개, 이름 중복 없음, 모두 기존 sas 자산(manifest)에 있다', () => {
    expect(PICTURE_COUNT).toBe(24)
    expect(new Set(PICTURE_IDS).size).toBe(24)
    const ids = new Set(manifest.map((m) => m.id))
    for (const id of PICTURE_IDS) expect(ids.has(id), id).toBe(true)
  })

  it('모든 그림에 이미지 주소와 이모지가 있다', () => {
    const all = allPictures()
    expect(all).toHaveLength(24)
    for (const p of all) {
      expect(p.src, p.id).toBeTruthy()
      expect(p.emoji.length, p.id).toBeGreaterThan(0)
    }
    expect(pictureOf(24)).toBeNull()
    expect(pictureKey(0)).toBe('code.pic.banana')
  })

  it('randomCode는 0..23 정수 4개이고 중복도 나올 수 있다', () => {
    let dup = false
    const seen = new Set()
    for (let i = 0; i < 500; i++) {
      const c = randomCode()
      expect(c).toHaveLength(CODE_LENGTH)
      expect(isValidCode(c)).toBe(true)
      if (new Set(c).size < 4) dup = true
      seen.add(c[0])
    }
    expect(dup).toBe(true)
    expect(seen.size).toBe(24) // 첫 칸이 24개 그림을 고르게 쓴다
  })

  it('거절 샘플링: 편향되는 바이트(240 이상)는 버리고 다시 뽑는다', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const seq = [255, 240, 47, 5, 0, 23, 100]
    let n = 0
    spy.mockImplementation((buf) => { buf[0] = seq[n++ % seq.length]; return buf })
    const c = randomCode()
    spy.mockRestore()
    expect(c).toEqual([47 % 24, 5, 0, 23])
  })

  it('routeOf는 앞 2개, codeBytes는 4바이트, 잘못된 코드는 예외', () => {
    expect(routeOf([1, 2, 3, 4])).toEqual([1, 2])
    expect(Array.from(codeBytes([1, 2, 3, 23]))).toEqual([1, 2, 3, 23])
    expect(() => routeOf([1, 2, 3])).toThrow()
    expect(() => codeBytes([1, 2, 3, 24])).toThrow()
  })

  it('isValidCode', () => {
    expect(isValidCode([0, 0, 0, 0])).toBe(true)
    expect(isValidCode([0, 0, 0])).toBe(false)
    expect(isValidCode([0, 0, 0, -1])).toBe(false)
    expect(isValidCode([0, 0, 0, 1.5])).toBe(false)
    expect(isValidCode('1234')).toBe(false)
  })
})
