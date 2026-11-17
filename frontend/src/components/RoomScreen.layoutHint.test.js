import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'
import { saveListHint, readListHint, saveDeviceHint, resetLayoutHintCache } from '../utils/layoutHint'

const stubs = {
  AppHeader: { name: 'AppHeader', template: '<div><slot /></div>' },
  ShareScopeTabs: { name: 'ShareScopeTabs', template: '<div></div>' },
  FileGallery: { name: 'FileGallery', template: '<div><slot name="composer" /></div>', props: ['files', 'texts', 'isLoading', 'loadingHint'] },
  TextShareBox: { name: 'TextShareBox', template: '<div></div>', props: ['scope', 'hasItems', 'receiverHint'] },
  AppFooter: { name: 'AppFooter', template: '<div></div>' },
  LandingContent: { name: 'LandingContent', template: '<div></div>' },
  ConnectionCard: { name: 'ConnectionCard', template: '<div></div>' }
}
const base = { roomId: 'room-shared', files: [], texts: [], isLoading: false, userCount: 1, isConnecting: false, scope: 'ip', ipRoomDevices: [], globalRoomDevices: [] }
const mk = (props = {}) => mount(RoomScreen, { props: { ...base, ...props }, global: { plugins: [i18n], stubs } })
const box = (w) => w.findComponent({ name: 'TextShareBox' })
const gallery = (w) => w.findComponent({ name: 'FileGallery' })
const file = (name) => ({ name, size: 1, created: 1 })

beforeEach(() => {
  localStorage.clear()
  resetLayoutHintCache()
})

describe('RoomScreen 로딩 중 배치: 지난번 목록 기억', () => {
  it('기억이 없으면 로딩 중 입력 칸은 큰 상태, 자리 표시는 기본', () => {
    const w = mk({ isLoading: true })
    expect(box(w).props('hasItems')).toBe(false)
    expect(gallery(w).props('loadingHint')).toBeNull()
  })
  it('지난번에 항목이 있었으면 로딩 중에도 입력 칸을 낮게 그리고 줄 수를 넘긴다', () => {
    saveListHint('ip', { files: 2, texts: 1 })
    const w = mk({ isLoading: true })
    expect(box(w).props('hasItems')).toBe(true)
    expect(gallery(w).props('loadingHint')).toEqual({ rows: 3, hasTexts: true })
  })
  it('지난번에 비어 있었으면 입력 칸은 큰 상태, 자리 표시 줄은 0', () => {
    saveListHint('ip', { files: 0, texts: 0 })
    const w = mk({ isLoading: true })
    expect(box(w).props('hasItems')).toBe(false)
    expect(gallery(w).props('loadingHint')).toEqual({ rows: 0, hasTexts: false })
  })
  it('로딩이 끝나면 기억이 아니라 실제 목록을 따른다', async () => {
    saveListHint('ip', { files: 2, texts: 0 })
    const w = mk({ isLoading: true })
    expect(box(w).props('hasItems')).toBe(true)
    await w.setProps({ isLoading: false })
    expect(box(w).props('hasItems')).toBe(false)
    expect(gallery(w).props('loadingHint')).toBeNull()
  })
  it('범위별로 따로 기억한다', () => {
    saveListHint('global', { files: 3, texts: 0 })
    expect(box(mk({ isLoading: true, scope: 'ip' })).props('hasItems')).toBe(false)
    expect(box(mk({ isLoading: true, scope: 'global' })).props('hasItems')).toBe(true)
  })
  it('처음 그릴 때(연결 전의 빈 목록)는 기억을 덮어쓰지 않는다', async () => {
    saveListHint('ip', { files: 2, texts: 0 })
    const w = mk({ isLoading: false })
    await nextTick()
    expect(readListHint('ip')).toEqual({ rows: 2, hasTexts: false })
    await w.setProps({ isLoading: true })
    expect(box(w).props('hasItems')).toBe(true)
    expect(readListHint('ip')).toEqual({ rows: 2, hasTexts: false })
  })
  it('로딩이 끝난 뒤의 목록 상태를 기억한다', async () => {
    const w = mk({ isLoading: true })
    await w.setProps({ isLoading: false, files: [file('a.txt')], texts: [{ id: 't1', content: 'x' }] })
    expect(readListHint('ip')).toEqual({ rows: 2, hasTexts: true })
    await w.setProps({ files: [], texts: [] })
    expect(readListHint('ip')).toEqual({ rows: 0, hasTexts: false })
  })
  it('로딩 중에는 저장하지 않는다 (다시 연결할 때 비워진 목록을 기억하지 않는다)', async () => {
    const w = mk({ isLoading: true })
    await w.setProps({ isLoading: false, files: [file('a.txt')] })
    await w.setProps({ isLoading: true, files: [] })
    expect(readListHint('ip')).toEqual({ rows: 1, hasTexts: false })
    expect(box(w).props('hasItems')).toBe(true)
  })
})

describe('RoomScreen 연결 전 받을 기기 글자 자리', () => {
  const me = { socketId: 'me', identity: { adj: 1, animal: 1 } }
  it('기억이 없으면 넘기지 않는다', () => {
    expect(box(mk()).props('receiverHint')).toBeNull()
  })
  it('연결 전이고 지난번에 다른 기기가 있었으면 그 수(나 제외)를 넘긴다', () => {
    saveDeviceHint('ip', { cards: 8, otherNet: false, soloHeight: 0 })
    expect(box(mk()).props('receiverHint')).toBe(7)
  })
  it('지난번에 혼자였으면 넘기지 않는다 (연결 전 글자와 같다)', () => {
    saveDeviceHint('ip', { cards: 1, otherNet: false, soloHeight: 251 })
    expect(box(mk()).props('receiverHint')).toBeNull()
  })
  it('기기 목록이 오면 넘기지 않는다', () => {
    saveDeviceHint('ip', { cards: 8, otherNet: false, soloHeight: 0 })
    expect(box(mk({ ipRoomDevices: [me], mySocketId: 'me' })).props('receiverHint')).toBeNull()
  })
})
