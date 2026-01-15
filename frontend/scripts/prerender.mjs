#!/usr/bin/env node
/**
 * Prerender Script for SPA SEO
 *
 * 빌드된 SPA를 puppeteer로 렌더링하여 정적 HTML을 생성합니다.
 * 검색 엔진 봇이 완전한 HTML을 크롤링할 수 있도록 합니다.
 *
 * Usage: node scripts/prerender.mjs
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createServer } from 'http'
import { readFile } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distDir = join(__dirname, '../dist')

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

async function prerender() {
  console.log('Prerender 시작...\n')

  // dist 폴더 확인
  if (!existsSync(distDir)) {
    console.error('Error: dist 폴더가 없습니다. 먼저 빌드를 실행하세요.')
    console.error('  npm run build')
    process.exit(1)
  }

  // Puppeteer 동적 임포트
  let puppeteer
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.error('Error: puppeteer가 설치되어 있지 않습니다.')
    console.error('  npm install -D puppeteer')
    process.exit(1)
  }

  const port = 4173
  const server = await createStaticServer(distDir, port)

  try {
    const browser = await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

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
