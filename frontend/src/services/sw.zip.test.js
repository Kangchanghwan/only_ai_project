// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildZipParts } from '../utils/zipWriter.js'
import { createFileKey, encryptPart, ctPartCount, RECORD_SIZE } from '../utils/lockCrypto.js'

/** public/sw.js를 가짜 self에 올려 ZIP 도구와 리스너를 얻는다 */
function loadSw() {
  const src = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf-8')
  const listeners = {}
  const posted = []
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    clients: { claim: () => Promise.resolve(), get: async () => ({ postMessage: (m) => posted.push(m) }), matchAll: async () => [] },
    skipWaiting: () => {},
    navigator: { language: 'ko' },
    registration: { showNotification: async () => {} },
  }
  new Function('self', src)(self)
  return { zip: self.__zipTest, listeners, posted }
}

const enc = new TextEncoder()
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** download-urls 응답과 파일 본문(조각)을 흉내 내는 fetch */
function fakeFetch(bodies, { status = 200 } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push(url)
    if (url.endsWith('/api/r2/download-urls')) {
      const { fileNames } = JSON.parse(init.body)
      return { ok: true, json: async () => ({ urls: fileNames.map((n) => ({ fileName: n, url: `https://r2.example/${encodeURIComponent(n)}` })) }) }
    }
    const name = decodeURIComponent(url.split('/').pop())
    const chunks = bodies[name].map((c) => (typeof c === 'string' ? enc.encode(c) : c))
    let i = 0
    return {
      ok: status === 200,
      body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }), cancel: () => {} }) },
    }
  }
  return { impl, calls }
}

async function readAll(stream) {
  const reader = stream.getReader()
  const parts = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return concat(parts)
}

const job = (entries) => ({ apiUrl: 'https://api.example', zipName: 'x.zip', entries })

describe('서비스워커 ZIP 스트림', () => {
  it('src/utils/zipWriter.js와 바이트 단위로 같은 ZIP을 만든다', async () => {
    const { zip } = loadSw()
    const date = new Date(2026, 10, 13, 9, 15, 30)
    const bodies = { 'a.jpg': ['hello ', 'world'], '가.txt': ['한글'], 'empty': [] }
    const entries = [
      { roomId: 'room-a', file: 'a.jpg', name: 'a.jpg', size: 11 },
      { roomId: 'room-a', file: '가.txt', name: '가.txt', size: enc.encode('한글').length },
      { roomId: 'room-shared', file: 'empty', name: 'empty', size: 0 },
    ]
    const events = []
    const { impl, calls } = fakeFetch(bodies)
    const bytes = await readAll(zip.createZipStream(job(entries), { fetchImpl: impl, now: date, onEvent: (e) => events.push(e) }))
    const expected = concat(buildZipParts([
      { name: 'a.jpg', chunks: [enc.encode('hello world')] },
      { name: '가.txt', chunks: [enc.encode('한글')] },
      { name: 'empty', chunks: [] },
    ], date))
    expect(bytes).toEqual(expected)
    expect(zip.zipTotalSize(entries.map((e) => ({ nameBytes: enc.encode(e.name), size: e.size })))).toBe(bytes.length)
    expect(events.at(-1)).toEqual({ loaded: bytes.length, done: true })
    // 파일마다 받기 직전에 주소를 새로 받는다
    expect(calls.filter((c) => c.endsWith('/api/r2/download-urls'))).toHaveLength(3)
  })

  it('받은 크기가 목록과 다르면 스트림을 오류로 끝낸다 (깨진 ZIP을 남기지 않는다)', async () => {
    const { zip } = loadSw()
    const events = []
    const { impl } = fakeFetch({ 'a.jpg': ['short'] })
    const stream = zip.createZipStream(job([{ roomId: 'room-a', file: 'a.jpg', name: 'a.jpg', size: 100 }]), { fetchImpl: impl, onEvent: (e) => events.push(e) })
    await expect(readAll(stream)).rejects.toThrow('ZIP_SIZE_MISMATCH')
    expect(events.at(-1)).toEqual({ error: 'ZIP_SIZE_MISMATCH' })
  })

  it('파일을 받지 못하면 ZIP_DOWNLOAD_FAILED', async () => {
    const { zip } = loadSw()
    const events = []
    const { impl } = fakeFetch({ 'a.jpg': ['x'] }, { status: 403 })
    const stream = zip.createZipStream(job([{ roomId: 'room-a', file: 'a.jpg', name: 'a.jpg', size: 1 }]), { fetchImpl: impl, onEvent: (e) => events.push(e) })
    await expect(readAll(stream)).rejects.toThrow('ZIP_DOWNLOAD_FAILED')
    expect(events.at(-1)).toEqual({ error: 'ZIP_DOWNLOAD_FAILED' })
  })

  it('등록 검사: 이상한 주소·이름·크기는 거절한다', () => {
    const { zip } = loadSw()
    const ok = { token: 'abcdef123456', apiUrl: 'https://api.clipboardapp.org', zipName: 'a.zip', entries: [{ roomId: 'room-1', file: 'a', name: 'a', size: 1 }] }
    expect(zip.validZipJob(ok)).toBe(true)
    expect(zip.validZipJob({ ...ok, apiUrl: 'http://localhost:3001' })).toBe(true)
    expect(zip.validZipJob({ ...ok, apiUrl: 'http://evil.example' })).toBe(false)
    expect(zip.validZipJob({ ...ok, apiUrl: 'https://api.example/path' })).toBe(false)
    expect(zip.validZipJob({ ...ok, token: 'a-b' })).toBe(false)
    expect(zip.validZipJob({ ...ok, entries: [{ ...ok.entries[0], name: '../x' }] })).toBe(false)
    expect(zip.validZipJob({ ...ok, entries: [{ ...ok.entries[0], roomId: 'room/../x' }] })).toBe(false)
    expect(zip.validZipJob({ ...ok, entries: [{ ...ok.entries[0], size: -1 }] })).toBe(false)
    expect(zip.validZipJob({ ...ok, entries: [{ ...ok.entries[0], size: 5 * 1024 ** 3 }] })).toBe(false)
    expect(zip.validZipJob({ ...ok, entries: [] })).toBe(false)
  })

  it('ZIP_REGISTER → /__zip/<token> 응답: 1회용, ZIP 헤더와 정확한 Content-Length', async () => {
    const { zip, listeners } = loadSw()
    const replies = []
    const token = 'tok123456789'
    listeners.message({
      data: { type: 'ZIP_REGISTER', token, apiUrl: 'https://api.example', zipName: '사진 묶음.zip', entries: [{ roomId: 'room-a', file: 'a', name: 'a', size: 3 }] },
      source: { id: 'client-1' },
      ports: [{ postMessage: (m) => replies.push(m) }],
    })
    expect(replies).toEqual([{ ok: true }])
    expect(zip.zipJobs.has(token)).toBe(true)
    const res = await zip.handleZipDownload(token)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')
    expect(res.headers.get('Content-Disposition')).toContain("filename*=UTF-8''%EC%82%AC%EC%A7%84%20%EB%AC%B6%EC%9D%8C.zip")
    expect(Number(res.headers.get('Content-Length'))).toBe(22 + 30 + 1 + 3 + 16 + 46 + 1)
    expect((await zip.handleZipDownload(token)).status).toBe(404)
  })

  it('크기가 추정값(exact:false)이면 길이 검사를 하지 않고 Content-Length를 보내지 않는다 (QR 받기 화면)', async () => {
    const { zip, listeners } = loadSw()
    const { impl } = fakeFetch({ 'memo.txt': ['실제 길이는 다르다'] })
    const bytes = await readAll(zip.createZipStream({ ...job([{ roomId: 'room-a', file: 'memo.txt', name: 'memo.txt', size: 0 }]), exact: false }, { fetchImpl: impl }))
    const v = new DataView(bytes.buffer)
    const centralOffset = v.getUint32(bytes.length - 6, true)
    expect(v.getUint32(centralOffset + 24, true)).toBe(enc.encode('실제 길이는 다르다').length)
    const replies = []
    listeners.message({
      data: { type: 'ZIP_REGISTER', token: 'tokexact0001', apiUrl: 'https://api.example', zipName: 'a.zip', exact: false, entries: [{ roomId: 'room-a', file: 'a', name: 'a', size: 0 }] },
      source: { id: 'c' }, ports: [{ postMessage: (m) => replies.push(m) }],
    })
    expect(replies).toEqual([{ ok: true }])
    const res = await zip.handleZipDownload('tokexact0001')
    expect(res.headers.get('Content-Length')).toBeNull()
  })

  it('잘못된 등록은 ok:false로 답한다', () => {
    const { listeners } = loadSw()
    const replies = []
    listeners.message({ data: { type: 'ZIP_REGISTER', token: 'x' }, source: { id: 'c' }, ports: [{ postMessage: (m) => replies.push(m) }] })
    expect(replies).toEqual([{ ok: false }])
  })
})

async function encryptAll(dk, np, bytes) {
  const blob = new Blob([bytes])
  const parts = []
  for (let p = 0; p < ctPartCount(blob.size); p++) parts.push(new Uint8Array(await (await encryptPart(dk, np, blob, p)).arrayBuffer()))
  return concat(parts)
}

describe('서비스워커 ZIP: 방(잠긴) 파일', () => {
  it('키를 받아 풀면서 넣는다: 평문으로 만든 ZIP과 바이트 단위로 같고, 키는 파일마다 받기 직전에 요청한다', async () => {
    const { zip } = loadSw()
    const date = new Date(2026, 10, 14, 23, 0, 0)
    const { dk, dkRaw, np } = await createFileKey()
    const secret = new Uint8Array(RECORD_SIZE + 777).map((_, i) => (i * 31) & 0xff)
    const ct = await encryptAll(dk, np, secret)
    const asked = []
    const requestKey = async (index) => { asked.push(index); return { url: 'https://r2.example/locked-ct', dk: dkRaw, np } }
    const fetchImpl = async (url, init) => {
      if (url.endsWith('/api/r2/download-urls')) {
        const { fileNames } = JSON.parse(init.body)
        return { ok: true, json: async () => ({ urls: fileNames.map((n) => ({ fileName: n, url: `https://r2.example/${n}` })) }) }
      }
      const data = url === 'https://r2.example/locked-ct' ? ct : enc.encode('plain file')
      const chunks = []
      for (let i = 0; i < data.length; i += 50000) chunks.push(data.subarray(i, i + 50000))
      let i = 0
      return { ok: true, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }), cancel: () => {} }) } }
    }
    const entries = [
      { roomId: 'prv-g-' + 'a'.repeat(24), file: 'id1', name: '계약서.pdf', size: secret.length, locked: true },
      { roomId: 'room-a', file: 'b.txt', name: 'b.txt', size: 10 },
    ]
    const bytes = await readAll(zip.createZipStream(job(entries), { fetchImpl, now: date, requestKey }))
    const expected = concat(buildZipParts([{ name: '계약서.pdf', chunks: [secret] }, { name: 'b.txt', chunks: [enc.encode('plain file')] }], date))
    expect(Buffer.compare(Buffer.from(bytes), Buffer.from(expected))).toBe(0)
    expect(asked).toEqual([0])
  })

  it('키를 못 받으면 ZIP_KEY_FAILED, 변조된 암호문이면 ZIP_DECRYPT_FAILED로 끝낸다', async () => {
    const { zip } = loadSw()
    const { dk, dkRaw, np } = await createFileKey()
    const secret = new Uint8Array(1000).fill(7)
    const ct = await encryptAll(dk, np, secret)
    ct[20] ^= 1
    const body = (data) => ({ ok: true, body: { getReader: () => { let d = false; return { read: async () => (d ? { done: true } : (d = true, { done: false, value: data })), cancel: () => {} } } } })
    const entries = [{ roomId: 'prv-1', file: 'id1', name: 'x', size: secret.length, locked: true }]
    await expect(readAll(zip.createZipStream(job(entries), { fetchImpl: async () => body(ct), requestKey: async () => { throw new Error('ZIP_KEY_FAILED') } }))).rejects.toThrow('ZIP_KEY_FAILED')
    await expect(readAll(zip.createZipStream(job(entries), { fetchImpl: async () => body(ct), requestKey: async () => ({ url: 'https://r2.example/x', dk: dkRaw, np }) }))).rejects.toThrow('ZIP_DECRYPT_FAILED')
  })

  it('탭에 키를 요청한다: https 주소와 32바이트 키만 받아들인다', async () => {
    const src = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf-8')
    let reply = null
    const client = { postMessage: (msg, [port]) => { expect(msg).toEqual({ type: 'ZIP_NEED_KEY', token: 't0k3n0000001', index: 2 }); port.postMessage(reply) } }
    const self = { addEventListener: () => {}, clients: { get: async () => client, claim: async () => {} }, skipWaiting: () => {}, navigator: { language: 'ko' }, registration: {} }
    new Function('self', src)(self)
    const ask = (r) => { reply = r; return self.__zipTest.zipAskClientForKey('c1', 't0k3n0000001', 2) }
    const good = { ok: true, url: 'https://r2.example/a', dk: new Uint8Array(32), np: new Uint8Array(4) }
    await expect(ask(good)).resolves.toMatchObject({ url: 'https://r2.example/a' })
    await expect(ask({ ...good, url: 'http://evil.example/a' })).rejects.toThrow('ZIP_KEY_FAILED')
    await expect(ask({ ...good, dk: new Uint8Array(16) })).rejects.toThrow('ZIP_KEY_FAILED')
    await expect(ask({ ok: false })).rejects.toThrow('ZIP_KEY_FAILED')
  })

  it('등록 검사: locked는 boolean만', () => {
    const { zip } = loadSw()
    const ok = { token: 'abcdef123456', apiUrl: 'https://api.clipboardapp.org', zipName: 'a.zip', entries: [{ roomId: 'prv-1', file: 'id', name: 'a', size: 1, locked: true }] }
    expect(zip.validZipJob(ok)).toBe(true)
    expect(zip.validZipJob({ ...ok, entries: [{ ...ok.entries[0], locked: 'yes' }] })).toBe(false)
  })
})
