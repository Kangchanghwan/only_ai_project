import { describe, it, expect } from 'vitest'
import { senderState } from './sender.js'

const me = { adj: 1, animal: 1 }
const other = { adj: 2, animal: 2 }
const stranger = { adj: 3, animal: 3 }

describe('senderState (보낸 사람 표시 상태)', () => {
  const ctx = { mySocketId: 'me', myIdentity: me, devices: [{ socketId: 'me', identity: me }, { socketId: 'o', identity: other }] }

  it('내 소켓 ID면 "me"', () => {
    expect(senderState({ socketId: 'me', identity: me }, ctx)).toBe('me')
  })
  it('재접속으로 소켓 ID가 바뀌어도 내 정체성이면 "me"', () => {
    expect(senderState({ socketId: 'old', identity: me }, ctx)).toBe('me')
  })
  it('지금 방에 있는 다른 기기면 "present"', () => {
    expect(senderState({ socketId: 'o', identity: other }, ctx)).toBe('present')
  })
  it('방에 없는 기기면 "left"', () => {
    expect(senderState({ socketId: 'gone', identity: stranger }, ctx)).toBe('left')
  })
  it('정보가 없거나 identity가 없으면 null(표시 생략)', () => {
    expect(senderState(undefined, ctx)).toBeNull()
    expect(senderState({ socketId: 'x' }, ctx)).toBeNull()
  })
})
