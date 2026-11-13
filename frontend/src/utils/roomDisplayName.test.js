import { describe, it, expect } from 'vitest'
import { roomDisplayName } from './roomDisplayName.js'

const g = (c) => 'prv-g-' + c.repeat(24)
describe('roomDisplayName', () => {
  const rooms = [
    { roomId: g('a'), name: '날쌘 코알라의 방' },
    { roomId: g('b'), name: '날쌘 코알라의 방' },
    { roomId: g('c'), name: '다른 방' },
    { roomId: g('d'), name: '날쌘 코알라의 방' },
    { roomId: g('e'), name: '' },
  ]
  it('같은 이름이 2개 이상이면 첫 방은 그대로, 나머지는 입장 순서대로 2, 3을 붙인다', () => {
    expect(roomDisplayName(rooms, g('a'), '이름 없는 방')).toBe('날쌘 코알라의 방')
    expect(roomDisplayName(rooms, g('b'), '이름 없는 방')).toBe('날쌘 코알라의 방 2')
    expect(roomDisplayName(rooms, g('d'), '이름 없는 방')).toBe('날쌘 코알라의 방 3')
  })
  it('이름이 하나뿐이면 번호를 붙이지 않고 저장된 이름은 바뀌지 않는다', () => {
    expect(roomDisplayName(rooms, g('c'), '이름 없는 방')).toBe('다른 방')
    expect(rooms[1].name).toBe('날쌘 코알라의 방')
  })
  it('이름이 빈 방도 기본 이름 기준으로 센다', () => {
    const r = [{ roomId: g('a'), name: '' }, { roomId: g('b') }]
    expect(roomDisplayName(r, g('b'), '이름 없는 방')).toBe('이름 없는 방 2')
  })
  it('1:1 방과 그룹 방, 예전 1:1 방을 합쳐서 같은 이름을 센다 (운영에서 본 "날쌘 코알라의 방" 두 개)', () => {
    const mixed = [
      { roomId: g('a'), name: '날쌘 코알라의 방', peer: { socketId: 'x' } }, // 1:1로 만든 방
      { roomId: g('b'), name: '날쌘 코알라의 방', peer: null }, // 그룹 방
      { roomId: 'prv-' + 'c'.repeat(24), peer: { socketId: 'y' } } // 예전 1:1 방
    ]
    const legacy = () => '날쌘 코알라의 방'
    expect(roomDisplayName(mixed, g('a'), '이름 없는 방', legacy)).toBe('날쌘 코알라의 방')
    expect(roomDisplayName(mixed, g('b'), '이름 없는 방', legacy)).toBe('날쌘 코알라의 방 2')
    expect(roomDisplayName(mixed, 'prv-' + 'c'.repeat(24), '이름 없는 방', legacy)).toBe('날쌘 코알라의 방 3')
  })
})
