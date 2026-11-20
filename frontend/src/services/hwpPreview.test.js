import { describe, it, expect } from 'vitest'
import { crc32, readZipEntries, readZipEntry, replaceZipEntries } from './hwpZip.js'
import { readCfbStreams } from './hwpCfb.js'
import { extractPreview } from './hwpPreview.js'
import { editedName, isEditedHwp, validateUpload } from './hwpFiles.js'
import { isPhone } from '../utils/isPhone.js'

const enc = (s) => new TextEncoder().encode(s)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

/** 테스트용 zip 만들기 (모두 stored) */
function buildZip(files) {
  const parts = []
  const cds = []
  let off = 0
  for (const [name, data] of files) {
    const nb = enc(name)
    const h = new Uint8Array(30 + nb.length)
    const hd = new DataView(h.buffer)
    hd.setUint32(0, 0x04034b50, true); hd.setUint16(4, 20, true)
    hd.setUint32(14, crc32(data), true); hd.setUint32(18, data.length, true); hd.setUint32(22, data.length, true)
    hd.setUint16(26, nb.length, true); h.set(nb, 30)
    const c = new Uint8Array(46 + nb.length)
    const cd = new DataView(c.buffer)
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true)
    cd.setUint32(16, crc32(data), true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true)
    cd.setUint16(28, nb.length, true); cd.setUint32(42, off, true); c.set(nb, 46)
    parts.push(h, data); cds.push(c); off += h.length + data.length
  }
  const cdStart = off
  for (const c of cds) { parts.push(c); off += c.length }
  const t = new Uint8Array(22)
  const td = new DataView(t.buffer)
  td.setUint32(0, 0x06054b50, true); td.setUint16(8, files.length, true); td.setUint16(10, files.length, true)
  td.setUint32(12, off - cdStart, true); td.setUint32(16, cdStart, true)
  parts.push(t)
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let p = 0
  for (const x of parts) { out.set(x, p); p += x.length }
  return out
}

describe('zip: 읽기와 부분 교체', () => {
  const zip = buildZip([['mimetype', enc('application/hwp+zip')], ['Contents/section0.xml', enc('<a>내용</a>')], ['Preview/PrvImage.png', PNG], ['Preview/PrvText.txt', enc('옛 글')]])
  it('미리보기 추출', async () => {
    const p = await extractPreview(zip)
    expect(p.kind).toBe('hwpx')
    expect(p.image.type).toBe('image/png')
    expect(p.text).toBe('옛 글')
  })
  it('지정한 항목만 바뀌고 나머지는 원본 바이트 그대로', async () => {
    const out = replaceZipEntries(zip, new Map([['Preview/PrvText.txt', enc('새 글')]]))
    const a = readZipEntries(zip).entries
    const b = readZipEntries(out).entries
    expect(b.map((e) => e.name)).toEqual(a.map((e) => e.name))
    expect(new TextDecoder().decode(await readZipEntry(out, b[3]))).toBe('새 글')
    for (const i of [0, 1, 2]) {
      expect(Array.from(await readZipEntry(out, b[i]))).toEqual(Array.from(await readZipEntry(zip, a[i])))
    }
  })
  it('없는 항목은 끝에 추가', async () => {
    const small = buildZip([['mimetype', enc('x')]])
    const out = replaceZipEntries(small, new Map([['Preview/PrvText.txt', enc('hi')]]))
    const es = readZipEntries(out).entries
    expect(es.map((e) => e.name)).toEqual(['mimetype', 'Preview/PrvText.txt'])
    expect(new TextDecoder().decode(await readZipEntry(out, es[1]))).toBe('hi')
  })
})

/** 테스트용 CFB: PrvImage(일반 섹터 4096B) + PrvText(미니 스트림) */
function buildCfb(image, textU16) {
  const S = 512
  const buf = new Uint8Array(S * (1 + 4 + 8))
  const d = new DataView(buf.buffer)
  const FREE = 0xffffffff, END = 0xfffffffe
  buf.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0)
  d.setUint16(24, 0x3e, true); d.setUint16(26, 3, true); d.setUint16(28, 0xfffe, true); d.setUint16(30, 9, true); d.setUint16(32, 6, true)
  d.setUint32(44, 1, true); d.setUint32(48, 1, true); d.setUint32(56, 4096, true); d.setUint32(60, 2, true); d.setUint32(64, 1, true)
  d.setUint32(68, END, true); d.setUint32(72, 0, true)
  for (let i = 0; i < 109; i++) d.setUint32(76 + i * 4, i === 0 ? 0 : FREE, true)
  const sec = (i) => (i + 1) * S
  // FAT (섹터 0)
  const fat = new Array(128).fill(FREE)
  fat[0] = 0xfffffffd; fat[1] = END; fat[2] = END; fat[3] = END
  for (let i = 4; i < 11; i++) fat[i] = i + 1
  fat[11] = END
  fat.forEach((v, i) => d.setUint32(sec(0) + i * 4, v, true))
  // 디렉터리 (섹터 1)
  const ent = (i, name, type, left, right, child, start, size) => {
    const o = sec(1) + i * 128
    for (let k = 0; k < name.length; k++) d.setUint16(o + k * 2, name.charCodeAt(k), true)
    d.setUint16(o + 64, (name.length + 1) * 2, true); buf[o + 66] = type
    d.setUint32(o + 68, left, true); d.setUint32(o + 72, right, true); d.setUint32(o + 76, child, true)
    d.setUint32(o + 116, start, true); d.setUint32(o + 120, size, true)
  }
  ent(0, 'Root Entry', 5, FREE, FREE, 1, 3, 64)
  ent(1, 'PrvImage', 2, FREE, 2, FREE, 4, 4096)
  ent(2, 'PrvText', 2, FREE, FREE, FREE, 0, textU16.length)
  // 미니 FAT (섹터 2): 미니 섹터 0 하나
  const mf = new Array(128).fill(FREE); mf[0] = END
  mf.forEach((v, i) => d.setUint32(sec(2) + i * 4, v, true))
  buf.set(textU16, sec(3)) // 미니 스트림 컨테이너
  buf.set(image, sec(4))
  return buf
}

describe('CFB(HWP 5.0) 미리보기 스트림', () => {
  const text = 'HWP 글'
  const u16 = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) new DataView(u16.buffer).setUint16(i * 2, text.charCodeAt(i), true)
  const img = new Uint8Array(4096); img.set(PNG, 0)
  const cfb = buildCfb(img, u16)
  it('일반 스트림과 미니 스트림을 읽는다', () => {
    const m = readCfbStreams(cfb, ['PrvImage', 'PrvText'])
    expect(m.get('PrvImage').length).toBe(4096)
    expect(Array.from(m.get('PrvImage').subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(m.get('PrvText').length).toBe(u16.length)
  })
  it('extractPreview: 그림은 PNG, 글은 UTF-16LE', async () => {
    const p = await extractPreview(cfb)
    expect(p.kind).toBe('hwp')
    expect(p.image.type).toBe('image/png')
    expect(p.text).toBe(text)
  })
})

describe('이름·검증 규칙', () => {
  it('겹치지 않으면 그대로, 겹치면 " (수정)"', () => {
    expect(editedName('a.hwp', ['b.hwp'])).toBe('a.hwp')
    expect(editedName('보고서.hwpx', ['보고서.hwpx'])).toBe('보고서 (수정).hwpx')
  })
  it('서버가 정리한 이름 기준으로 겹침을 본다', () => {
    expect(editedName('my doc.hwp', ['my_doc.hwp'])).toBe('my doc (수정).hwp')
  })
  it('(수정)도 있으면 번호, 대소문자 무시', () => {
    expect(editedName('a.hwp', ['a.hwp', 'a (수정).hwp'])).toBe('a (수정 2).hwp')
    expect(editedName('A.HWP', ['a.hwp'])).toBe('A (수정).HWP')
  })
  it('수정해서 올린 hwp만 옛 미리보기를 건너뛴다', () => {
    expect(isEditedHwp('a (수정).hwp')).toBe(true)
    expect(isEditedHwp('a (수정 2).hwp')).toBe(true)
    expect(isEditedHwp('a (수정).hwpx')).toBe(false)
    expect(isEditedHwp('a.hwp')).toBe(false)
  })
  it('올리기 검증: 확장자, 빈 파일, 크기', () => {
    const f = (name, size) => ({ name, size })
    expect(validateUpload(f('a.hwpx', 10), { maxBytes: 100 }).ok).toBe(true)
    expect(validateUpload(f('a.exe', 10), { maxBytes: 100 }).reason).toBe('extension')
    expect(validateUpload(f('a.hwp', 0), { maxBytes: 100 }).reason).toBe('empty')
    expect(validateUpload(f('a.hwp', 101), { maxBytes: 100 }).reason).toBe('size')
  })
})

describe('isPhone', () => {
  const w = (coarse, sw, sh) => ({ matchMedia: () => ({ matches: coarse }), screen: { width: sw, height: sh } })
  it('터치 + 짧은 변 600 미만만 폰', () => {
    expect(isPhone(w(true, 390, 844))).toBe(true)
    expect(isPhone(w(true, 844, 390))).toBe(true)
    expect(isPhone(w(true, 820, 1180))).toBe(false)
    expect(isPhone(w(false, 390, 844))).toBe(false)
    expect(isPhone(w(false, 1440, 900))).toBe(false)
  })
})
