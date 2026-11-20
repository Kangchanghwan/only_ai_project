/**
 * 최소 OLE 복합 문서(CFB) 읽기: HWP 5.0 파일에서 최상위 스트림(PrvImage, PrvText 등)을 꺼낸다.
 * 읽기만 한다 (HWP는 다시 쓰지 않는다).
 */
const FREE = 0xffffffff
const END = 0xfffffffe

export function readCfbStreams(u8, wanted) {
  const d = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  if (d.getUint32(0, true) !== 0xe011cfd0 || d.getUint32(4, true) !== 0xe11ab1a1) throw new Error('CFB 아님')
  const shift = d.getUint16(30, true)
  const mshift = d.getUint16(32, true)
  const ssz = 1 << shift
  const mssz = 1 << mshift
  const cutoff = d.getUint32(56, true)
  const secOff = (i) => (i + 1) * ssz
  const sector = (i) => u8.subarray(secOff(i), secOff(i) + ssz)

  // FAT
  const difat = []
  for (let i = 0; i < 109; i++) { const v = d.getUint32(76 + i * 4, true); if (v !== FREE) difat.push(v) }
  let dsec = d.getUint32(68, true)
  for (let n = d.getUint32(72, true); n > 0 && dsec !== END && dsec !== FREE; n--) {
    const s = sector(dsec)
    const sd = new DataView(s.buffer, s.byteOffset, s.byteLength)
    for (let i = 0; i < ssz / 4 - 1; i++) { const v = sd.getUint32(i * 4, true); if (v !== FREE) difat.push(v) }
    dsec = sd.getUint32(ssz - 4, true)
  }
  const fat = []
  for (const s of difat) {
    const b = sector(s)
    const bd = new DataView(b.buffer, b.byteOffset, b.byteLength)
    for (let i = 0; i < ssz / 4; i++) fat.push(bd.getUint32(i * 4, true))
  }
  const chain = (start, table) => {
    const out = []
    for (let s = start, guard = 0; s !== END && s !== FREE && s < table.length && guard < table.length + 1; s = table[s], guard++) out.push(s)
    return out
  }
  const join = (parts, size) => {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
    let p = 0
    for (const x of parts) { out.set(x, p); p += x.length }
    return size != null ? out.subarray(0, size) : out
  }

  // 디렉터리
  const dir = join(chain(d.getUint32(48, true), fat).map(sector))
  const dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength)
  const entry = (i) => {
    const o = i * 128
    const nameLen = dd.getUint16(o + 64, true)
    let name = ''
    for (let k = 0; k < Math.max(0, nameLen - 2); k += 2) name += String.fromCharCode(dd.getUint16(o + k, true))
    return { name, type: dir[o + 66], left: dd.getUint32(o + 68, true), right: dd.getUint32(o + 72, true), child: dd.getUint32(o + 76, true), start: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) }
  }
  const root = entry(0)
  const found = new Map()
  const stack = [root.child]
  const seen = new Set()
  while (stack.length) {
    const i = stack.pop()
    if (i === FREE || seen.has(i) || i * 128 >= dir.length) continue
    seen.add(i)
    const e = entry(i)
    if (e.type === 2) found.set(e.name, e)
    stack.push(e.left, e.right)
  }

  // 미니 스트림
  let mini = null
  let miniFat = null
  const loadMini = () => {
    if (mini) return
    mini = join(chain(root.start, fat).map(sector), root.size)
    const mf = join(chain(d.getUint32(60, true), fat).map(sector))
    const md = new DataView(mf.buffer, mf.byteOffset, mf.byteLength)
    miniFat = []
    for (let i = 0; i < mf.length / 4; i++) miniFat.push(md.getUint32(i * 4, true))
  }

  const out = new Map()
  for (const name of wanted) {
    const e = found.get(name)
    if (!e) continue
    if (e.size < cutoff) {
      loadMini()
      out.set(name, join(chain(e.start, miniFat).map((s) => mini.subarray(s * mssz, s * mssz + mssz)), e.size))
    } else {
      out.set(name, join(chain(e.start, fat).map(sector), e.size))
    }
  }
  return out
}
