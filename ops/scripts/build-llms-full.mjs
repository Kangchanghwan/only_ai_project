#!/usr/bin/env node
// llms.txt의 Pages 목록에 있는 로컬 HTML(가이드·사용법·FAQ)의 본문을 마크다운으로 모아 llms-full.txt를 만든다.
// 의존성 없음. 가이드를 추가·수정한 날 실행: node ops/scripts/build-llms-full.mjs
// 앱 화면(/, /en/)과 외부 링크는 넣지 않는다. 본문은 <article>(없으면 <main>)에서 '관련 글' 섹션을 뺀 부분.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../../frontend/public/', import.meta.url).pathname
const SITE = 'https://www.clipboardapp.org'
const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8')

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rarr: '→', larr: '←', harr: '↔', hellip: '…', ndash: '–', mdash: '—' }
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)

function toMarkdown(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
    .replace(/<section[^>]*class="[^"]*related[^"]*"[\s\S]*?<\/section>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = text.replace(/<[^>]+>/g, '').trim()
    const abs = href.startsWith('/') ? SITE + href : href
    return t ? `[${t}](${abs})` : ''
  })
  s = s
    .replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<h3[^>]*>/gi, '\n\n### ').replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|table|tr|blockquote|figure|details|summary)>/gi, '\n\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
  return decode(s)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').replace(/\n\n(?=- )/g, '\n').replace(/^- /, '\n- ').trim()
}

const header = llms.split(/\n## /)[0].trim()
const urls = [...llms.matchAll(/\]\((https:\/\/www\.clipboardapp\.org\/[^)\s]+\.html)\)/g)].map((m) => m[1])
const out = [header, '', `> Full text of the guides listed in ${SITE}/llms.txt, generated from the published HTML. Korean pages stay in Korean.`, '']
let n = 0
for (const url of [...new Set(urls)]) {
  const file = join(ROOT, url.slice(SITE.length + 1))
  if (!existsSync(file)) { console.warn('skip (no file):', url); continue }
  const html = readFileSync(file, 'utf8')
  const body = (html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || [])[1]
  if (!body) { console.warn('skip (no article/main):', url); continue }
  out.push('---', '', `Source: ${url}`, '', toMarkdown(body), '')
  n++
}
writeFileSync(join(ROOT, 'llms-full.txt'), out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n')
console.log(`llms-full.txt: ${n} pages, ${Math.round(Buffer.byteLength(out.join('\n')) / 1024)} KB`)
