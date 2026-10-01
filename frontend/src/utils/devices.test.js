import { describe, it, expect } from 'vitest'
import { countOtherDevices, sortDevices, isMeDevice } from './devices'
import { isEditableTarget } from './editable'

const fox = { adj: 1, animal: 1 }
const panda = { adj: 0, animal: 0 }
const d = (socketId, identity, joinedAt = 0) => ({ socketId, identity, joinedAt })

describe('countOtherDevices (다른 기기 N대)', () => {
  it('나는 제외하고 센다', () => {
    expect(countOtherDevices([d('me', fox), d('a', panda), d('b', { adj: 2, animal: 2 })], 'me', fox)).toBe(2)
  })
  it('나 혼자면 0', () => {
    expect(countOtherDevices([d('me', fox)], 'me', fox)).toBe(0)
    expect(countOtherDevices([], 'me', fox)).toBe(0)
  })
  it('소켓 ID를 모르면 정체성으로 나를 찾는다', () => {
    expect(countOtherDevices([d('x', fox), d('a', panda)], null, fox)).toBe(1)
  })
  it('내 기기가 맨 위로 정렬된다', () => {
    const sorted = sortDevices([d('a', panda, 1), d('me', fox, 9)], 'me', fox)
    expect(isMeDevice(sorted[0], 'me', fox)).toBe(true)
  })
})

describe('isEditableTarget', () => {
  it('textarea/text input/contenteditable은 편집 가능, 체크박스/버튼/body는 아님', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    const text = document.createElement('input')
    expect(isEditableTarget(text)).toBe(true)
    const cb = document.createElement('input'); cb.type = 'checkbox'
    expect(isEditableTarget(cb)).toBe(false)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(document.body)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
})
