import { describe, it, expect } from 'vitest'
import { createHandoffStore, TTL_MS, DB_NAME, STORE } from './handoffStore.js'
import { createFakeIdb } from '../test/fakeIdb.js'

const bytes = (n) => new Uint8Array([1, 2, 3, n]).buffer

describe('handoffStore (폰으로 보내기 전달함)', () => {
  it('이름 규칙: DB cs-handoff, store files', () => {
    expect(DB_NAME).toBe('cs-handoff')
    expect(STORE).toBe('files')
  })

  it('넣은 항목을 id 로 읽고 {id,name,type,bytes,ts} 모양이다', async () => {
    let t = 1000
    const s = createHandoffStore({ idb: createFakeIdb(), now: () => t })
    const id = await s.put({ name: '보고서.hwpx', type: 'application/octet-stream', bytes: bytes(7) })
    const it1 = await s.read(id)
    expect(Object.keys(it1).sort()).toEqual(['bytes', 'id', 'name', 'ts', 'type'])
    expect(it1.name).toBe('보고서.hwpx')
    expect(it1.ts).toBe(1000)
    expect(Array.from(new Uint8Array(it1.bytes))).toEqual([1, 2, 3, 7])
  })

  it('10분이 지난 항목은 읽을 때 null 이고 다른 만료 항목도 함께 정리한다', async () => {
    let t = 0
    const idb = createFakeIdb()
    const s = createHandoffStore({ idb, now: () => t })
    const old1 = await s.put({ name: 'a.hwp', bytes: bytes(1) })
    t = 5 * 60 * 1000
    const fresh = await s.put({ name: 'b.hwp', bytes: bytes(2) })
    t = TTL_MS + 1000 // old1 은 10분 1초, fresh 는 5분 1초
    expect(await s.read(old1)).toBeNull()
    expect((await s.read(fresh)).name).toBe('b.hwp')
    expect(idb._stores.get(STORE).size).toBe(1) // old1 은 지워졌다
    t = TTL_MS * 3
    expect(await s.read(fresh)).toBeNull()
    expect(idb._stores.get(STORE).size).toBe(0) // 전부 정리
  })

  it('remove 하면 사라진다', async () => {
    const s = createHandoffStore({ idb: createFakeIdb() })
    const id = await s.put({ name: 'a.hwp', bytes: bytes(1) })
    await s.remove(id)
    expect(await s.read(id)).toBeNull()
  })

  it('IndexedDB 가 없으면 거절한다', async () => {
    const s = createHandoffStore({ idb: null })
    await expect(s.put({ name: 'a', bytes: bytes(1) })).rejects.toThrow()
  })
})
