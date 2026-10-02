#!/usr/bin/env node
// 사용법: node ops/scripts/check-allowlist.mjs <base-ref>
// base-ref 대비 변경된 파일이 전부 ops/auto-merge-allowlist.txt 패턴에 맞으면 exit 0, 아니면 exit 1.
// 모델이 개입하지 않는 결정론적 게이트다.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const base = process.argv[2] || 'origin/master'
const patterns = readFileSync('ops/auto-merge-allowlist.txt', 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

const toRegex = (p) => new RegExp('^' + p
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '.*') + '$')
const regexes = patterns.map(toRegex)

const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
  .split('\n').filter(Boolean)

if (changed.length === 0) {
  console.log('변경 파일 없음')
  process.exit(1)
}
const blocked = changed.filter(f => !regexes.some(r => r.test(f)))
for (const f of changed) console.log(`${blocked.includes(f) ? 'BLOCK' : 'ok   '} ${f}`)
if (blocked.length) {
  console.log(`\n허용목록 밖 변경 ${blocked.length}개 → 자동 머지 불가, owner 승인 필요`)
  process.exit(1)
}
console.log(`\n${changed.length}개 파일 모두 허용목록 안 → 자동 머지 가능`)
