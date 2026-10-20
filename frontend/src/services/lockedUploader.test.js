import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { lockedUpload } from './lockedUploader.js'
import {
  deriveLock, unwrapFileKey, decryptName, createDecryptor, fromB64u, ctSize, CT_PART_SIZE, RECORD_SIZE
} from '../utils/lockCrypto.js'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto
})

function fakeApi({ partSize = CT_PART_SIZE } = {}) {
  const calls = { create: [], complete: [], abort: [] }
  const api = {
    calls,
    create: async (roomId, p) => {
      calls.create.push(p)
      return { uploadId: 'u1', key: `${roomId}/abc`, id: 'abc', partSize, partCount: Math.ceil(ctSize(p.size) / partSize), ctSize: ctSize(p.size) }
    },
    sign: async (roomId, p) => ({ urls: p.partNumbers.map((n) => ({ partNumber: n, url: `https://r2/${n}` })) }),
    parts: async () => ({ parts: [] }),
    complete: async (roomId, p) => {
      calls.complete.push(p)
      return { success: true, id: 'abc', locked: true, size: calls.create[0].size, ctSize: ctSize(calls.create[0].size) }
    },
    abort: async (roomId, p) => { calls.abort.push(p); return { success: true } }
  }
  return api
}

describe('lockedUpload', () => {
  it('파트를 잠가 올리고, 받는 쪽이 메타데이터로 이름과 본문을 복원한다', async () => {
    const lock = await deriveLock('비번0912', undefined, { iterations: 1000 })
    const plain = new Uint8Array(RECORD_SIZE + 500).map((_, i) => (i * 7) & 0xff)
    const file = new File([plain], '수학여행.pdf', { type: 'application/pdf', lastModified: 1 })
    const api = fakeApi()
    const sent = new Map()
    const progress = []
    const res = await lockedUpload('room-x', file, lock, {
      api,
      putPart: async (url, blob) => { sent.set(url, new Uint8Array(await blob.arrayBuffer())); return `"etag-${url}"` },
      onProgress: (p) => progress.push(p)
    })
    expect(res).toMatchObject({ id: 'abc', size: plain.length, ctSize: ctSize(plain.length) })
    // 서버로 간 create 본문에는 원래 이름·비밀번호가 없다
    const body = api.calls.create[0]
    expect(body.size).toBe(plain.length)
    expect(JSON.stringify(body)).not.toContain('수학여행')
    expect(JSON.stringify(body)).not.toContain('비번0912')
    expect(progress.at(-1)).toEqual({ encPercent: 100, upPercent: 100 })

    const recv = await deriveLock('비번0912', body.lock.salt, { iterations: 1000 })
    const dk = await unwrapFileKey(recv.encKey, body.lock.wk, body.lock.wkIv)
    expect(await decryptName(dk, body.lock.en, body.lock.enIv)).toBe('수학여행.pdf')
    const ct = sent.get('https://r2/1')
    expect(ct.length).toBe(ctSize(plain.length))
    const d = createDecryptor(dk, fromB64u(body.lock.np), plain.length)
    const out = await d.push(ct)
    d.finish()
    expect(Buffer.compare(Buffer.concat(out.map((u) => Buffer.from(u))), Buffer.from(plain))).toBe(0)
  })

  it('서버 파트 크기가 규격과 다르면 시작하지 않고 정리한다', async () => {
    const lock = await deriveLock('abcd', undefined, { iterations: 1000 })
    const api = fakeApi({ partSize: 64 * 1024 * 1024 })
    const file = new File([new Uint8Array(10)], 'a.txt')
    await expect(lockedUpload('room-x', file, lock, { api, putPart: async () => '"e"' })).rejects.toMatchObject({ code: 'LOCK_PART_SIZE' })
    expect(api.calls.abort.length).toBe(1)
  })
})
