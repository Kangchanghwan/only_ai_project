/**
 * SPAKE2 (RFC 9382) P256-SHA256-HKDF-HMAC. 그림 코드 입장용.
 * 규격: docs/superpowers/specs/2026-11-12-picture-code-design.md
 *
 * 이 모듈은 그림 코드를 쓸 때만 동적 import 한다(첫 화면 번들에 넣지 않는다).
 * - 그룹 P-256(h=1), 해시 SHA-256, KDF HKDF-SHA256, MAC HMAC-SHA256, M·N은 RFC 9382 6장의 P-256 상수
 * - A = 들어오는 쪽(joiner), B = 호스트
 * - Ke(16바이트) → HKDF(info "cs-code-v1/wrap") → AES-GCM 키(비추출)로 페이로드를 감싼다
 * 비밀(w, x, K, Ke, Kc*)은 이 모듈 밖으로 내보내지 않는다. 테스트용 후크(x 고정, 중간값 반환)만 있다.
 */
import { p256 } from '@noble/curves/nist.js'
import { b64u, fromB64u } from './lockCrypto.js'

const Point = p256.Point
const N = Point.Fn.ORDER
const enc = new TextEncoder()
const subtle = () => globalThis.crypto.subtle

export const ID_JOINER = 'cs-code-joiner'
export const ID_HOST = 'cs-code-host'
const AAD_PAYLOAD = enc.encode('cs-code-v1/payload')
const WRAP_INFO = enc.encode('cs-code-v1/wrap')

/** RFC 9382 6장, P-256용 M·N (압축 SEC1) */
const M = Point.fromBytes(hexToBytes('02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f'))
const NN = Point.fromBytes(hexToBytes('03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49'))

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}
export const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0))
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
const bigToBytes = (n, len) => hexToBytes(n.toString(16).padStart(len * 2, '0'))
const bytesToBig = (b) => BigInt('0x' + (bytesToHex(b) || '0'))
const lenLE8 = (n) => {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true)
  return b
}
const lp = (bytes) => concat(lenLE8(bytes.length), bytes)

async function sha256(data) {
  return new Uint8Array(await subtle().digest('SHA-256', data))
}
async function hmac(keyBytes, data) {
  const k = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await subtle().sign('HMAC', k, data))
}
async function hkdfBits(ikm, info, bits) {
  const k = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  // salt가 nil이면 길이 0 (RFC 5869: 해시 길이의 0으로 간주)
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, k, bits))
}
function ctEqual(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

/**
 * 그림 코드 → SPAKE2 비밀번호 w (정수).
 * w = SHA-256("cs-code-v1" || 그림 인덱스 4바이트 || sessionId UTF-8) mod n
 * RFC의 MHF 자리에 느린 해시를 쓰지 않는다: 이 코드는 온라인 시도만 가능하다(서버가 틀린 횟수를 세고
 * 잠그며, 5분 안에 만료되고, 세션마다 sessionId가 달라 미리 계산해 둘 수 없다). 오프라인 추측은 SPAKE2가 막는다.
 * @param {number[]} code 0..23 정수 4개
 * @param {string} sessionId
 */
export async function derivePassword(code, sessionId) {
  if (!Array.isArray(code) || code.length !== 4 || code.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) {
    throw new Error('SPAKE2_BAD_CODE')
  }
  const h = await sha256(concat(enc.encode('cs-code-v1'), Uint8Array.from(code), enc.encode(String(sessionId))))
  return bytesToBig(h) % N
}

function randomScalar() {
  // 48바이트를 [1, n-1]로 접어 편향을 무시할 수 있게 한다
  const r = bytesToBig(globalThis.crypto.getRandomValues(new Uint8Array(48)))
  return (r % (N - 1n)) + 1n
}

const mulOrZero = (P, k) => (k === 0n ? Point.ZERO : P.multiply(k))

function parsePeerPoint(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 65 || bytes[0] !== 4) throw new Error('SPAKE2_BAD_POINT')
  let P
  try {
    P = Point.fromBytes(bytes) // 곡선 위의 점인지 검사(아니면 예외)
  } catch {
    throw new Error('SPAKE2_BAD_POINT')
  }
  if (P.is0()) throw new Error('SPAKE2_BAD_POINT')
  return P
}

/**
 * SPAKE2 한쪽을 시작한다.
 * @param {{role: 'A'|'B', w: bigint, idA?: string, idB?: string, x?: bigint}} p x는 테스트 벡터 재현용(운영에서는 생략)
 * @returns {{message: Uint8Array, finish: (peerMessage: Uint8Array) => Promise<object>}}
 */
export function spake2Start({ role, w, idA = ID_JOINER, idB = ID_HOST, x }) {
  if (role !== 'A' && role !== 'B') throw new Error('SPAKE2_BAD_ROLE')
  if (typeof w !== 'bigint' || w < 0n || w >= N) throw new Error('SPAKE2_BAD_W')
  const mine = x ?? randomScalar()
  const myBlind = role === 'A' ? M : NN
  const peerBlind = role === 'A' ? NN : M
  const ownPoint = Point.BASE.multiply(mine).add(mulOrZero(myBlind, w))
  const message = ownPoint.toBytes(false)

  async function finish(peerMessage) {
    const peerPoint = parsePeerPoint(peerMessage)
    const diff = peerPoint.subtract(mulOrZero(peerBlind, w))
    if (diff.is0()) throw new Error('SPAKE2_BAD_POINT')
    const K = diff.multiply(mine) // h = 1 (P-256은 보조인자 1)
    const Kbytes = K.toBytes(false)
    const pA = role === 'A' ? message : peerMessage
    const pB = role === 'A' ? peerMessage : message
    const TT = concat(lp(enc.encode(idA)), lp(enc.encode(idB)), lp(pA), lp(pB), lp(Kbytes), lp(bigToBytes(w, 32)))
    const hashTT = await sha256(TT)
    const Ke = hashTT.slice(0, 16)
    const Ka = hashTT.slice(16)
    const kc = await hkdfBits(Ka, enc.encode('ConfirmationKeys'), 256)
    const KcA = kc.slice(0, 16)
    const KcB = kc.slice(16)
    const myKc = role === 'A' ? KcA : KcB
    const peerKc = role === 'A' ? KcB : KcA
    const myConfirm = await hmac(myKc, TT)
    const expectedPeer = await hmac(peerKc, TT)
    let wrapKey = null
    const getWrapKey = async () => {
      if (!wrapKey) {
        const bits = await hkdfBits(Ke, WRAP_INFO, 256)
        wrapKey = await subtle().importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt'])
      }
      return wrapKey
    }
    return {
      /** 내가 상대에게 보낼 확인 MAC (A는 cA, B는 cB) */
      confirm: myConfirm,
      /** 상대의 확인 MAC 검증. 다르면 false */
      verifyPeer: (mac) => mac instanceof Uint8Array && ctEqual(mac, expectedPeer),
      /** 상대 확인이 틀리면 예외 */
      assertPeer(mac) {
        if (!(mac instanceof Uint8Array) || !ctEqual(mac, expectedPeer)) throw new Error('SPAKE2_CONFIRM_FAILED')
      },
      /** 페이로드(JSON 객체)를 AES-GCM으로 감싼다 → {iv, ct} (base64url) */
      async seal(obj) {
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
        const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD_PAYLOAD }, await getWrapKey(), enc.encode(JSON.stringify(obj)))
        return { iv: b64u(iv), ct: b64u(new Uint8Array(ct)) }
      },
      /** seal의 반대. 실패하면 예외 */
      async open({ iv, ct }) {
        const raw = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: AAD_PAYLOAD }, await getWrapKey(), fromB64u(ct))
        return JSON.parse(new TextDecoder().decode(raw))
      },
      /** 테스트 전용: 중간값 (RFC 벡터 대조). 운영 코드는 쓰지 않는다 */
      _debug: { K: Kbytes, TT, hashTT, Ke, Ka, KcA, KcB, pA, pB }
    }
  }

  return { message, finish }
}
