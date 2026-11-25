// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { buildQrLink, parseQrLink, qrProof, keyFingerprint, packQrPk, unpackQrPk, identityFromKey, sameString, newGenId, roomTag, QR_HASH_PREFIX } from './qrLink.js'
import { EMPTY_STATE_QR_URL } from './emptyState.js'
import { generateEphemeral } from './pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const x = new Uint8Array(16).map((_, i) => i + 1)
const f = 'AAECAwQFBgcICQoLDA0ODw'

describe('qrLink', () => {
  it('주소 만들기·읽기가 서로 맞고 utm_*가 남는다', () => {
    const url = buildQrLink(EMPTY_STATE_QR_URL, { s: 'abc_DEF-123', k: '3-17-0', g: 'AbCd12', x, f })
    expect(url.startsWith(EMPTY_STATE_QR_URL + QR_HASH_PREFIX)).toBe(true)
    expect(new URL(url).searchParams.get('utm_source')).toBe('qr')
    expect(new URL(url).searchParams.get('utm_medium')).toBe('empty_state')
    const p = parseQrLink(new URL(url).hash)
    expect(p).toEqual({ s: 'abc_DEF-123', k: '3-17-0', g: 'AbCd12', x, f, r: null })
    expect(url.length).toBeLessThan(220)
  })

  it('방 꼬리표 r: 비밀·방이 같으면 같고 하나라도 다르면 다르며, 주소에 실려 오간다', async () => {
    const t = await roomTag(x, 'prv-0123456789abcdef01234567')
    expect(t).toMatch(/^[A-Za-z0-9_-]{11}$/)
    expect(await roomTag(x, 'prv-0123456789abcdef01234567')).toBe(t)
    expect(await roomTag(x, 'prv-g-0123456789abcdef01234567')).not.toBe(t)
    expect(await roomTag(new Uint8Array(16), 'prv-0123456789abcdef01234567')).not.toBe(t)
    const url = buildQrLink(EMPTY_STATE_QR_URL, { s: 's1', g: 'AbCd12', x, f, r: t })
    expect(url).not.toContain('0123456789abcdef')
    expect(parseQrLink(new URL(url).hash).r).toBe(t)
    expect(parseQrLink(new URL(url).hash.replace(/r=[^&]+/, 'r=short')).r).toBeNull()
    expect(url.length).toBeLessThan(240)
  })

  it('형식이 틀리면 null (다른 # 링크, 비밀 길이, 소켓 ID)', () => {
    expect(parseQrLink('#/pv?a=1')).toBeNull()
    expect(parseQrLink(null)).toBeNull()
    const ok = new URL(buildQrLink(EMPTY_STATE_QR_URL, { s: 's1', g: 'AbCd12', x, f })).hash
    expect(parseQrLink(ok.replace(/x=[^&]+/, 'x=AAAA'))).toBeNull()
    expect(parseQrLink(ok.replace('s=s1', 's=' + 'a'.repeat(65)))).toBeNull()
    expect(parseQrLink(ok).k).toBeNull()
  })

  it('증명은 비밀이나 휴대폰 키가 하나라도 다르면 맞지 않는다', async () => {
    const pk = (await generateEphemeral()).publicRaw
    const pk2 = (await generateEphemeral()).publicRaw
    const a = await qrProof(x, 'AbCd12', pk)
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(await qrProof(x, 'AbCd12', pk)).toBe(a)
    expect(await qrProof(new Uint8Array(16), 'AbCd12', pk)).not.toBe(a)
    expect(await qrProof(x, 'AbCd12', pk2)).not.toBe(a)
    expect(await qrProof(x, 'ZZZZ12', pk)).not.toBe(a)
  })

  it('pk에 회차·증명을 붙이고 떼어 낸다. 보통 pk는 null', async () => {
    const pk = (await generateEphemeral()).publicRaw
    const proof = await qrProof(x, 'AbCd12', pk)
    expect(unpackQrPk(packQrPk(pk, 'AbCd12', proof))).toEqual({ pk, g: 'AbCd12', proof })
    expect(unpackQrPk(pk)).toBeNull()
    expect(packQrPk(pk, 'AbCd12', proof).length).toBeLessThanOrEqual(200) // 서버 PAIR_PK_MAX_CHARS
  })

  it('지문은 16바이트, 키마다 다르다', async () => {
    const a = await keyFingerprint((await generateEphemeral()).publicRaw)
    const b = await keyFingerprint((await generateEphemeral()).publicRaw)
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(a).not.toBe(b)
  })

  it('이름표 키 → identity, 문자열 비교, 회차 ID', () => {
    expect(identityFromKey('3-17-2')).toEqual({ adj: 3, animal: 17, suffix: 2 })
    expect(identityFromKey('x')).toBeNull()
    expect(sameString('ab', 'ab')).toBe(true)
    expect(sameString('ab', 'ac')).toBe(false)
    expect(newGenId()).toMatch(/^[A-Za-z0-9_-]{6}$/)
  })
})
