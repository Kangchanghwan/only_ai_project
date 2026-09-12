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
// route → 프리렌더 시 고정할 로케일. localStorage 'user-locale'이 브라우저 언어보다 우선한다 (src/i18n/index.js resolveLocale)
const EN_KEYWORDS = [
  'online clipboard',
  'share clipboard between phone and PC',
  'copy paste between devices',
  'send files between phone and PC',
  'same Wi-Fi file transfer',
  'no sign-up file sharing',
  'screenshot sharing',
  'text sharing'
].join(', ')

const routes = [
  {
    path: '/',
    locale: 'ko',
    language: 'ko-KR',
    // ko는 index.html의 정적 keywords를 그대로 사용한다
    keywords: null,
    expect: {
      lang: '<html lang="ko"',
      canonical: 'https://www.clipboardapp.org/',
      headline: 'PC와 스마트폰 사이'
    }
  },
  {
    path: '/en/',
    locale: 'en',
    language: 'en-US',
    keywords: EN_KEYWORDS,
    expect: {
      lang: '<html lang="en"',
      canonical: 'https://www.clipboardapp.org/en/',
      headline: 'The online clipboard between',
      faqFirstQuestion: 'Is it really free?'
    }
  }
]

/**
 * 저장 직전 정적 HTML을 검증한다. 하나라도 어긋나면 빌드를 실패시킨다.
 */
function assertOutput(html, route) {
  const fail = (msg) => { throw new Error(`[prerender ${route.path}] ${msg}`) }

  if (!html.includes('Prerendered for SEO')) fail('Prerendered 마커가 없습니다')
  if (!html.includes(route.expect.lang)) fail(`${route.expect.lang} 태그가 없습니다`)

  const canonical = html.match(/<link rel="canonical"[^>]*href="([^"]*)"/)
  if (!canonical) fail('canonical 링크가 없습니다')
  if (canonical[1] !== route.expect.canonical) fail(`canonical 불일치: ${canonical[1]} (기대: ${route.expect.canonical})`)

  if (!html.includes(route.expect.headline)) fail(`헤드라인 문구가 없습니다: ${route.expect.headline}`)
  if (html.includes('class="notification"')) fail('알림 토스트가 정적 HTML에 구워졌습니다')

  const keywords = html.match(/<meta name="keywords" content="([^"]*)"/)
  if (!keywords) fail('keywords meta가 없습니다')
  if (route.keywords && keywords[1] !== route.keywords) fail(`keywords 불일치: ${keywords[1]}`)

  if (route.expect.faqFirstQuestion) {
    const faq = html.match(/<script[^>]*id="ld-faq"[^>]*>([\s\S]*?)<\/script>/)
    if (!faq) fail('#ld-faq JSON-LD 블록이 없습니다')
    let parsed
    try { parsed = JSON.parse(faq[1]) } catch (e) { fail(`#ld-faq JSON 파싱 실패: ${e.message}`) }
    const first = parsed.mainEntity && parsed.mainEntity[0] && parsed.mainEntity[0].name
    if (first !== route.expect.faqFirstQuestion) fail(`FAQ 첫 질문 불일치: ${first} (기대: ${route.expect.faqFirstQuestion})`)
  }
}

// 간단한 정적 서버
// shellHtml: 빌드 직후의 원본 index.html. 프리렌더는 라우트마다 dist/index.html을 덮어쓰므로
// 디스크에서 다시 읽으면 다음 라우트가 이전 라우트의 프리렌더 결과 위에 렌더링된다.
function createStaticServer(dir, port, shellHtml) {
  return new Promise((resolve) => {
    const sendShell = (res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(shellHtml)
    }

    const server = createServer(async (req, res) => {
      const urlPath = req.url.split('?')[0]

      // '/' 와 확장자 없는 SPA 경로는 메모리에 보관한 원본 shell로 응답한다
      if (urlPath === '/' || !urlPath.split('/').pop().includes('.')) {
        sendShell(res)
        return
      }

      const filePath = join(dir, urlPath)

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
        // 파일이 없으면 원본 shell 반환 (SPA fallback)
        sendShell(res)
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

  // 프리렌더 결과로 덮어쓰기 전의 원본 shell을 한 번만 읽어 둔다
  const shellHtml = await readFile(join(distDir, 'index.html'))
  const server = await createStaticServer(distDir, port, shellHtml)

  try {
    const browser = await launchBrowser()

    for (const route of routes) {
      console.log(`Rendering: ${route.path}`)

      const page = await browser.newPage()

      // 로케일 고정: localStorage와 navigator.language를 라우트에 맞게 주입한다
      await page.evaluateOnNewDocument((locale, language) => {
        // 앱이 소켓에 연결하지 않도록 하는 플래그 (src/App.vue onMounted)
        window.__PRERENDER__ = true
        try { localStorage.setItem('user-locale', locale) } catch {}
        Object.defineProperty(navigator, 'language', { get: () => language })
        Object.defineProperty(navigator, 'languages', { get: () => [language] })
      }, route.locale, route.language)
      await page.setExtraHTTPHeaders({ 'Accept-Language': route.language })

      // 구워지는 data-theme을 결정적으로 고정한다 (현재 프로덕션과 동일한 light)
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])

      // 네트워크 요청 대기 설정
      await page.goto(`http://localhost:${port}${route.path}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      })

      // Vue가 랜딩 섹션을 실제로 렌더링할 때까지 대기 (ko/en 모두 렌더링된다)
      await page.waitForSelector('[data-testid="landing-content"]', { timeout: 15000 })

      // 추가 대기 (동적 콘텐츠 로딩)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 일시적 요소(알림 토스트)는 정적 HTML에 굽지 않는다
      await page.evaluate(() => {
        document.querySelectorAll('[data-prerender-strip], [role="status"], [role="alert"]').forEach((el) => el.remove())
      })

      // 로케일별 keywords (ko는 index.html의 정적 값을 그대로 둔다)
      if (route.keywords) {
        await page.evaluate((keywords) => {
          const el = document.querySelector('meta[name="keywords"]')
          if (el) el.setAttribute('content', keywords)
        }, route.keywords)
      }

      // HTML 추출
      const html = await page.content()

      // 파일 경로 결정
      const filePath = route.path === '/'
        ? join(distDir, 'index.html')
        : join(distDir, route.path.replace(/^\/|\/$/g, ''), 'index.html')

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

      assertOutput(finalHtml, route)

      writeFileSync(filePath, finalHtml)
      console.log(`  OK ${route.path} -> ${filePath} (lang/canonical/headline/keywords/no-toast 검증 통과)`)

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
