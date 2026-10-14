import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const r2 = vi.hoisted(() => ({ lockedMeta: vi.fn(), lockedUnlock: vi.fn() }))
vi.mock('./r2Service.js', () => ({ r2Service: r2 }))

import { createLockedShareLink, openLockedLink } from './lockedDownloader.js'
import { deriveLock, prepareLockedFile, encryptPart, ctSize, fromB64u, b64u } from '../utils/lockCrypto.js'
import { parseLockedLink } from '../utils/lockedLink.js'
import { useLockState } from '../composables/useLockState.js'

const ROOM = 'room-2ecd26527838'
const ID = '0123456789abcdef0123456789abcdef'

async function setup(content = 'hello locked qr ✓ '.repeat(1000)) {
  const lock = await deriveLock('pw1234', undefined, { iterations: 1000 })
  const plain = new Blob([content])
  const prepared = await prepareLockedFile(lock, new File([plain], '보고서.pdf'))
  const cipher = await encryptPart(prepared.dk, prepared.np, plain, 0)
  const m = prepared.meta
  r2.lockedMeta.mockResolvedValue({ v: 1, salt: m.salt, size: plain.size, rs: 1048576, remaining: 30 })
  r2.lockedUnlock.mockImplementation(async (roomId, id, verifier) => {
    if (verifier !== lock.verifier) throw Object.assign(new Error('x'), { code: 'WRONG_PASSWORD', status: 403, remaining: 29 })
    return { url: 'https://r2.example/obj', size: plain.size, ctSize: ctSize(plain.size), rs: 1048576, np: m.np, wk: m.wk, wkIv: m.wkIv, en: m.en, enIv: m.enIv }
  })
  return { lock, plain, cipher, content }
}

describe('잠긴 파일 QR 링크', () => {
  beforeEach(() => {
    r2.lockedMeta.mockReset()
    r2.lockedUnlock.mockReset()
    useLockState().resetLockState()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('비밀번호를 확인한 기기만 링크를 만들 수 있다', async () => {
    await setup()
    await expect(createLockedShareLink({ roomId: ROOM, id: ID, lockState: useLockState(), origin: 'https://x' }))
      .rejects.toMatchObject({ code: 'NEED_PASSWORD' })
  })

  it('링크에는 파일 키와 확인값만 있고, 그것만으로 이름을 풀고 내용을 그대로 받는다', async () => {
    const { lock, cipher, content } = await setup()
    const ls = useLockState()
    ls.rememberKey(lock.salt, lock.encKey, lock.verifier)
    const { url, name } = await createLockedShareLink({ roomId: ROOM, id: ID, lockState: ls, origin: 'https://www.clipboardapp.org' })
    expect(name).toBe('보고서.pdf')
    expect(url).not.toContain('pw1234')
    const link = parseLockedLink(new URL(url).hash)
    expect(link).toMatchObject({ roomId: ROOM, id: ID, verifier: lock.verifier })
    expect(fromB64u(link.key).length).toBe(32)

    // 다른 기기(키링 비어 있음)에서 링크만으로 연다
    ls.resetLockState()
    expect(await openLockedLink({ ...link, download: false })).toEqual({ name: '보고서.pdf', size: new Blob([content]).size })

    let saved = null
    vi.stubGlobal('fetch', vi.fn(async () => new Response(cipher)))
    URL.createObjectURL = vi.fn((b) => { saved = b; return 'blob:x' })
    URL.revokeObjectURL = vi.fn()
    const progress = []
    await openLockedLink({ ...link, onProgress: (p) => progress.push(p) })
    expect(await saved.text()).toBe(content)
    expect(progress.at(-1)).toBe(100)
  })

  it('키가 틀린 링크·확인값이 틀린 링크는 LOCK_LINK_INVALID', async () => {
    const { lock } = await setup()
    const base = { roomId: ROOM, id: ID, verifier: lock.verifier, key: b64u(new Uint8Array(32)) }
    await expect(openLockedLink({ ...base, download: false })).rejects.toMatchObject({ code: 'LOCK_LINK_INVALID' })
    await expect(openLockedLink({ ...base, verifier: b64u(new Uint8Array(32).fill(7)), download: false }))
      .rejects.toMatchObject({ code: 'LOCK_LINK_INVALID' })
  })

  it('파일이 없으면(삭제·만료) 서버 오류를 그대로 넘긴다', async () => {
    r2.lockedUnlock.mockRejectedValue(Object.assign(new Error('x'), { status: 404, code: 'LOCKED_NOT_FOUND' }))
    await expect(openLockedLink({ roomId: ROOM, id: ID, verifier: 'a'.repeat(43), key: 'a'.repeat(43), download: false }))
      .rejects.toMatchObject({ status: 404 })
  })
})
