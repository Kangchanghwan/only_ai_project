/**
 * 압축 없이 묶기만 하는(stored) ZIP 작성 도구.
 *
 * 받으면서 바로 내보내기 위해 항목마다 데이터 서술자(general purpose bit 3)를 쓴다.
 * 로컬 머리글의 CRC·크기는 0으로 두고, 파일 바이트 뒤 서술자와 중앙 디렉터리에 실제 값을 적는다.
 * 묶음 한도(최대 500MB)가 4GB보다 훨씬 작아 Zip64는 쓰지 않는다.
 *
 * public/sw.js에도 같은 코드가 있다(서비스워커는 번들되지 않는다). 두 구현의 바이트 일치는
 * src/services/sw.zip.test.js가 검사한다. 한쪽을 고치면 다른 쪽도 같이 고친다.
 */

export const ZIP_MAX_BYTES = 0xffffffff - 1024 * 1024 // Zip64 없이 담을 수 있는 한도(여유 1MB)

const LOCAL_SIG = 0x04034b50
const DESCRIPTOR_SIG = 0x08074b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50
const FLAGS = 0x0008 | 0x0800 // 데이터 서술자 + UTF-8 이름
const VERSION = 20

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC32를 이어서 계산한다. 처음엔 crc=0 */
export function crc32(bytes, crc = 0) {
  let c = (crc ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Date → DOS 시각·날짜 (1980년 이전은 1980-01-01) */
export function dosDateTime(date = new Date()) {
  const y = date.getFullYear()
  if (y < 1980) return { time: 0, date: (1 << 5) | 1 }
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

const encoder = new TextEncoder()
export const encodeName = (name) => encoder.encode(name)

export function localHeader(nameBytes, dos) {
  const b = new Uint8Array(30 + nameBytes.length)
  const v = new DataView(b.buffer)
  v.setUint32(0, LOCAL_SIG, true)
  v.setUint16(4, VERSION, true)
  v.setUint16(6, FLAGS, true)
  v.setUint16(8, 0, true) // stored
  v.setUint16(10, dos.time, true)
  v.setUint16(12, dos.date, true)
  // 14~25: CRC·크기는 서술자에 적는다 (0)
  v.setUint16(26, nameBytes.length, true)
  v.setUint16(28, 0, true)
  b.set(nameBytes, 30)
  return b
}

export function dataDescriptor(crc, size) {
  const b = new Uint8Array(16)
  const v = new DataView(b.buffer)
  v.setUint32(0, DESCRIPTOR_SIG, true)
  v.setUint32(4, crc, true)
  v.setUint32(8, size, true)
  v.setUint32(12, size, true)
  return b
}

export function centralHeader(nameBytes, dos, crc, size, offset) {
  const b = new Uint8Array(46 + nameBytes.length)
  const v = new DataView(b.buffer)
  v.setUint32(0, CENTRAL_SIG, true)
  v.setUint16(4, VERSION, true) // made by
  v.setUint16(6, VERSION, true) // needed
  v.setUint16(8, FLAGS, true)
  v.setUint16(10, 0, true)
  v.setUint16(12, dos.time, true)
  v.setUint16(14, dos.date, true)
  v.setUint32(16, crc, true)
  v.setUint32(20, size, true)
  v.setUint32(24, size, true)
  v.setUint16(28, nameBytes.length, true)
  // 30 extra, 32 comment, 34 disk, 36 internal attr = 0
  v.setUint32(38, 0, true) // external attr
  v.setUint32(42, offset, true)
  b.set(nameBytes, 46)
  return b
}

export function endRecord(count, centralSize, centralOffset) {
  const b = new Uint8Array(22)
  const v = new DataView(b.buffer)
  v.setUint32(0, END_SIG, true)
  v.setUint16(8, count, true)
  v.setUint16(10, count, true)
  v.setUint32(12, centralSize, true)
  v.setUint32(16, centralOffset, true)
  return b
}

/** 완성될 ZIP의 전체 바이트 수. entries: [{ nameBytes, size }] */
export function zipSize(entries) {
  let total = 22
  for (const e of entries) total += 30 + e.nameBytes.length + e.size + 16 + 46 + e.nameBytes.length
  return total
}

/**
 * 항목 바이트(Uint8Array 조각 배열)로 ZIP 조각 배열을 만든다. 메모리 방식(아이폰 등)과 테스트에서 쓴다.
 * items: [{ name, chunks: Uint8Array[] }]
 */
export function buildZipParts(items, date = new Date()) {
  const dos = dosDateTime(date)
  const parts = []
  const central = []
  let offset = 0
  for (const item of items) {
    const nameBytes = encodeName(item.name)
    const head = localHeader(nameBytes, dos)
    let crc = 0
    let size = 0
    for (const c of item.chunks) { crc = crc32(c, crc); size += c.length }
    parts.push(head, ...item.chunks, dataDescriptor(crc, size))
    central.push(centralHeader(nameBytes, dos, crc, size, offset))
    offset += head.length + size + 16
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0)
  parts.push(...central, endRecord(items.length, centralSize, offset))
  return parts
}
