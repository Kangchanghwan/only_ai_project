import { describe, it, expect } from 'vitest'
import { countOtherDevices, sortDevices, isMeDevice, mergeSameDevice } from './devices'
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
  it('나 다음은 최근 접속 순(방금 들어온 기기가 앞)', () => {
    const sorted = sortDevices([d('old', panda, 1), d('me', fox, 5), d('new', { adj: 2, animal: 2 }, 9), d('mid', { adj: 3, animal: 3 }, 4)], 'me', fox)
    expect(sorted.map((x) => x.socketId)).toEqual(['me', 'new', 'mid', 'old'])
  })
  it('1:1 요청 중인 기기는 나 바로 다음', () => {
    const sorted = sortDevices([d('old', panda, 1), d('me', fox, 5), d('new', { adj: 2, animal: 2 }, 9)], 'me', fox, new Set(['old']))
    expect(sorted.map((x) => x.socketId)).toEqual(['me', 'old', 'new'])
  })
})

describe('sortDevices 동점', () => {
  it('joinedAt이 같거나 없으면 socketId 순으로 고정한다', () => {
    const x = [d('c', { adj: 3, animal: 3 }, 5), d('a', panda, 5), d('b', { adj: 2, animal: 2 }, 5)]
    expect(sortDevices(x, 'zz', null).map((v) => v.socketId)).toEqual(['a', 'b', 'c'])
    expect(sortDevices([...x].reverse(), 'zz', null).map((v) => v.socketId)).toEqual(['a', 'b', 'c'])
    const none = [{ socketId: 'q' }, { socketId: 'p' }]
    expect(sortDevices(none, 'zz', null).map((v) => v.socketId)).toEqual(['p', 'q'])
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

describe('같은 브라우저 탭 합치기', () => {
  it('같은 이름의 탭 둘은 카드 한 장, 나 카드는 내 소켓이 대표', () => {
    const out = sortDevices([d('t1', fox, 1), d('t2', fox, 9), d('o', panda, 5)], 't1', fox)
    expect(out.map((x) => x.socketId)).toEqual(['t1', 'o'])
    expect(countOtherDevices([d('t1', fox), d('t2', fox), d('o', panda)], 't1', fox)).toBe(1)
  })
  it('하나라도 접속 중이면 온라인, 모두 자리 비움이면 자리 비움', () => {
    expect(mergeSameDevice([{ ...d('a', panda), away: true }, d('b', panda)])[0].away).toBe(false)
    expect(mergeSameDevice([{ ...d('a', panda), away: true }, { ...d('b', panda), away: true }])[0].away).toBe(true)
  })
  it('이름이 없는 항목과 다른 이름은 합치지 않는다', () => {
    expect(mergeSameDevice([d('a'), d('b'), d('c', panda), d('e', { ...panda, suffix: 2 })])).toHaveLength(4)
  })
})
