#!/usr/bin/env node
// 변경된 페이지를 IndexNow(네이버 서치어드바이저 + 공용 엔드포인트 → Bing 등)로 알린다.
// 사용법:
//   git diff --name-only A B | node ops/scripts/indexnow.mjs      변경 파일 목록(stdin)으로 URL 계산
//   node ops/scripts/indexnow.mjs --all                           sitemap 전체 제출
//   DRY_RUN=1 ...                                                 제출 없이 URL만 출력
import { readFileSync } from 'node:fs'

const HOST = 'www.clipboardapp.org'
const ORIGIN = `https://${HOST}`
const KEY = readFileSync('ops/indexnow-key.txt', 'utf8').trim()
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`
const ENDPOINTS = ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']

const sitemap = readFileSync('frontend/public/sitemap.xml', 'utf8')
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()))

const fileToUrls = (f) => {
  if (f === 'frontend/src/i18n/locales/ko.json' || f === 'frontend/index.html') return [`${ORIGIN}/`]
  if (f === 'frontend/src/i18n/locales/en.json') return [`${ORIGIN}/en/`]
  const m = f.match(/^frontend\/public\/(.+\.html)$/)
  if (!m) return []
  return [`${ORIGIN}/${m[1].replace(/(^|\/)index\.html$/, '$1')}`]
}

let urls
if (process.argv.includes('--all')) urls = [...sitemapUrls]
else {
  const input = readFileSync(0, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  urls = [...new Set(input.flatMap(fileToUrls))].filter(u => sitemapUrls.has(u))
}
if (!urls.length) { console.log('제출할 URL 없음'); process.exit(0) }
console.log(`제출 대상 ${urls.length}개:\n- ${urls.join('\n- ')}`)
if (process.env.DRY_RUN) process.exit(0)

// 배포가 끝나 키 파일과 페이지가 실제로 열릴 때까지 대기 (최대 5분)
const ok = async (u) => { try { const r = await fetch(u, { redirect: 'follow' }); return r.status === 200 } catch { return false } }
const deadline = Date.now() + 5 * 60 * 1000
while (true) {
  const checks = await Promise.all([KEY_LOCATION, ...urls].map(ok))
  if (checks.every(Boolean)) break
  if (Date.now() > deadline) { console.log('배포 대기 시간 초과: 키 파일 또는 페이지가 200이 아님'); process.exit(1) }
  await new Promise(r => setTimeout(r, 15000))
}

let failed = 0
for (const ep of ENDPOINTS) {
  const res = await fetch(ep, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls })
  })
  console.log(`${ep} → HTTP ${res.status}`)
  if (![200, 202].includes(res.status)) { failed++; console.log(await res.text()) }
}
process.exit(failed ? 1 : 0)
