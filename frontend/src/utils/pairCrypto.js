/**
 * 1:1 연결 암호. 규격: docs/superpowers/specs/2026-10-15-private-pair-rooms-design.md
 * ECDH P-256 1회용 키 → k_wrap(roomSecret 전달) + sas(확인 그림 4개).
 */
import { b64u, fromB64u, randomBytes, deriveLockFromMaster } from './lockCrypto.js'

const enc = new TextEncoder()
const subtle = () => globalThis.crypto.subtle
const AAD_SECRET = enc.encode('cs-pair-v1/secret')
const empty = new Uint8Array(0)

/** @returns {Promise<{privateKey: CryptoKey, publicRaw: string}>} publicRaw = base64url(65B) */
export async function generateEphemeral() {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey))
  return { privateKey: kp.privateKey, publicRaw: b64u(raw) }
}

function cmpBytes(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0))
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

/**
 * @param {{privateKey: CryptoKey, myPk: string, peerPk: string, sessionId: string}} p pk는 base64url
 * @returns {Promise<{kWrap: CryptoKey, sas: number[]}>} sas = 0..63 인덱스 4개
 */
export async function deriveSession({ privateKey, myPk, peerPk, sessionId }) {
  const mine = fromB64u(myPk)
  const theirs = fromB64u(peerPk)
  if (theirs.length !== 65 || theirs[0] !== 4) throw new Error('PAIR_BAD_PK')
  const peerKey = await subtle().importKey('raw', theirs, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const [a, b] = cmpBytes(mine, theirs) <= 0 ? [mine, theirs] : [theirs, mine]
  const transcript = concat(enc.encode(String(sessionId)), a, b)
  const salt = new Uint8Array(await subtle().digest('SHA-256', transcript))
  const z = await subtle().deriveBits({ name: 'ECDH', public: peerKey }, privateKey, 256)
  const hkdf = await subtle().importKey('raw', z, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const kWrap = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('cs-pair-v1/wrap') },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
  const sasBytes = new Uint8Array(
    await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('cs-pair-v1/sas') }, hkdf, 24)
  )
  const v = (sasBytes[0] << 16) | (sasBytes[1] << 8) | sasBytes[2]
  const sas = [(v >> 18) & 63, (v >> 12) & 63, (v >> 6) & 63, v & 63]
  return { kWrap, sas }
}

export const newRoomSecret = () => randomBytes(32)

/** @returns {Promise<{iv: string, ct: string}>} */
export async function wrapSecret(kWrap, secret32) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD_SECRET }, kWrap, secret32)
  return { iv: b64u(iv), ct: b64u(new Uint8Array(ct)) }
}

/** @returns {Promise<Uint8Array>} 실패하면 예외 */
export async function unwrapSecret(kWrap, { iv, ct }) {
  const raw = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: AAD_SECRET }, kWrap, fromB64u(ct))
  const out = new Uint8Array(raw)
  if (out.length !== 32) throw new Error('PAIR_BAD_SECRET')
  return out
}

async function hkdfBits(secret, salt, info, bits) {
  const k = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, k, bits))
}

/**
 * 방 비밀 → 기존 잠금 규격 {salt, encKey, verifier, vh}
 * @param {Uint8Array} roomSecretBytes
 * @param {string} roomId
 */
export async function deriveRoomLock(roomSecretBytes, roomId) {
  const master = await hkdfBits(roomSecretBytes, enc.encode(roomId), 'cs-room-v1/master', 256)
  const salt16 = await hkdfBits(roomSecretBytes, empty, 'cs-room-v1/salt', 128)
  return deriveLockFromMaster(master, b64u(salt16))
}
