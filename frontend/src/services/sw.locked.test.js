// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import { createFileKey, encryptPart, ctPartCount, RECORD_SIZE } from '../utils/lockCrypto.js'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto
})

/** public/sw.js를 가짜 self에 올려 리스너와 테스트용 함수를 얻는다 */
function loadSw() {
  const src = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf-8')
  const listeners = {}
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    clients: { claim: () => Promise.resolve(), get: async () => null },
    skipWaiting: () => {}
  }
  new Function('self', src)(self)
  return { self, listeners }
}

async function encryptAll(dk, np, blob) {
  const parts = []
  for (let p = 0; p < ctPartCount(blob.size); p++) parts.push(new Uint8Array(await (await encryptPart(dk, np, blob, p)).arrayBuffer()))
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0))
  let o = 0
  for (const x of parts) { out.set(x, o); o += x.length }
  return out
}

describe('서비스워커 잠금 복호기', () => {
  it('lockCrypto로 잠근 파일을 sw.js 복호기로 풀 수 있다', async () => {
    const { self } = loadSw()
    const { dk, dkRaw, np } = await createFileKey()
    const plain = new Uint8Array(RECORD_SIZE * 2 + 333).map((_, i) => (i * 13) & 0xff)
    const ct = await encryptAll(dk, np, new Blob([plain]))
    const key = await crypto.subtle.importKey('raw', dkRaw, 'AES-GCM', false, ['decrypt'])
    const d = self.__lockedTest.createLockedDecryptor(key, np, plain.length)
    const out = []
    for (let i = 0; i < ct.length; i += 65536) out.push(...(await d.push(ct.subarray(i, i + 65536))))
    d.finish()
    const joined = Buffer.concat(out.map((u) => Buffer.from(u)))
    expect(Buffer.compare(joined, Buffer.from(plain))).toBe(0)
  })

  it('변조된 암호문은 거부한다', async () => {
    const { self } = loadSw()
    const { dk, dkRaw, np } = await createFileKey()
    const plain = new Uint8Array(1000).fill(7)
    const ct = await encryptAll(dk, np, new Blob([plain]))
    ct[3] ^= 1
    const key = await crypto.subtle.importKey('raw', dkRaw, 'AES-GCM', false, ['decrypt'])
    const d = self.__lockedTest.createLockedDecryptor(key, np, plain.length)
    await expect(d.push(ct)).rejects.toBeTruthy()
  })

  it('Content-Disposition은 UTF-8 파일명을 인코딩한다', () => {
    const { self } = loadSw()
    const v = self.__lockedTest.lockedContentDisposition('수학 "계획".pdf')
    expect(v).toContain("filename*=UTF-8''")
    expect(v).not.toMatch(/[\r\n]/)
  })

  it('잘못된 등록은 거절하고 share-target 메시지는 그대로 동작한다', () => {
    const { listeners } = loadSw()
    const replies = []
    const port = { postMessage: (m) => replies.push(m) }
    listeners.message({ data: { type: 'LOCKED_REGISTER', token: 'x', url: 'http://a' }, ports: [port] })
    expect(replies[0]).toEqual({ ok: false })
    listeners.message({ data: { type: 'GET_SHARE_DATA' }, ports: [port] })
    expect(replies[1]).toEqual({ type: 'SHARE_DATA', data: null })
  })
})

describe('서비스워커 오프라인 폴백', () => {
  function fetchEvent(request) {
    let responded
    return { request, respondWith: (p) => { responded = p }, get responded() { return responded } }
  }

  it('navigate 요청은 폴백을 쓰지만 /share-target POST는 가로채는 핸들러가 먼저 처리한다', async () => {
    globalThis.caches = { match: async () => 'OFFLINE' }
    globalThis.fetch = async () => { throw new Error('offline') }
    const realRedirect = Response.redirect
    Response.redirect = (u, st) => ({ redirected: u, status: st })
    const { listeners } = loadSw()
    const nav = fetchEvent({ url: 'https://x.test/room', mode: 'navigate', method: 'GET' })
    listeners.fetch(nav)
    expect(await nav.responded).toBe('OFFLINE')

    const share = fetchEvent({ url: 'https://x.test/share-target', mode: 'navigate', method: 'POST', formData: async () => { throw new Error('x') } })
    listeners.fetch(share)
    const res = await share.responded
    expect(res).toEqual({ redirected: '/?share-target=1', status: 303 })
    Response.redirect = realRedirect

    const other = fetchEvent({ url: 'https://x.test/a.js', mode: 'no-cors', method: 'GET' })
    listeners.fetch(other)
    expect(other.responded).toBeUndefined()
  })
})
