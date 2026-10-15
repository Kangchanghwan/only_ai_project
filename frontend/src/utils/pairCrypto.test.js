// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { fromB64u, prepareLockedFile, unwrapFileKey, decryptName, deriveLock, deriveLockFromMaster } from './lockCrypto.js'
import { generateEphemeral, deriveSession, newRoomSecret, wrapSecret, unwrapSecret, deriveRoomLock } from './pairCrypto.js'
import { encryptText, decryptText } from './privateText.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

async function pairUp(sid = 'abcd1234') {
  const a = await generateEphemeral()
  const b = await generateEphemeral()
  const sa = await deriveSession({ privateKey: a.privateKey, myPk: a.publicRaw, peerPk: b.publicRaw, sessionId: sid })
  const sb = await deriveSession({ privateKey: b.privateKey, myPk: b.publicRaw, peerPk: a.publicRaw, sessionId: sid })
  return { a, b, sa, sb }
}

describe('pairCrypto', () => {
  it('공개키는 65B, 양쪽 sas가 같고 0..63 네 개', async () => {
    const { a, sa, sb } = await pairUp()
    expect(fromB64u(a.publicRaw).length).toBe(65)
    expect(sa.sas).toEqual(sb.sas)
    expect(sa.sas).toHaveLength(4)
    for (const i of sa.sas) expect(i >= 0 && i <= 63).toBe(true)
  })

  it('sessionId가 다르면 sas가 달라진다', async () => {
    const a = await generateEphemeral(); const b = await generateEphemeral()
    const f = (sid) => deriveSession({ privateKey: a.privateKey, myPk: a.publicRaw, peerPk: b.publicRaw, sessionId: sid })
    const x = await f('s1'); const y = await f('s2')
    expect(x.sas).not.toEqual(y.sas)
  })

  it('MITM: 공개키를 바꿔치기하면 sas가 다르다', async () => {
    const a = await generateEphemeral(); const b = await generateEphemeral(); const m = await generateEphemeral()
    const sa = await deriveSession({ privateKey: a.privateKey, myPk: a.publicRaw, peerPk: m.publicRaw, sessionId: 's' })
    const sb = await deriveSession({ privateKey: b.privateKey, myPk: b.publicRaw, peerPk: m.publicRaw, sessionId: 's' })
    expect(sa.sas).not.toEqual(sb.sas)
  })

  it('잘못된 공개키는 거부', async () => {
    const a = await generateEphemeral()
    await expect(deriveSession({ privateKey: a.privateKey, myPk: a.publicRaw, peerPk: 'AAAA', sessionId: 's' })).rejects.toThrow()
  })

  it('roomSecret 감싸기 왕복, 다른 키/변조는 실패', async () => {
    const { sa, sb } = await pairUp()
    const secret = newRoomSecret()
    const w = await wrapSecret(sa.kWrap, secret)
    expect(await unwrapSecret(sb.kWrap, w)).toEqual(secret)
    const other = await pairUp('zzzz')
    await expect(unwrapSecret(other.sb.kWrap, w)).rejects.toBeTruthy()
  })

  it('deriveRoomLock: 양쪽 동일, roomId마다 다름, 기존 잠금 규격으로 파일 왕복', async () => {
    const secret = newRoomSecret()
    const l1 = await deriveRoomLock(secret, 'prv-aaa')
    const l2 = await deriveRoomLock(new Uint8Array(secret), 'prv-aaa')
    expect(l1.salt).toBe(l2.salt)
    expect(l1.vh).toBe(l2.vh)
    expect(l1.verifier).toBe(l2.verifier)
    expect(fromB64u(l1.salt)).toHaveLength(16)
    const l3 = await deriveRoomLock(secret, 'prv-bbb')
    expect(l3.vh).not.toBe(l1.vh)
    const { meta } = await prepareLockedFile(l1, { name: '비밀.txt' })
    const dk = await unwrapFileKey(l2.encKey, meta.wk, meta.wkIv)
    expect(await decryptName(dk, meta.en, meta.enIv)).toBe('비밀.txt')
    expect(meta.vh).toBe(l2.vh)
  })

  it('deriveLock(비밀번호) 결과는 deriveLockFromMaster 추출 후에도 동일 모양', async () => {
    const l = await deriveLock('abcd', undefined, { iterations: 1000 })
    expect(Object.keys(l).sort()).toEqual(['encKey', 'salt', 'verifier', 'vh'])
    expect(typeof deriveLockFromMaster).toBe('function')
  })
})

describe('privateText', () => {
  it('왕복, 평문이 암호문에 없다', async () => {
    const lock = await deriveRoomLock(newRoomSecret(), 'prv-x')
    const e = await encryptText(lock.encKey, 'prv-x', '안녕 hello')
    expect(e.v).toBe(1)
    expect(JSON.stringify(e)).not.toContain('hello')
    expect(await decryptText(lock.encKey, 'prv-x', e)).toBe('안녕 hello')
  })
  it('다른 roomId·다른 키·변조·형식 오류는 실패', async () => {
    const lock = await deriveRoomLock(newRoomSecret(), 'prv-x')
    const other = await deriveRoomLock(newRoomSecret(), 'prv-x')
    const e = await encryptText(lock.encKey, 'prv-x', 'hi')
    await expect(decryptText(lock.encKey, 'prv-y', e)).rejects.toBeTruthy()
    await expect(decryptText(other.encKey, 'prv-x', e)).rejects.toBeTruthy()
    await expect(decryptText(lock.encKey, 'prv-x', { ...e, ct: e.ct.slice(0, -2) + 'AA' })).rejects.toBeTruthy()
    await expect(decryptText(lock.encKey, 'prv-x', { v: 2 })).rejects.toBeTruthy()
  })
})
