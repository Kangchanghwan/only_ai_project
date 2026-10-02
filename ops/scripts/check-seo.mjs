#!/usr/bin/env node
// SEO·콘텐츠 평가(eval). CI와 자동 머지 게이트에서 돈다. 실패하면 exit 1.
// 1) sitemap의 정적 URL이 실제 파일로 존재
// 2) guide 폴더의 모든 html이 sitemap에 있음
// 3) llms.txt URL 집합 == sitemap URL 집합
// 4) 각 정적 페이지에 title / meta description / canonical(자기 URL)
// 5) ops/content-rules.json 의 금지 문구가 없음 (사실과 다른 카피 방지)
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PUB = 'frontend/public'
const ORIGIN = 'https://www.clipboardapp.org'
const errors = []
const err = (m) => errors.push(m)

const sitemap = readFileSync(join(PUB, 'sitemap.xml'), 'utf8')
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
const llms = readFileSync(join(PUB, 'llms.txt'), 'utf8')
const llmsUrls = [...new Set([...llms.matchAll(/\((https:\/\/www\.clipboardapp\.org[^)\s]*)\)/g)].map(m => m[1]))]

// SPA가 렌더링하는 경로 (정적 파일 아님)
const SPA = new Set([`${ORIGIN}/`, `${ORIGIN}/en/`])

const fileFor = (url) => {
  let p = url.replace(ORIGIN, '')
  if (p.endsWith('/')) p += 'index.html'
  return join(PUB, p)
}

const dupes = sitemapUrls.filter((u, i) => sitemapUrls.indexOf(u) !== i)
if (dupes.length) err(`sitemap 중복 URL: ${dupes.join(', ')}`)

for (const url of sitemapUrls) {
  if (!url.startsWith(ORIGIN)) err(`sitemap URL이 www 정식 도메인이 아님: ${url}`)
  if (SPA.has(url)) continue
  if (!existsSync(fileFor(url))) err(`sitemap URL에 해당하는 파일 없음: ${url}`)
}

for (const dir of ['guide', 'en/guide']) {
  for (const f of readdirSync(join(PUB, dir)).filter(f => f.endsWith('.html'))) {
    const url = `${ORIGIN}/${dir}/${f === 'index.html' ? '' : f}`
    if (!sitemapUrls.includes(url)) err(`sitemap에 없는 가이드 페이지: ${url}`)
  }
}

const a = new Set(sitemapUrls), b = new Set(llmsUrls)
for (const u of a) if (!b.has(u)) err(`llms.txt에 없음: ${u}`)
for (const u of b) if (!a.has(u)) err(`sitemap에 없음(llms.txt에만 있음): ${u}`)

const rules = JSON.parse(readFileSync('ops/content-rules.json', 'utf8'))
const staticFiles = sitemapUrls.filter(u => !SPA.has(u)).map(u => [u, fileFor(u)]).filter(([, f]) => existsSync(f))
for (const [url, file] of staticFiles) {
  const html = readFileSync(file, 'utf8')
  const title = html.match(/<title>([^<]*)<\/title>/)
  if (!title || !title[1].trim()) err(`title 없음: ${url}`)
  else if (title[1].length > 70) err(`title 70자 초과(${title[1].length}): ${url}`)
  const desc = html.match(/<meta name="description" content="([^"]*)"/)
  if (!desc || desc[1].length < 50) err(`meta description 없음/50자 미만: ${url}`)
  const canon = html.match(/<link rel="canonical" href="([^"]*)"/)
  if (!canon) err(`canonical 없음: ${url}`)
  else if (canon[1] !== url) err(`canonical 불일치: ${url} → ${canon[1]}`)
  for (const phrase of rules.forbidden) {
    if (html.toLowerCase().includes(phrase.toLowerCase())) err(`금지 문구 "${phrase}": ${url}`)
  }
}
for (const f of readdirSync('frontend/src/i18n/locales').filter(f => f.endsWith('.json'))) {
  const txt = readFileSync(join('frontend/src/i18n/locales', f), 'utf8')
  for (const phrase of rules.forbidden) {
    if (txt.toLowerCase().includes(phrase.toLowerCase())) err(`금지 문구 "${phrase}": i18n/${f}`)
  }
}

console.log(`sitemap ${sitemapUrls.length}개, llms.txt ${llmsUrls.length}개, 정적 페이지 ${staticFiles.length}개 검사`)
if (errors.length) {
  console.log(`\n실패 ${errors.length}건:\n- ` + errors.join('\n- '))
  process.exit(1)
}
console.log('SEO/콘텐츠 평가 통과')
