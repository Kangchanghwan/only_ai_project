/**
 * Zip read/write for office packages (no dependencies).
 * Same central-directory reading as hwpZip.js, kept separate on purpose: sharing it would move hwpZip into a
 * shared chunk and change the main app's first-load files. Writing deflates every part
 * (CompressionStream 'deflate-raw'), because stored-only output would be several times larger
 * (the editor writes big styles parts).
 */
const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(u8) {
  let c = 0xffffffff
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function readZipEntries(u8) {
  const d = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (d.getUint32(i, true) === END_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip: no end of central directory')
  const count = d.getUint16(eocd + 10, true)
  const cdOffset = d.getUint32(eocd + 16, true)
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('zip64 is not supported')
  const entries = []
  const dec = new TextDecoder()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (d.getUint32(p, true) !== CENTRAL_SIG) throw new Error('zip: bad central directory')
    const nameLen = d.getUint16(p + 28, true)
    entries.push({
      name: dec.decode(u8.subarray(p + 46, p + 46 + nameLen)),
      method: d.getUint16(p + 10, true),
      csize: d.getUint32(p + 20, true),
      lho: d.getUint32(p + 42, true),
    })
    p += 46 + nameLen + d.getUint16(p + 30, true) + d.getUint16(p + 32, true)
  }
  return { entries }
}


async function pump(u8, stream) {
  const writer = stream.writable.getWriter()
  writer.write(u8)
  writer.close()
  const reader = stream.readable.getReader()
  const parts = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let p = 0
  for (const c of parts) { out.set(c, p); p += c.length }
  return out
}

export const inflateRaw = (u8) => pump(u8, new DecompressionStream('deflate-raw'))
export const deflateRaw = (u8) => pump(u8, new CompressionStream('deflate-raw'))

/** @returns {Promise<Map<string, Uint8Array>>} entry name -> bytes, in archive order (directories skipped) */
export async function readZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const { entries } = readZipEntries(u8)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const out = new Map()
  for (const e of entries) {
    if (e.name.endsWith('/')) continue
    if (dv.getUint32(e.lho, true) !== LOCAL_SIG) throw new Error('zip: bad local header')
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true)
    const raw = u8.subarray(start, start + e.csize)
    if (e.method === 0) out.set(e.name, raw.slice())
    else if (e.method === 8) out.set(e.name, await inflateRaw(raw))
    else throw new Error('zip: unsupported method ' + e.method)
  }
  return out
}

/** Write a deflated zip. [Content_Types].xml goes first (some readers expect it). */
export async function writeZip(files) {
  const enc = new TextEncoder()
  const names = [...files.keys()].sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0))
  const chunks = []
  const central = []
  let offset = 0
  for (const name of names) {
    const data = files.get(name)
    const nb = enc.encode(name)
    const comp = await deflateRaw(data)
    const crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, LOCAL_SIG, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 8, true)
    h.setUint16(10, 0, true); h.setUint16(12, (1 << 5) | 1, true) // 1980-01-01, deterministic
    h.setUint32(14, crc, true); h.setUint32(18, comp.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true)
    chunks.push(new Uint8Array(h.buffer), nb, comp)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, CENTRAL_SIG, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true)
    c.setUint16(12, 0, true); c.setUint16(14, (1 << 5) | 1, true)
    c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), nb)
    offset += 30 + nb.length + comp.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, END_SIG, true); end.setUint16(8, names.length, true); end.setUint16(10, names.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out
}
