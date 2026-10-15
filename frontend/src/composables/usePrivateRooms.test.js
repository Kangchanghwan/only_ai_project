// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { usePrivateRooms } from './usePrivateRooms.js'
import { useLockState } from './useLockState.js'
import { newRoomSecret } from '../utils/pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

describe('usePrivateRooms', () => {
  const pr = usePrivateRooms()
  beforeEach(() => { pr.resetPrivateRooms(); useLockState().resetLockState() })

  it('addRoom은 keyring에 등록하고 lock/peer/has를 제공한다', async () => {
    const rec = await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'B' }, roomSecret: newRoomSecret() })
    expect(pr.has('prv-1')).toBe(true)
    expect(pr.peerFor('prv-1')).toEqual({ socketId: 'B' })
    expect(pr.lockFor('prv-1').salt).toBe(rec.lock.salt)
    expect(useLockState().keyFor(rec.lock.salt)?.encKey).toBe(rec.lock.encKey)
    expect(pr.rooms[0].status).toBe('online')
    pr.setStatus('prv-1', 'left')
    expect(pr.rooms[0].status).toBe('left')
  })

  it('텍스트 암·복호화와 removeRoom', async () => {
    await pr.addRoom({ roomId: 'prv-1', peer: {}, roomSecret: newRoomSecret() })
    const e = await pr.encryptFor('prv-1', 'hello')
    expect(await pr.decryptFor('prv-1', e)).toBe('hello')
    pr.removeRoom('prv-1')
    expect(pr.has('prv-1')).toBe(false)
    expect(pr.lockFor('prv-1')).toBe(null)
    await expect(pr.encryptFor('prv-1', 'x')).rejects.toThrow()
  })
})
