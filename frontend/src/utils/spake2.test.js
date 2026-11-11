import { describe, it, expect } from 'vitest'
import { p256 } from '@noble/curves/nist.js'
import { spake2Start, derivePassword, hexToBytes, bytesToHex, ID_JOINER, ID_HOST } from './spake2.js'
import { RFC9382_P256_VECTORS } from './spake2.rfcVectors.js'

const big = (hex) => BigInt('0x' + hex)

describe('SPAKE2 RFC 9382 부록 B (P256-SHA256-HKDF-HMAC) 테스트 벡터', () => {
  expect(RFC9382_P256_VECTORS).toHaveLength(4)

  RFC9382_P256_VECTORS.forEach((v, i) => {
    it(`벡터 ${i + 1} (A='${v.idA}', B='${v.idB}'): pA, pB, K, TT, Hash(TT), Ke, Ka, KcA, KcB, 확인 MAC 일치`, async () => {
      const w = big(v.w)
      const a = spake2Start({ role: 'A', w, idA: v.idA, idB: v.idB, x: big(v.x) })
      const b = spake2Start({ role: 'B', w, idA: v.idA, idB: v.idB, x: big(v.y) })
      expect(bytesToHex(a.message)).toBe(v.pA)
      expect(bytesToHex(b.message)).toBe(v.pB)

      const fa = await a.finish(b.message)
      const fb = await b.finish(a.message)
      for (const f of [fa, fb]) {
        expect(bytesToHex(f._debug.K)).toBe(v.K)
        expect(bytesToHex(f._debug.TT)).toBe(v.TT)
        expect(bytesToHex(f._debug.hashTT)).toBe(v.Hash)
        expect(bytesToHex(f._debug.Ke)).toBe(v.Ke)
        expect(bytesToHex(f._debug.Ka)).toBe(v.Ka)
        expect(bytesToHex(f._debug.KcA)).toBe(v.KcA)
        expect(bytesToHex(f._debug.KcB)).toBe(v.KcB)
      }
      expect(bytesToHex(fa.confirm)).toBe(v['A conf'])
      expect(bytesToHex(fb.confirm)).toBe(v['B conf'])
      expect(fa.verifyPeer(hexToBytes(v['B conf']))).toBe(true)
      expect(fb.verifyPeer(hexToBytes(v['A conf']))).toBe(true)
    })
  })
})

describe('SPAKE2 그림 코드 사용', () => {
  const run = async (codeA, codeB, sessionId = 'sess-1') => {
    const a = spake2Start({ role: 'A', w: await derivePassword(codeA, sessionId) })
    const b = spake2Start({ role: 'B', w: await derivePassword(codeB, sessionId) })
    return { fa: await a.finish(b.message), fb: await b.finish(a.message) }
  }

  it('같은 비밀번호면 양쪽 Ke가 같고(확인 MAC 통과) 페이로드를 주고받는다', async () => {
    const { fa, fb } = await run([1, 2, 3, 4], [1, 2, 3, 4])
    expect(bytesToHex(fa._debug.Ke)).toBe(bytesToHex(fb._debug.Ke))
    expect(fb.verifyPeer(fa.confirm)).toBe(true)
    expect(fa.verifyPeer(fb.confirm)).toBe(true)
    const sealed = await fb.seal({ v: 1, secret: 'abc', ticket: 'pv1.x', name: '교실' })
    expect(await fa.open(sealed)).toEqual({ v: 1, secret: 'abc', ticket: 'pv1.x', name: '교실' })
  })

  it('다른 비밀번호면 확인 MAC이 실패하고 assertPeer는 예외, 페이로드도 못 연다', async () => {
    const { fa, fb } = await run([1, 2, 3, 4], [1, 2, 3, 5])
    expect(fb.verifyPeer(fa.confirm)).toBe(false)
    expect(fa.verifyPeer(fb.confirm)).toBe(false)
    expect(() => fb.assertPeer(fa.confirm)).toThrow('SPAKE2_CONFIRM_FAILED')
    const sealed = await fb.seal({ v: 1 })
    await expect(fa.open(sealed)).rejects.toThrow()
  })

  it('sessionId가 다르면 같은 그림이어도 비밀번호가 달라 실패한다', async () => {
    const a = spake2Start({ role: 'A', w: await derivePassword([1, 2, 3, 4], 's1') })
    const b = spake2Start({ role: 'B', w: await derivePassword([1, 2, 3, 4], 's2') })
    const fa = await a.finish(b.message)
    const fb = await b.finish(a.message)
    expect(fb.verifyPeer(fa.confirm)).toBe(false)
  })

  it('받은 점이 곡선 위가 아니거나 항등원이거나 형식이 틀리면 거부', async () => {
    const a = spake2Start({ role: 'A', w: 5n })
    const off = new Uint8Array(65)
    off[0] = 4
    off[64] = 1 // (0, 1)은 곡선 위가 아님
    await expect(a.finish(off)).rejects.toThrow('SPAKE2_BAD_POINT')
    await expect(a.finish(new Uint8Array(65))).rejects.toThrow('SPAKE2_BAD_POINT') // 접두사 0x00
    await expect(a.finish(new Uint8Array([0]))).rejects.toThrow('SPAKE2_BAD_POINT') // 항등원 표기
    await expect(a.finish(p256.Point.BASE.toBytes(true))).rejects.toThrow('SPAKE2_BAD_POINT') // 압축형 불가
    await expect(a.finish(new Uint8Array(10))).rejects.toThrow('SPAKE2_BAD_POINT')
    await expect(a.finish('x')).rejects.toThrow('SPAKE2_BAD_POINT')
  })

  it('상대 점이 w*N과 같아 K 계산이 항등원이 되면 거부', async () => {
    // pB = w*N 이면 pB - w*N = 0 이므로 K가 항등원
    const w = 7n
    const a = spake2Start({ role: 'A', w })
    const NN = p256.Point.fromBytes(hexToBytes('03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49'))
    await expect(a.finish(NN.multiply(w).toBytes(false))).rejects.toThrow('SPAKE2_BAD_POINT')
  })

  it('랜덤 왕복 20회: 같은 코드는 항상 성공, 한 그림만 달라도 항상 실패', async () => {
    for (let i = 0; i < 20; i++) {
      const code = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), (n) => n % 24)
      const sid = `s-${i}`
      const ok = await run(code, code, sid)
      expect(ok.fb.verifyPeer(ok.fa.confirm) && ok.fa.verifyPeer(ok.fb.confirm)).toBe(true)
      const wrong = [...code]
      wrong[3 - (i % 2)] = (wrong[3 - (i % 2)] + 1) % 24
      const bad = await run(code, wrong, sid)
      expect(bad.fb.verifyPeer(bad.fa.confirm)).toBe(false)
    }
  })

  it('비밀번호 입력 검증과 식별자 상수', async () => {
    await expect(derivePassword([1, 2, 3], 's')).rejects.toThrow('SPAKE2_BAD_CODE')
    await expect(derivePassword([1, 2, 3, 300], 's')).rejects.toThrow('SPAKE2_BAD_CODE')
    expect(ID_JOINER).toBe('cs-code-joiner')
    expect(ID_HOST).toBe('cs-code-host')
    const w1 = await derivePassword([1, 2, 3, 4], 's')
    const w2 = await derivePassword([1, 2, 3, 4], 's')
    expect(w1).toBe(w2)
    expect(w1 < p256.Point.Fn.ORDER).toBe(true)
  })
})
