/**
 * src/services/hwpAgent.js 를 import/export 없는 IIFE 한 파일로 만든다 (scripts/hwp-agent.iife.js).
 * 배포 전에 운영 페이지(/tools/hwp/) 콘솔에 붙여 넣어 실제 편집기로 시험하려는 용도다. 번들에는 들어가지 않는다.
 *
 *   node scripts/build-hwp-agent-iife.mjs          생성
 *   node scripts/build-hwp-agent-iife.mjs --check  최신인지 확인 (아니면 종료 코드 1)
 *
 * 붙인 뒤: const agent = __hwpAgentFactory(() => document.querySelector('iframe').contentWindow)
 * hwpAgent.test.js 가 생성물이 최신인지 검사하므로 hwpAgent.js 를 고치면 이 명령을 다시 실행한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const SRC = resolve(here, '../src/services/hwpAgent.js')
export const OUT = resolve(here, 'hwp-agent.iife.js')

export function buildIife(source) {
  if (/^import\s/m.test(source)) throw new Error('hwpAgent.js 에 import 가 있으면 IIFE 로 만들 수 없습니다')
  const body = source.replace(/^export\s+(async\s+function|function|class|const|let)\b/gm, '$1')
  if (/^export\b/m.test(body)) throw new Error('변환하지 못한 export 가 있습니다')
  return `/* 자동 생성: node scripts/build-hwp-agent-iife.mjs (원본 src/services/hwpAgent.js, 직접 고치지 않는다) */
;(function () {
${body}
window.__hwpAgentFactory = createHwpAgent
window.__hwpAgentDismissRecovery = dismissRecoveryDialog
})()
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = buildIife(readFileSync(SRC, 'utf8'))
  if (process.argv.includes('--check')) {
    let cur = ''
    try { cur = readFileSync(OUT, 'utf8') } catch { /* 없음 */ }
    if (cur !== out) { console.error('hwp-agent.iife.js 가 최신이 아닙니다: node scripts/build-hwp-agent-iife.mjs'); process.exit(1) }
    console.log('hwp-agent.iife.js 최신')
  } else {
    writeFileSync(OUT, out)
    console.log('생성:', OUT, out.length + '바이트')
  }
}
