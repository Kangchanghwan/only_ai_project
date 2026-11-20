/**
 * 한글 파일 안에 들어 있는 미리보기(엔진 없이): HWPX는 Preview/PrvImage.png·PrvText.txt, HWP 5.0은 PrvImage·PrvText 스트림.
 */
import { readZipEntries, readZipEntry } from './hwpZip.js'
import { readCfbStreams } from './hwpCfb.js'

const sniffImage = (b) => {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b.length > 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  return null
}

function decodeText(b) {
  if (!b || !b.length) return ''
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  return new TextDecoder('utf-8').decode(b)
}

/** @returns {Promise<{kind:'hwpx'|'hwp'|null, image:Blob|null, text:string}>} */
export async function extractPreview(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const { entries } = readZipEntries(u8)
      const find = (n) => entries.find((e) => e.name.toLowerCase() === n)
      const img = find('preview/prvimage.png') || entries.find((e) => /^preview\/prvimage\./i.test(e.name))
      const txt = find('preview/prvtext.txt')
      const ib = img ? await readZipEntry(u8, img) : null
      const type = ib && sniffImage(ib)
      return { kind: 'hwpx', image: type ? new Blob([ib], { type }) : null, text: txt ? decodeText(await readZipEntry(u8, txt)) : '' }
    }
    if (u8[0] === 0xd0 && u8[1] === 0xcf) {
      const m = readCfbStreams(u8, ['PrvImage', 'PrvText'])
      const ib = m.get('PrvImage')
      const type = ib && sniffImage(ib)
      const tb = m.get('PrvText')
      return { kind: 'hwp', image: type ? new Blob([ib], { type }) : null, text: tb ? new TextDecoder('utf-16le').decode(tb) : '' }
    }
  } catch {
    /* 미리보기를 읽지 못하면 없는 것으로 */
  }
  return { kind: null, image: null, text: '' }
}
