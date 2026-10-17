import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'

const r2 = vi.hoisted(() => ({ lockedMeta: vi.fn(), deleteLockedFile: vi.fn() }))
vi.mock('./r2Service.js', () => ({ r2Service: r2 }))

import { deleteLockedWithProof } from './lockedDownloader.js'
import { newRoomSecret, deriveRoomLock } from '../utils/pairCrypto.js'
import { useLockState } from '../composables/useLockState.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

// 1:1 방 일괄 삭제의 전제: 상대가 올린 파일(내 삭제 키 없음)도 방 키에서 나온 verifier로 지울 수 있다.
describe('1:1 방 잠긴 파일 삭제 증명', () => {
  const ROOM = 'prv-room-aaaa'
  const ID = '0123456789abcdef0123456789abcdef'

  beforeEach(() => {
    r2.lockedMeta.mockReset()
    r2.deleteLockedFile.mockReset().mockResolvedValue({ success: true })
    useLockState().resetLockState()
  })

  it('방에 들어온 기기는 상대가 올린 파일을 방 verifier로 지운다', async () => {
    const secret = newRoomSecret()
    const lock = await deriveRoomLock(secret, ROOM)
    // usePrivateRooms.hydrate/addRoom과 같은 방식으로 방 키를 기억한다
    useLockState().rememberKey(lock.salt, lock.encKey, lock.verifier)
    r2.lockedMeta.mockResolvedValue({ v: 1, salt: lock.salt, size: 10, remaining: 30 })

    await deleteLockedWithProof({ roomId: ROOM, id: ID, lockState: useLockState() })
    expect(r2.deleteLockedFile).toHaveBeenCalledWith(ROOM, ID, { verifier: lock.verifier })
  })

  it('방 키가 없는 기기는 지우지 못한다 (NEED_PASSWORD)', async () => {
    const lock = await deriveRoomLock(newRoomSecret(), ROOM)
    r2.lockedMeta.mockResolvedValue({ v: 1, salt: lock.salt, size: 10, remaining: 30 })
    await expect(deleteLockedWithProof({ roomId: ROOM, id: ID, lockState: useLockState() }))
      .rejects.toMatchObject({ code: 'NEED_PASSWORD' })
    expect(r2.deleteLockedFile).not.toHaveBeenCalled()
  })
})
