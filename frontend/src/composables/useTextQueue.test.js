import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTextShare } from './useTextShare'
import { useTextQueue } from './useTextQueue'
import { useLockState } from './useLockState'
import { encryptText, decryptText } from '../utils/privateText.js'
import { deriveLock } from '../utils/lockCrypto.js'

// 테스트에서는 PBKDF2 반복을 줄인다 (규격 값 600,000회는 느리다)
vi.mock('../utils/lockCrypto.js', async (orig) => {
  const mod = await orig()
  return { ...mod, deriveLock: (pw, salt) => mod.deriveLock(pw, salt, { iterations: 1000 }) }
})

const lockState = useLockState()
const ROOM = 'room-ip-abc'
const PRV = 'prv-0123456789abcdef01234567'

function setup({ service = {}, privateKey = null } = {}) {
  const textShare = useTextShare()
  const svc = {
    list: vi.fn(async () => []),
    unlock: vi.fn(async () => []),
    remove: vi.fn(async (_r, o) => ({ deleted: o.textIds || [], forbidden: [] })),
    ...service
  }
  const privateRooms = {
    has: (id) => id === PRV,
    decryptFor: async (roomId, enc) => decryptText(privateKey, roomId, enc)
  }
  const q = useTextQueue({ textShare, privateRooms, lockState, t: (k) => k, service: svc })
  return { textShare, q, svc }
}

const lockedMessage = (lock, enc, extra = {}) => ({
  type: 'text-shared', textId: `t-${Math.random().toString(36).slice(2)}`, roomId: ROOM, timestamp: 1,
  locked: true, lock: { salt: lock.salt }, ...(enc ? { enc } : {}), ...extra
})

describe('useTextQueue', () => {
  let lock
  beforeEach(async () => {
    lockState.resetLockState()
    lock = await deriveLock('pass1234')
  })

  it('sealForScope: 평문 없이 잠금 키 암호문 + salt/vh/dh, 삭제 키는 dh의 원본', async () => {
    const { q } = setup()
    const sealed = await q.sealForScope(lock, ROOM, '비밀 메모')
    expect(JSON.stringify(sealed.enc)).not.toContain('비밀')
    expect(await decryptText(lock.encKey, ROOM, sealed.enc)).toBe('비밀 메모')
    expect(sealed.lock).toMatchObject({ v: 1, salt: lock.salt, vh: lock.vh })
    expect(sealed.lock.dh).toMatch(/^[0-9a-f]{64}$/)
    expect(sealed.deleteKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // 다른 방 roomId로는 풀리지 않는다 (AAD에 roomId)
    await expect(decryptText(lock.encKey, 'room-other', sealed.enc)).rejects.toBeTruthy()
  })

  it('같은 textId는 한 번만 넣고, 되돌아온 메시지의 만료 시각만 반영한다', async () => {
    const { q, textShare } = setup()
    const msg = { type: 'text-shared', textId: 'x1', roomId: ROOM, content: 'hi', timestamp: 1 }
    expect(await q.ingest(msg)).toBeTruthy()
    expect(await q.ingest({ ...msg, expiresAt: 9999 })).toBeNull()
    expect(textShare.sharedTexts.value).toHaveLength(1)
    expect(textShare.sharedTexts.value[0].expiresAt).toBe(9999)
  })

  it('잠긴 텍스트: keyring에 없으면 잠긴 채로, 비밀번호를 알면 서버 확인값으로 받아 푼다', async () => {
    const { q, svc, textShare } = setup()
    const enc = await encryptText(lock.encKey, ROOM, '잠긴 내용')
    const msg = lockedMessage(lock)
    svc.unlock.mockImplementation(async (_room, ids, verifier) => {
      if (verifier !== lock.verifier) throw Object.assign(new Error('x'), { code: 'WRONG_PASSWORD', remaining: 4 })
      return ids.map((textId) => ({ textId, enc }))
    })
    await q.ingest(msg)
    const entry = textShare.sharedTexts.value[0]
    expect(entry).toMatchObject({ locked: true, salt: lock.salt, content: null })
    expect(svc.unlock).not.toHaveBeenCalled()

    await expect(q.unlockWithPassword(msg.textId, 'wrong-pass')).rejects.toMatchObject({ code: 'WRONG_PASSWORD', remaining: 4 })
    expect(textShare.sharedTexts.value[0].content).toBeNull()

    await q.unlockWithPassword(msg.textId, 'pass1234')
    expect(textShare.sharedTexts.value[0].content).toBe('잠긴 내용')
    expect(lockState.keyFor(lock.salt)).toBeTruthy()
  })

  it('이번 접속에서 같은 비밀번호를 확인했으면 들어오자마자 자동으로 푼다', async () => {
    const { q, svc, textShare } = setup()
    lockState.rememberKey(lock.salt, lock.encKey, lock.verifier)
    const enc = await encryptText(lock.encKey, ROOM, 'auto')
    svc.unlock.mockResolvedValue([])
    svc.unlock.mockImplementation(async (_r, ids) => ids.map((textId) => ({ textId, enc })))
    await q.ingest(lockedMessage(lock))
    await vi.waitFor(() => expect(textShare.sharedTexts.value[0].content).toBe('auto'))
    expect(svc.unlock).toHaveBeenCalledWith(ROOM, [textShare.sharedTexts.value[0].id], lock.verifier)
  })

  it('암호문이 메시지에 실려 온 경우(구버전 서버)에는 서버 없이 이 기기에서 확인한다', async () => {
    const { q, svc, textShare } = setup()
    const enc = await encryptText(lock.encKey, ROOM, 'local')
    const msg = lockedMessage(lock, enc)
    await q.ingest(msg)
    await expect(q.unlockWithPassword(msg.textId, 'nope-nope')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
    await q.unlockWithPassword(msg.textId, 'pass1234')
    expect(textShare.sharedTexts.value[0].content).toBe('local')
    expect(textShare.sharedTexts.value[0].enc).toBeUndefined()
    expect(svc.unlock).not.toHaveBeenCalled()
  })

  it('만료돼 서버에 없으면(TEXT_NOT_FOUND) 목록에서도 뺀다', async () => {
    const { q, svc, textShare } = setup()
    svc.unlock.mockRejectedValue(Object.assign(new Error('gone'), { code: 'TEXT_NOT_FOUND', status: 404 }))
    const msg = lockedMessage(lock)
    await q.ingest(msg)
    await expect(q.unlockWithPassword(msg.textId, 'pass1234')).rejects.toMatchObject({ code: 'TEXT_NOT_FOUND' })
    expect(textShare.sharedTexts.value).toHaveLength(0)
  })

  it('1:1 방 텍스트는 방 키로 풀어 내용으로 넣는다', async () => {
    const key = (await deriveLock('room-secret')).encKey
    const { q, textShare } = setup({ privateKey: key })
    const enc = await encryptText(key, PRV, '둘만')
    await q.ingest({ type: 'text-shared', textId: 'p1', roomId: PRV, enc, timestamp: 1, expiresAt: Date.now() + 60000 })
    expect(textShare.sharedTexts.value[0]).toMatchObject({ content: '둘만', roomId: PRV })
  })

  it('loadRooms: 목록이 404(null)면 미지원으로 표시, 두 번 불러와도 textId는 하나', async () => {
    const msg = { type: 'text-shared', textId: 'q1', roomId: ROOM, locked: true, lock: { salt: 'x'.repeat(22) }, timestamp: 1, expiresAt: Date.now() + 60000 }
    const { q, textShare } = setup({ service: { list: vi.fn(async (roomId) => (roomId === ROOM ? [msg] : null)) } })
    expect(await q.loadRooms([ROOM])).toBe(1)
    expect(await q.loadRooms([ROOM])).toBe(0)
    expect(textShare.sharedTexts.value).toHaveLength(1)
    expect(q.supported.value).toBe(true)
    await q.loadRooms(['room-old'])
    expect(q.supported.value).toBe(false)
  })

  it('삭제: 보낸 기기의 삭제 키와 확인한 비밀번호를 증명으로 보내고, 보관 중이 아니면 묻지 않는다', async () => {
    const { q, svc, textShare } = setup()
    const later = Date.now() + 60000
    await q.ingest({ type: 'text-shared', textId: 'live', roomId: ROOM, content: 'x', timestamp: 1 })
    expect(await q.removeFromServer(ROOM, { textIds: ['live'] })).toEqual({ deleted: [], forbidden: [] })
    expect(svc.remove).not.toHaveBeenCalled()

    await q.ingest(lockedMessage(lock, null, { textId: 'mine', expiresAt: later }))
    lockState.rememberDeleteKey(ROOM, 'mine', 'k'.repeat(43))
    expect(q.canCancel(textShare.sharedTexts.value.find((x) => x.id === 'mine'))).toBe(true)
    await q.removeFromServer(ROOM, { textIds: ['mine'] })
    expect(svc.remove).toHaveBeenLastCalledWith(ROOM, { textIds: ['mine'], deleteKeys: { mine: 'k'.repeat(43) }, proofs: [] })

    lockState.rememberKey(lock.salt, lock.encKey, lock.verifier)
    await q.removeFromServer(ROOM, { all: true })
    expect(svc.remove).toHaveBeenLastCalledWith(ROOM, expect.objectContaining({ all: true, proofs: [{ salt: lock.salt, verifier: lock.verifier }] }))
  })

  it('남이 잠근 보관 텍스트는 증명이 없으면 보관 취소할 수 없다', async () => {
    const { q, textShare } = setup()
    await q.ingest(lockedMessage(lock, null, { textId: 'theirs', expiresAt: Date.now() + 60000 }))
    expect(q.canCancel(textShare.sharedTexts.value[0])).toBe(false)
  })

  it('expire: 만료된 잠긴(못 푼) 텍스트만 빼고 이미 보이는 텍스트는 남긴다', async () => {
    const { q, textShare } = setup()
    const past = Date.now() - 1
    await q.ingest(lockedMessage(lock, null, { textId: 'gone', expiresAt: past }))
    await q.ingest({ type: 'text-shared', textId: 'seen', roomId: ROOM, content: 'ok', timestamp: 1, expiresAt: past })
    expect(q.expire()).toBe(1)
    expect(textShare.sharedTexts.value.map((x) => x.id)).toEqual(['seen'])
    expect(q.isQueued(textShare.sharedTexts.value[0])).toBe(false)
  })
})
