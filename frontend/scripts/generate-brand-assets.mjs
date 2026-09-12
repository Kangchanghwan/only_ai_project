#!/usr/bin/env node
/**
 * Brand asset generator
 *
 * public/favicon.svg 와 public/og-image.svg 를 원본으로 삼아 사이트가 배포하는 모든 아이콘/OG 래스터를
 * 다시 그린다. prerender.mjs 와 같은 로컬 Puppeteer(Chrome)만 사용하므로 별도 이미지 라이브러리가 없다.
 *
 *   favicon.svg  → favicon-16x16.png, favicon-32x32.png, favicon.ico(16/32/48, 32bpp BMP 엔트리),
 *                  apple-touch-icon.png(180, 코랄 풀블리드 — iOS는 투명 영역을 검게 칠하고 모서리를 직접 깎는다),
 *                  icon-192.png, icon-512.png(투명 모서리, purpose "any"),
 *                  icon-512-maskable.png(512 캔버스 #FAF8F5 위에 312px 타일 = 80% 안전 영역 안, purpose "maskable")
 *   og-image.svg → og-image.png (1200x630, 웹폰트 로드를 확인한 뒤 스크린샷, 150KB 미만 강제)
 *
 * Usage: node scripts/generate-brand-assets.mjs   (= npm run assets:brand)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../public')

// DESIGN.md 팔레트 — SVG 원본의 색과 함께 유지한다
const CORAL = '#FF6B4A'
const LIGHT_BG = '#FAF8F5'
const OG_SIZE = { width: 1200, height: 630 }
const OG_MAX_BYTES = 150 * 1024
// 타일(둥근 모서리 rx 22/100)의 가장 먼 점이 80% 안전 원(반지름 204.8px) 안에 들어오는 크기
const MASKABLE = { canvas: 512, tile: 312 }
const ICO_SIZES = [16, 32, 48]

// og-image.svg 가 쓰는 서체. index.html 과 같은 CDN에서 받는다 (Hangul 은 Noto Sans KR).
const WEBFONT_CSS = [
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=Noto+Sans+KR:wght@500;700;800&display=block',
  'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&display=block'
]
// 스크린샷 전에 실제로 로드됐는지 확인할 서체 — 하나라도 없으면 폴백 글꼴로 구워지므로 실패시킨다
const REQUIRED_FONTS = [
  { font: '800 62px "Cabinet Grotesk"', text: 'PC Clipboard Share' },
  { font: '700 34px "Cabinet Grotesk"', text: 'Clipboard Share' },
  { font: '800 62px "Noto Sans KR"', text: '와 스마트폰 사이, 파일·텍스트 바로 전송' },
  { font: '500 26px "Noto Sans KR"', text: '회원가입·앱 설치 없이, 같은 와이파이면 자동 연결 모두 나가면 삭제되는 무료 온라인 클립보드' },
  { font: '500 26px "Plus Jakarta Sans"', text: 'clipboardapp.org' }
]

/** 루트 <svg>에 픽셀 크기를 박아 Chrome이 정확히 그 해상도로 래스터라이즈하게 한다 */
function withSize(svg, size) {
  return svg.replace(/<svg\b/, `<svg width="${size}" height="${size}"`)
}

/**
 * 페이지 안의 canvas에 SVG를 그려 PNG(base64)와, 요청 시 RGBA 원본 픽셀을 돌려준다.
 * tile < size 이면 타일을 캔버스 중앙에 놓는다 (maskable). background 가 있으면 먼저 칠한다.
 */
async function rasterize(page, svg, { size, tile = size, background = null, raw = false }) {
  return page.evaluate(async (svgText, size, tile, background, raw) => {
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)
    }
    const offset = (size - tile) / 2
    ctx.drawImage(img, offset, offset, tile, tile)
    return {
      png: canvas.toDataURL('image/png').split(',')[1],
      rgba: raw ? Array.from(ctx.getImageData(0, 0, size, size).data) : null
    }
  }, withSize(svg, tile), size, tile, background, raw)
}

/** 32bpp BMP(DIB) 엔트리로 구성된 .ico (기존 favicon.ico 와 같은 형식, 모든 브라우저/Windows 호환) */
function buildIco(frames /* [{ size, rgba }] */) {
  const dibs = frames.map(({ size, rgba }) => {
    const maskRowBytes = ((size + 31) >> 5) << 2
    const xorBytes = size * size * 4
    const dib = Buffer.alloc(40 + xorBytes + maskRowBytes * size)
    dib.writeUInt32LE(40, 0)             // biSize
    dib.writeInt32LE(size, 4)            // biWidth
    dib.writeInt32LE(size * 2, 8)        // biHeight = XOR + AND mask
    dib.writeUInt16LE(1, 12)             // biPlanes
    dib.writeUInt16LE(32, 14)            // biBitCount
    dib.writeUInt32LE(0, 16)             // BI_RGB
    dib.writeUInt32LE(xorBytes + maskRowBytes * size, 20)
    for (let row = 0; row < size; row++) {
      const srcY = size - 1 - row // DIB 행은 아래에서 위로
      for (let x = 0; x < size; x++) {
        const s = (srcY * size + x) * 4
        const d = 40 + (row * size + x) * 4
        dib[d] = rgba[s + 2]     // B
        dib[d + 1] = rgba[s + 1] // G
        dib[d + 2] = rgba[s]     // R
        dib[d + 3] = rgba[s + 3] // A
        if (rgba[s + 3] === 0) dib[40 + xorBytes + row * maskRowBytes + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    return dib
  })

  const header = Buffer.alloc(6 + 16 * dibs.length)
  header.writeUInt16LE(0, 0)           // reserved
  header.writeUInt16LE(1, 2)           // type: icon
  header.writeUInt16LE(dibs.length, 4)
  let offset = header.length
  dibs.forEach((dib, i) => {
    const o = 6 + 16 * i
    header[o] = frames[i].size
    header[o + 1] = frames[i].size
    header.writeUInt16LE(1, o + 4)      // planes
    header.writeUInt16LE(32, o + 6)     // bpp
    header.writeUInt32LE(dib.length, o + 8)
    header.writeUInt32LE(offset, o + 12)
    offset += dib.length
  })
  return Buffer.concat([header, ...dibs])
}

/** og-image.svg 를 웹폰트가 로드된 HTML 안에 인라인해 1200x630 으로 스크린샷한다 */
async function renderOg(browser, svg) {
  const page = await browser.newPage()
  await page.setViewport({ ...OG_SIZE, deviceScaleFactor: 1 })
  const html = `<!doctype html><html><head><meta charset="utf-8">
${WEBFONT_CSS.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<style>html,body{margin:0;background:${LIGHT_BG}}svg{display:block}</style>
</head><body>${svg}</body></html>`
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })

  const missing = await page.evaluate(async (required) => {
    const results = await Promise.all(required.map(async ({ font, text }) => {
      const faces = await document.fonts.load(font, text)
      return { font, ok: faces.length > 0 && faces.every((f) => f.status === 'loaded') }
    }))
    await document.fonts.ready
    return results.filter((r) => !r.ok).map((r) => r.font)
  }, REQUIRED_FONTS)
  if (missing.length) {
    throw new Error(`웹폰트를 불러오지 못했습니다 (네트워크 확인): ${missing.join(', ')}`)
  }

  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...OG_SIZE } })
  await page.close()
  return Buffer.from(png)
}

async function main() {
  const faviconSvg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8')
  const ogSvg = readFileSync(join(publicDir, 'og-image.svg'), 'utf8')

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')

    const write = (name, buf) => {
      writeFileSync(join(publicDir, name), buf)
      console.log(`  ${name.padEnd(24)} ${(buf.length / 1024).toFixed(1).padStart(6)} KB`)
    }
    const png = (result) => Buffer.from(result.png, 'base64')

    console.log('favicon.svg →')
    write('favicon-16x16.png', png(await rasterize(page, faviconSvg, { size: 16 })))
    write('favicon-32x32.png', png(await rasterize(page, faviconSvg, { size: 32 })))
    write('icon-192.png', png(await rasterize(page, faviconSvg, { size: 192 })))
    write('icon-512.png', png(await rasterize(page, faviconSvg, { size: 512 })))
    write('apple-touch-icon.png', png(await rasterize(page, faviconSvg, { size: 180, background: CORAL })))
    write('icon-512-maskable.png', png(await rasterize(page, faviconSvg, { size: MASKABLE.canvas, tile: MASKABLE.tile, background: LIGHT_BG })))

    const frames = []
    for (const size of ICO_SIZES) {
      frames.push({ size, rgba: (await rasterize(page, faviconSvg, { size, raw: true })).rgba })
    }
    write('favicon.ico', buildIco(frames))

    console.log('og-image.svg →')
    const og = await renderOg(browser, ogSvg)
    if (og.length >= OG_MAX_BYTES) {
      throw new Error(`og-image.png 이 ${(og.length / 1024).toFixed(1)} KB 로 150 KB 제한을 넘었습니다. 배경과 일러스트를 단색으로 유지하세요.`)
    }
    write('og-image.png', og)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('브랜드 에셋 생성 실패:', error.message)
  process.exit(1)
})
