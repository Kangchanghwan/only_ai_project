import { describe, it, expect, vi } from 'vitest'
vi.mock('./lockedDownloader.js', () => ({ prepareLockedEntry: vi.fn(), decryptInMemory: vi.fn() }))
vi.mock('./r2Service.js', () => ({ r2Service: { getDownloadUrl: vi.fn() } }))
import { createEditRoomHooks, lockFromKeyring } from './editRoom.js'
import { b64u } from '../utils/lockCrypto.js'

function setup(list, { names = {} } = {}) {
  const files = [...list]
  const lockState = { nameFor: (roomId, id) => names[id] || null }
  const upload = vi.fn(async (f) => { files.push(f._add); return true })
  const remove = vi.fn(async (f) => { files.splice(files.indexOf(f), 1) })
  const keys = new Map()
  lockState.keyFor = (salt) => keys.get(salt) || null
  const lockedMeta = vi.fn(async () => ({ salt: 'SALT1' }))
  const isPrivate = vi.fn(() => false)
  const hooks = createEditRoomHooks({ lockState, files: () => files, upload, remove, isPrivate, lockedMeta })
  return { files, hooks, upload, remove, keys, lockedMeta, isPrivate }
}
const mk = (name, add) => Object.assign(new File(['x'], name), { _add: add })

describe('editRoom.replace (원본 덮어쓰기)', () => {
  it('같은 저장 이름이면 올리기만 하고 지우지 않는다', async () => {
    const orig = { roomId: 'r', name: '분기_보고서.docx' }
    const { hooks, remove } = setup([orig])
    const r = await hooks.replace(orig, mk('분기_보고서.docx', orig), 'ip')
    expect(r).toEqual({ ok: true, next: orig, removed: true })
    expect(remove).not.toHaveBeenCalled()
  })
  it('doc → docx: 올린 뒤 원본 doc 을 지우고 새 항목을 돌려준다', async () => {
    const orig = { roomId: 'r', name: 'a.doc' }
    const added = { roomId: 'r', name: 'a.docx' }
    const { hooks, remove } = setup([orig])
    const r = await hooks.replace(orig, mk('a.docx', added), 'ip')
    expect(remove).toHaveBeenCalledWith(orig)
    expect(r.next).toBe(added)
  })
  it('잠긴 파일: 원본 salt 의 키로 다시 잠가 올리고, 새 id 항목을 찾고 원본 id 를 지운다 (범위 잠금 꺼져 있어도)', async () => {
    const orig = { roomId: 'r', name: 'ID1', locked: true }
    const added = { roomId: 'r', name: 'ID2', locked: true }
    const { hooks, remove, upload, keys } = setup([orig], { names: { ID1: '비밀.hwpx', ID2: '비밀.hwpx' } })
    keys.set('SALT1', { encKey: 'K', verifier: b64u(new Uint8Array([1, 2, 3])) })
    const r = await hooks.replace(orig, mk('비밀.hwpx', added), 'ip')
    const lock = upload.mock.calls[0][2]
    expect(lock).toMatchObject({ salt: 'SALT1', encKey: 'K' })
    expect(lock.vh).toMatch(/^[0-9a-f]{64}$/)
    expect(remove).toHaveBeenCalledWith(orig)
    expect(r).toEqual({ ok: true, next: added, removed: true })
  })
  it('잠긴 파일인데 이번 접속에 키가 없으면 LOCK, 올리지 않음', async () => {
    const orig = { roomId: 'r', name: 'ID1', locked: true }
    const { hooks, upload } = setup([orig])
    expect(await hooks.replace(orig, mk('a.hwpx', null), 'ip')).toEqual({ ok: false, code: 'LOCK' })
    expect(upload).not.toHaveBeenCalled()
  })
  it('잠기지 않은 원본은 lock=false 로(범위 잠금이 켜져 있어도 잠그지 않음), 방(private)은 undefined 로 방 키', async () => {
    const orig = { roomId: 'r', name: 'a.docx' }
    const s1 = setup([orig])
    await s1.hooks.replace(orig, mk('a.docx', orig), 'ip')
    expect(s1.upload.mock.calls[0][2]).toBe(false)
    const s2 = setup([orig]); s2.isPrivate.mockReturnValue(true)
    await s2.hooks.replace({ ...orig, locked: true }, mk('a.docx', { roomId: 'r', name: 'ID9', locked: true }), 'pair:x')
    expect(s2.upload.mock.calls[0][2]).toBeUndefined()
    expect(s2.lockedMeta).not.toHaveBeenCalled()
  })
  it('lockFromKeyring: vh = sha256(verifier 바이트) hex', async () => {
    const v = new Uint8Array([9, 8, 7])
    const ls = { keyFor: () => ({ encKey: 'K', verifier: b64u(v) }) }
    const l = await lockFromKeyring(ls, 'S')
    const d = await crypto.subtle.digest('SHA-256', v)
    expect(l.vh).toBe(Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''))
  })
  it('올리기 실패면 원본을 건드리지 않는다', async () => {
    const orig = { roomId: 'r', name: 'a.doc' }
    const { hooks, remove, upload } = setup([orig])
    upload.mockResolvedValueOnce(false)
    expect(await hooks.replace(orig, mk('a.docx', null), 'ip')).toEqual({ ok: false })
    expect(remove).not.toHaveBeenCalled()
  })
  it('원본 삭제 실패는 removed:false', async () => {
    const orig = { roomId: 'r', name: 'a.doc' }
    const { hooks, remove } = setup([orig])
    remove.mockRejectedValueOnce(new Error('x'))
    const r = await hooks.replace(orig, mk('a.docx', { roomId: 'r', name: 'a.docx' }), 'ip')
    expect(r.removed).toBe(false)
  })
})
