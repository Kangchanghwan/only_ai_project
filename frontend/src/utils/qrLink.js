/**
 * @file qrLink.js
 * @description 빈 화면 QR(#/qc?...)로 다른 네트워크의 휴대폰을 PC와 방으로 잇는 데 쓰는 값.
 * 규격: docs/superpowers/specs/2026-11-25-qr-picture-code-design.md
 *
 * - QR의 # 뒤: s(PC 소켓 ID), k(이름표 키), g(회차), x(회차 비밀 16B), f(회차 키 지문 16B)
 * - x는 # 뒤라 서버로 가지 않는다. index.html이 GA보다 먼저 주소에서 지운다.
 * - 휴대폰은 연결 요청의 pk 뒤에 회차와 증명(HMAC(x, 휴대폰 pk))을 붙인다: `<pk>~<g>~<증명>`
 * - PC는 증명을, 휴대폰은 받은 PC 키의 지문을 확인한다. 그래서 그림 비교 없이도 키 바꿔치기를 막는다.
 * - 방 탭에서 띄운 QR은 방 꼬리표 r(HMAC(x, 방 ID) 앞 8바이트)을 더 담는다. 방 ID 원문은 QR에 넣지 않는다.
 *   휴대폰은 자기가 가진 방마다 같은 값을 계산해 맞는 방이 있으면 그 방을 연다.
 */
import { b64u, fromB64u } from './lockCrypto.js'

export const QR_HASH_PREFIX = '#/qc?'
/** 회차 교체 주기 */
export const QR_ROTATE_MS = 5 * 60 * 1000
/** 회차가 받아들여지는 최대 시간 (지금 + 직전 회차) */
export const QR_MAX_AGE_MS = 10 * 60 * 1000
/** PC가 동시에 받는 QR 요청 수 */
export const QR_MAX_PENDING = 3

const enc = new TextEncoder()
const subtle = () => globalThis.crypto.subtle
const B64U_RE = /^[A-Za-z0-9_-]+$/
const SOCKET_RE = /^[A-Za-z0-9_-]{1,64}$/
const KEY_RE = /^\d{1,4}-\d{1,4}-\d{1,6}$/
const GEN_RE = /^[A-Za-z0-9_-]{6}$/
const TAG_RE = /^[A-Za-z0-9_-]{11}$/

const b16 = (s) => {
  if (typeof s !== 'string' || !B64U_RE.test(s)) return null
  try {
    const b = fromB64u(s)
    return b.length === 16 ? b : null
  } catch { return null }
}

/**
 * @param {string} base QR이 가리키는 주소 (utm 포함)
 * @param {{ s: string, k?: string|null, g: string, x: Uint8Array, f: string, r?: string|null }} p
 */
export function buildQrLink(base, { s, k, g, x, f, r }) {
  const q = new URLSearchParams()
  q.set('s', s)
  if (k) q.set('k', k)
  q.set('g', g)
  q.set('x', b64u(x))
  q.set('f', f)
  if (r) q.set('r', r)
  return `${String(base).split('#')[0]}${QR_HASH_PREFIX}${q.toString()}`
}

/** @returns {{ s: string, k: string|null, g: string, x: Uint8Array, f: string, r: string|null } | null} */
export function parseQrLink(hash) {
  try {
    if (typeof hash !== 'string' || !hash.startsWith(QR_HASH_PREFIX)) return null
    const q = new URLSearchParams(hash.slice(QR_HASH_PREFIX.length))
    const s = q.get('s')
    const k = q.get('k')
    const g = q.get('g')
    const x = b16(q.get('x'))
    const f = q.get('f')
    const r = q.get('r')
    if (!s || !SOCKET_RE.test(s) || !g || !GEN_RE.test(g) || !x || !b16(f)) return null
    return { s, k: k && KEY_RE.test(k) ? k : null, g, x, f, r: r && TAG_RE.test(r) ? r : null }
  } catch { return null }
}

/** 이름표 키(adj-animal-suffix) → identity 객체 (없거나 형식이 틀리면 null) */
export function identityFromKey(k) {
  if (typeof k !== 'string' || !KEY_RE.test(k)) return null
  const [adj, animal, suffix] = k.split('-').map((n) => parseInt(n, 10))
  return { adj, animal, suffix }
}

export const newGenId = () => b64u(globalThis.crypto.getRandomValues(new Uint8Array(4)))

/** 공개키(base64url) 지문 = SHA-256 앞 16바이트 */
export async function keyFingerprint(pk) {
  const h = new Uint8Array(await subtle().digest('SHA-256', fromB64u(pk)))
  return b64u(h.slice(0, 16))
}

/** 증명 = HMAC-SHA256(회차 비밀, "cs-qr-v1|g|pk") 앞 16바이트 */
export async function qrProof(secret, g, pk) {
  const key = await subtle().importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await subtle().sign('HMAC', key, enc.encode(`cs-qr-v1|${g}|${pk}`)))
  return b64u(mac.slice(0, 16))
}

/** 방 꼬리표 = HMAC-SHA256(회차 비밀, "cs-qr-room-v1|방 ID") 앞 8바이트 (base64url 11자) */
export async function roomTag(secret, roomId) {
  const key = await subtle().importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await subtle().sign('HMAC', key, enc.encode(`cs-qr-room-v1|${roomId}`)))
  return b64u(mac.slice(0, 8))
}

/** 길이가 같은 두 문자열을 시간 차 없이 비교한다 */
export function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export const packQrPk = (pk, g, proof) => `${pk}~${g}~${proof}`

/** @returns {{ pk: string, g: string, proof: string } | null} QR 증명이 붙은 pk가 아니면 null */
export function unpackQrPk(v) {
  if (typeof v !== 'string') return null
  const parts = v.split('~')
  if (parts.length !== 3) return null
  const [pk, g, proof] = parts
  if (!B64U_RE.test(pk) || !GEN_RE.test(g) || !b16(proof)) return null
  return { pk, g, proof }
}
