import { b64u, fromB64u, randomBytes } from './lockCrypto.js'

const enc = new TextEncoder()
const dec = new TextDecoder()
const subtle = () => globalThis.crypto.subtle
const aad = (roomId) => {
  const p = enc.encode('cs-room-v1/text')
  const r = enc.encode(String(roomId))
  const out = new Uint8Array(p.length + r.length)
  out.set(p); out.set(r, p.length)
  return out
}

/** @returns {Promise<{v:1, iv:string, ct:string}>} */
export async function encryptText(encKey, roomId, plaintext) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(roomId) }, encKey, enc.encode(String(plaintext)))
  return { v: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) }
}

/** 실패(키·roomId 불일치, 변조, 형식 오류)하면 예외 */
export async function decryptText(encKey, roomId, e) {
  if (!e || e.v !== 1 || typeof e.iv !== 'string' || typeof e.ct !== 'string') throw new Error('PRIVATE_TEXT_BAD_FORMAT')
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(e.iv), additionalData: aad(roomId) }, encKey, fromB64u(e.ct))
  return dec.decode(pt)
}
