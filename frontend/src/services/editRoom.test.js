import { describe, it, expect, vi } from 'vitest'
vi.mock('./lockedDownloader.js', () => ({ prepareLockedEntry: vi.fn(), decryptInMemory: vi.fn() }))
vi.mock('./r2Service.js', () => ({ r2Service: { getDownloadUrl: vi.fn() } }))
import { createEditRoomHooks } from './editRoom.js'

function setup(list, { names = {} } = {}) {
  const files = [...list]
  const lockState = { nameFor: (roomId, id) => names[id] || null }
  const upload = vi.fn(async (f) => { files.push(f._add); return true })
  const remove = vi.fn(async (f) => { files.splice(files.indexOf(f), 1) })
  const lockFor = vi.fn(() => null)
  const hooks = createEditRoomHooks({ lockState, files: () => files, upload, remove, lockFor })
  return { files, hooks, upload, remove, lockFor }
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
  it('잠긴 파일: 새 id 항목을 찾고 원본 id 를 지운다', async () => {
    const orig = { roomId: 'r', name: 'ID1', locked: true }
    const added = { roomId: 'r', name: 'ID2', locked: true }
    const { hooks, remove } = setup([orig], { names: { ID1: '비밀.hwpx', ID2: '비밀.hwpx' } })
    const r = await hooks.replace(orig, mk('비밀.hwpx', added), 'ip')
    expect(remove).toHaveBeenCalledWith(orig)
    expect(r).toEqual({ ok: true, next: added, removed: true })
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
  it('canSave: 잠긴 파일은 그 범위 잠금이 있을 때만', () => {
    const { hooks, lockFor } = setup([])
    expect(hooks.canSave({ locked: false }, 'ip')).toBe(true)
    expect(hooks.canSave({ locked: true, roomId: 'r' }, 'ip')).toBe(false)
    lockFor.mockReturnValue({ key: 1 })
    expect(hooks.canSave({ locked: true, roomId: 'r' }, 'ip')).toBe(true)
  })
})
