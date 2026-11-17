import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDeviceHint, readDeviceHint, saveListHint, readListHint, resetLayoutHintCache,
  DEVICE_HINT_TTL, FILE_HINT_TTL, TEXT_HINT_TTL
} from './layoutHint'

const T0 = 1_800_000_000_000

beforeEach(() => {
  localStorage.clear()
  resetLayoutHintCache()
})

describe('layoutHint 기기 영역', () => {
  it('저장한 적이 없으면 null', () => {
    expect(readDeviceHint('ip', T0)).toBeNull()
  })
  it('카드 수·다른 네트워크 묶음·혼자일 때 높이를 범위별로 기억한다', () => {
    saveDeviceHint('ip', { cards: 7, otherNet: true, soloHeight: 0 }, T0)
    saveDeviceHint('global', { cards: 1, otherNet: false, soloHeight: 251.4 }, T0)
    expect(readDeviceHint('ip', T0 + 1000)).toEqual({ cards: 7, otherNet: true, soloHeight: 0 })
    expect(readDeviceHint('global', T0 + 1000)).toEqual({ cards: 1, otherNet: false, soloHeight: 251 })
  })
  it('새로 고침 뒤(메모리 캐시가 비어도) 저장소에서 다시 읽는다', () => {
    saveDeviceHint('ip', { cards: 4, otherNet: false, soloHeight: 0 }, T0)
    resetLayoutHintCache()
    expect(readDeviceHint('ip', T0 + 5000)?.cards).toBe(4)
  })
  it('하루가 지나면 믿지 않는다', () => {
    saveDeviceHint('ip', { cards: 4, otherNet: false, soloHeight: 0 }, T0)
    expect(readDeviceHint('ip', T0 + DEVICE_HINT_TTL - 1)).not.toBeNull()
    expect(readDeviceHint('ip', T0 + DEVICE_HINT_TTL)).toBeNull()
  })
  it('이상한 값은 안전한 범위로 자른다', () => {
    saveDeviceHint('ip', { cards: 9999, otherNet: 1, soloHeight: -50 }, T0)
    expect(readDeviceHint('ip', T0)).toEqual({ cards: 60, otherNet: true, soloHeight: 0 })
    saveDeviceHint('ip', { cards: 'x', soloHeight: 99999 }, T0)
    expect(readDeviceHint('ip', T0)).toEqual({ cards: 1, otherNet: false, soloHeight: 600 })
  })
  it('1:1·그룹 방 범위는 저장하지 않는다 (방 ID를 남기지 않는다)', () => {
    saveDeviceHint('prv:room-secret', { cards: 2, otherNet: false, soloHeight: 0 }, T0)
    saveListHint('prv:room-secret', { files: 1, texts: 1 }, T0)
    expect(readDeviceHint('prv:room-secret', T0)).toBeNull()
    expect(readListHint('prv:room-secret', T0)).toBeNull()
    expect(localStorage.getItem('layout-hint:v1')).toBeNull()
  })
  it('저장소가 깨져 있어도 던지지 않고 null', () => {
    localStorage.setItem('layout-hint:v1', '{not json')
    expect(readDeviceHint('ip', T0)).toBeNull()
    resetLayoutHintCache()
    localStorage.setItem('layout-hint:v1', '[1,2]')
    expect(readListHint('ip', T0)).toBeNull()
    resetLayoutHintCache()
    localStorage.setItem('layout-hint:v1', JSON.stringify({ ip: { devices: 'x', list: 3 } }))
    expect(readDeviceHint('ip', T0)).toBeNull()
    expect(readListHint('ip', T0)).toBeNull()
  })
  it('숫자만 저장한다 (이름·내용 없음)', () => {
    saveDeviceHint('ip', { cards: 3, otherNet: true, soloHeight: 0, name: '몰래', devices: [{ id: 'a' }] }, T0)
    saveListHint('ip', { files: 2, texts: 1, content: '비밀' }, T0)
    const raw = localStorage.getItem('layout-hint:v1')
    expect(raw).not.toContain('몰래')
    expect(raw).not.toContain('비밀')
    expect(JSON.parse(raw)).toEqual({ ip: { devices: { c: 3, o: 1, s: 0, t: T0 }, list: { f: 2, x: 1, t: T0 } } })
  })
})

describe('layoutHint 목록', () => {
  it('저장한 적이 없으면 null (모름)', () => {
    expect(readListHint('ip', T0)).toBeNull()
  })
  it('비어 있었으면 rows 0', () => {
    saveListHint('ip', { files: 0, texts: 0 }, T0)
    expect(readListHint('ip', T0 + 1000)).toEqual({ rows: 0, hasTexts: false })
  })
  it('파일과 텍스트 수를 더해 최대 3줄', () => {
    saveListHint('ip', { files: 1, texts: 1 }, T0)
    expect(readListHint('ip', T0 + 1000)).toEqual({ rows: 2, hasTexts: true })
    saveListHint('ip', { files: 12, texts: 5 }, T0)
    expect(readListHint('ip', T0 + 1000)).toEqual({ rows: 3, hasTexts: true })
  })
  it('텍스트는 10분이 지나면 지워졌다고 본다, 파일은 남는다', () => {
    saveListHint('ip', { files: 1, texts: 2 }, T0)
    expect(readListHint('ip', T0 + TEXT_HINT_TTL - 1)).toEqual({ rows: 3, hasTexts: true })
    expect(readListHint('ip', T0 + TEXT_HINT_TTL)).toEqual({ rows: 1, hasTexts: false })
  })
  it('텍스트만 있었고 10분이 지났으면 빈 목록', () => {
    saveListHint('global', { files: 0, texts: 2 }, T0)
    expect(readListHint('global', T0 + TEXT_HINT_TTL + 1)).toEqual({ rows: 0, hasTexts: false })
  })
  it('하루가 지나면 모름(null)', () => {
    saveListHint('ip', { files: 2, texts: 0 }, T0)
    expect(readListHint('ip', T0 + FILE_HINT_TTL)).toBeNull()
  })
  it('시계가 뒤로 간 경우(미래에 저장된 값)는 믿지 않는다', () => {
    saveListHint('ip', { files: 2, texts: 0 }, T0)
    saveDeviceHint('ip', { cards: 3 }, T0)
    expect(readListHint('ip', T0 - 1000)).toBeNull()
    expect(readDeviceHint('ip', T0 - 1000)).toBeNull()
  })
  it('기기와 목록은 서로 덮어쓰지 않는다', () => {
    saveDeviceHint('ip', { cards: 5, otherNet: true, soloHeight: 0 }, T0)
    saveListHint('ip', { files: 1, texts: 0 }, T0)
    saveDeviceHint('ip', { cards: 6, otherNet: false, soloHeight: 0 }, T0)
    expect(readListHint('ip', T0)).toEqual({ rows: 1, hasTexts: false })
    expect(readDeviceHint('ip', T0)?.cards).toBe(6)
  })
})
