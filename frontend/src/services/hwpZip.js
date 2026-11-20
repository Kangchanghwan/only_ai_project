/**
 * 최소 zip 읽기/부분 교체 (HWPX용, 의존성 없음).
 * - readZipEntries: 중앙 디렉터리 읽기
 * - readZipEntry: 항목 내용 (stored / deflate-raw)
 * - replaceZipEntries: 지정한 항목만 stored로 바꿔 쓰고, 나머지 항목은 원본 바이트 그대로 복사한다
 *   (압축 방식, 데이터 디스크립터 포함). zip64는 지원하지 않는다.
 */
const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LOCAL = 0x04034b50

const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength)

let TABLE = null
export function crc32(u8) {
  if (!TABLE) {
    TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function readZipEntries(u8) {
  const d = dv(u8)
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (d.getUint32(i, true) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip: EOCD 없음')
  const count = d.getUint16(eocd + 10, true)
  const cdSize = d.getUint32(eocd + 12, true)
  const cdOffset = d.getUint32(eocd + 16, true)
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('zip64 미지원')
  const entries = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (d.getUint32(p, true) !== SIG_CD) throw new Error('zip: 중앙 디렉터리 손상')
    const nameLen = d.getUint16(p + 28, true)
    const extraLen = d.getUint16(p + 30, true)
    const commentLen = d.getUint16(p + 32, true)
    entries.push({
      name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen)),
      flags: d.getUint16(p + 8, true),
      method: d.getUint16(p + 10, true),
      crc: d.getUint32(p + 16, true),
      csize: d.getUint32(p + 20, true),
      usize: d.getUint32(p + 24, true),
      lho: d.getUint32(p + 42, true),
      cdPos: p,
      cdLen: 46 + nameLen + extraLen + commentLen,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { entries, cdOffset, cdSize, eocd }
}

export async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw')
  const out = new Blob([u8]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function readZipEntry(u8, e) {
  const d = dv(u8)
  if (d.getUint32(e.lho, true) !== SIG_LOCAL) throw new Error('zip: 로컬 헤더 손상')
  const start = e.lho + 30 + d.getUint16(e.lho + 26, true) + d.getUint16(e.lho + 28, true)
  const raw = u8.subarray(start, start + e.csize)
  if (e.method === 0) return raw
  if (e.method === 8) return inflateRaw(raw)
  throw new Error('zip: 지원하지 않는 압축 방식 ' + e.method)
}

const enc = (s) => new TextEncoder().encode(s)

/** @param {Map<string, Uint8Array>} repl 항목 이름 -> 새 내용 (없는 이름은 끝에 새로 추가) */
export function replaceZipEntries(u8, repl) {
  const { entries, cdOffset, eocd } = readZipEntries(u8)
  const d = dv(u8)
  const sorted = [...entries].sort((a, b) => a.lho - b.lho)
  const chunks = []
  let offset = 0
  const cdRecords = new Map() // entry -> Uint8Array
  const add = (bytes) => { chunks.push(bytes); offset += bytes.length }

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const end = i + 1 < sorted.length ? sorted[i + 1].lho : cdOffset
    const rec = u8.slice(e.cdPos, e.cdPos + e.cdLen)
    const rd = dv(rec)
    const newData = repl.get(e.name)
    const lho = offset
    if (newData) {
      const nameLen = d.getUint16(e.lho + 26, true)
      const name = u8.subarray(e.lho + 30, e.lho + 30 + nameLen)
      const crc = crc32(newData)
      const h = new Uint8Array(30 + nameLen)
      const hd = dv(h)
      hd.setUint32(0, SIG_LOCAL, true); hd.setUint16(4, 20, true); hd.setUint16(6, 0, true); hd.setUint16(8, 0, true)
      hd.setUint16(10, d.getUint16(e.lho + 10, true), true); hd.setUint16(12, d.getUint16(e.lho + 12, true), true)
      hd.setUint32(14, crc, true); hd.setUint32(18, newData.length, true); hd.setUint32(22, newData.length, true)
      hd.setUint16(26, nameLen, true); hd.setUint16(28, 0, true)
      h.set(name, 30)
      add(h); add(newData)
      rd.setUint16(8, 0, true); rd.setUint16(10, 0, true)
      rd.setUint32(16, crc, true); rd.setUint32(20, newData.length, true); rd.setUint32(24, newData.length, true)
    } else {
      add(u8.subarray(e.lho, end)) // 원본 바이트 그대로
    }
    rd.setUint32(42, lho, true)
    cdRecords.set(e, rec)
  }

  const existing = new Set(entries.map((e) => e.name))
  const extra = []
  for (const [name, data] of repl) {
    if (existing.has(name)) continue
    const nb = enc(name)
    const crc = crc32(data)
    const lho = offset
    const h = new Uint8Array(30 + nb.length)
    const hd = dv(h)
    hd.setUint32(0, SIG_LOCAL, true); hd.setUint16(4, 20, true); hd.setUint16(6, 0x0800, true); hd.setUint16(8, 0, true)
    hd.setUint32(14, crc, true); hd.setUint32(18, data.length, true); hd.setUint32(22, data.length, true); hd.setUint16(26, nb.length, true)
    h.set(nb, 30)
    add(h); add(data)
    const c = new Uint8Array(46 + nb.length)
    const cd = dv(c)
    cd.setUint32(0, SIG_CD, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true)
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nb.length, true)
    cd.setUint32(42, lho, true)
    c.set(nb, 46)
    extra.push(c)
  }

  const cdStart = offset
  for (const e of entries) add(cdRecords.get(e))
  for (const c of extra) add(c)
  const cdSize = offset - cdStart
  const comment = u8.subarray(eocd + 22, eocd + 22 + d.getUint16(eocd + 20, true))
  const tail = new Uint8Array(22 + comment.length)
  const td = dv(tail)
  const total = entries.length + extra.length
  td.setUint32(0, SIG_EOCD, true); td.setUint16(8, total, true); td.setUint16(10, total, true)
  td.setUint32(12, cdSize, true); td.setUint32(16, cdStart, true); td.setUint16(20, comment.length, true)
  tail.set(comment, 22)
  add(tail)

  const out = new Uint8Array(offset)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}
