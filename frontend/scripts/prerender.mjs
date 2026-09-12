#!/usr/bin/env node
/**
 * Prerender Script for SPA SEO
 *
 * 빌드된 SPA를 puppeteer로 렌더링하여 정적 HTML을 생성합니다.
 * 검색 엔진 봇이 완전한 HTML을 크롤링할 수 있도록 합니다.
 *
 * - 로컬 환경: puppeteer (bundled Chromium)
 * - Vercel/CI 환경: puppeteer-core + @sparticuz/chromium
 *
 * Usage: node scripts/prerender.mjs
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { createServer } from 'http'
import { readFile } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distDir = join(__dirname, '../dist')

// Vercel 또는 CI 환경 감지
const isVercel = process.env.VERCEL === '1'
const isCI = process.env.CI === 'true'
const isServerless = isVercel || isCI

// Prerender할 라우트 목록
const routes = [
  '/'
]

// 간단한 정적 서버
function createStaticServer(dir, port) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let filePath = join(dir, req.url === '/' ? 'index.html' : req.url)

      // 확장자가 없으면 index.html로 fallback (SPA)
      if (!filePath.includes('.')) {
        filePath = join(dir, 'index.html')
      }

      try {
        const content = await readFile(filePath)
        const ext = filePath.split('.').pop()
        const mimeTypes = {
          'html': 'text/html',
          'js': 'application/javascript',
          'css': 'text/css',
          'json': 'application/json',
          'png': 'image/png',
          'svg': 'image/svg+xml',
          'ico': 'image/x-icon'
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' })
        res.end(content)
      } catch {
        // 파일이 없으면 index.html 반환 (SPA fallback)
        try {
          const content = await readFile(join(dir, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(content)
        } catch {
          res.writeHead(404)
          res.end('Not Found')
        }
      }
    })

    server.listen(port, () => {
      console.log(`Static server running at http://localhost:${port}`)
      resolve(server)
    })
  })
}

/**
 * 환경에 맞는 브라우저를 실행합니다
 */
async function launchBrowser() {
  if (isServerless) {
    // Vercel/CI 환경: puppeteer-core + @sparticuz/chromium
    console.log('Serverless 환경 감지 - puppeteer-core 사용')

    const chromium = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')

    return await puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless
    })
  } else {
    // 로컬 환경: 일반 puppeteer
    console.log('로컬 환경 - puppeteer 사용')

    const puppeteer = await import('puppeteer')
    return await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
  }
}

// index.html의 폰트 CSS <link> (preload + onload 패턴). 프리렌더 결과물에서도 이 패턴이 유지되어야 한다.
const ASYNC_FONT_CSS = [
  'https://fonts.googleapis.com/css2?',
  'https://api.fontshare.com/v2/css?'
]

/**
 * 프리렌더된 HTML의 폰트 CSS 링크가 여전히 렌더 비차단(preload + onload) 패턴인지 검증합니다.
 * - <noscript> 밖: rel="preload" as="style" onload="...rel='stylesheet'" 링크가 정확히 1개, rel="stylesheet" 링크는 0개
 * - <noscript> 안: rel="stylesheet" 폴백 링크 존재
 * - 두 링크 모두 display=swap 유지
 */
function assertAsyncFontLinks(html) {
  // HTML 주석 안의 태그 텍스트가 검사에 섞이지 않도록 주석부터 제거한다.
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '')
  const noscriptBlocks = withoutComments.match(/<noscript>[\s\S]*?<\/noscript>/gi) ?? []
  const outsideNoscript = withoutComments.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
  const links = outsideNoscript.match(/<link\b[^>]*>/gi) ?? []

  for (const cssUrlPrefix of ASYNC_FONT_CSS) {
    const fontLinks = links.filter((tag) => tag.includes(cssUrlPrefix))
    const preloads = fontLinks.filter((tag) =>
      /\brel="preload"/.test(tag) && /\bas="style"/.test(tag) && /\bonload="[^"]*rel='stylesheet'[^"]*"/.test(tag)
    )
    const blocking = fontLinks.filter((tag) => /\brel="stylesheet"/.test(tag))
    const noscriptFallback = noscriptBlocks.some((block) => block.includes(cssUrlPrefix) && /\brel="stylesheet"/.test(block))
    const keepsSwap = fontLinks.every((tag) => tag.includes('display=swap'))

    if (preloads.length !== 1 || blocking.length !== 0 || !noscriptFallback || !keepsSwap) {
      throw new Error(
        `폰트 CSS 링크 검증 실패 (${cssUrlPrefix}): preload=${preloads.length} (기대 1), 렌더 차단 stylesheet=${blocking.length} (기대 0), ` +
        `noscript 폴백=${noscriptFallback}, display=swap 유지=${keepsSwap}`
      )
    }
  }
}

async function prerender() {
  console.log('Prerender 시작...\n')
  console.log(`환경: ${isVercel ? 'Vercel' : isCI ? 'CI' : '로컬'}`)

  // dist 폴더 확인
  if (!existsSync(distDir)) {
    console.error('Error: dist 폴더가 없습니다. 먼저 빌드를 실행하세요.')
    console.error('  npm run build')
    process.exit(1)
  }

  const port = 4173
  const server = await createStaticServer(distDir, port)

  try {
    const browser = await launchBrowser()

    for (const route of routes) {
      console.log(`Rendering: ${route}`)

      const page = await browser.newPage()

      // 네트워크 요청 대기 설정
      await page.goto(`http://localhost:${port}${route}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      })

      // Vue 앱이 마운트될 때까지 대기
      await page.waitForSelector('#app:not(:empty)', { timeout: 10000 })

      // 추가 대기 (동적 콘텐츠 로딩)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 폰트 CSS는 preload + onload 패턴(index.html 참고)이라 이 시점엔 onload가 rel을 stylesheet로 바꿔 놓은 상태다.
      // 그대로 직렬화하면 결과물이 다시 렌더 차단 스타일시트가 되므로 직렬화 전에 preload로 되돌린다.
      await page.evaluate(() => {
        document.querySelectorAll('link[as="style"]').forEach((link) => {
          link.rel = 'preload'
        })
      })

      // HTML 추출
      const html = await page.content()

      // 파일 경로 결정
      const filePath = route === '/'
        ? join(distDir, 'index.html')
        : join(distDir, route.slice(1), 'index.html')

      // 디렉토리 생성
      const fileDir = dirname(filePath)
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true })
      }

      // Prerendered 마커 추가 및 저장
      const finalHtml = html.replace(
        '</head>',
        '  <!-- Prerendered for SEO -->\n  </head>'
      )

      assertAsyncFontLinks(finalHtml)
      writeFileSync(filePath, finalHtml)
      console.log(`  Saved: ${filePath}`)

      await page.close()
    }

    await browser.close()
    console.log('\nPrerender 완료!')

  } catch (error) {
    console.error('Prerender 실패:', error.message)
    process.exit(1)
  } finally {
    server.close()
  }
}

prerender()
