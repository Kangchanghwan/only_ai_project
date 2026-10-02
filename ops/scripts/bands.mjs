#!/usr/bin/env node
// 지표 밴드 판정. ops/metrics/daily.csv (각 행 = 그날 기준 최근 7일 롤링 값) + ops/bands.json
// 출력: 마크다운 표 + 마지막 줄에 JSON (에이전트가 파싱). 모델이 개입하지 않는다.
import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync('ops/bands.json', 'utf8'))
const [head, ...lines] = readFileSync('ops/metrics/daily.csv', 'utf8').trim().split('\n')
const cols = head.split(',')
const rows = lines.map(l => {
  const v = l.split(','); const r = {}
  cols.forEach((c, i) => { r[c] = c === 'date' || c === 'note' ? v[i] : (v[i] === '' || v[i] == null ? null : Number(v[i])) })
  r.t = Date.parse(r.date)
  return r
}).sort((a, b) => a.t - b.t)

const DAY = 86400000
const latest = rows.at(-1)
const rank = { ok: 0, log: 1, diagnose: 2, propose: 3 }
const results = []

// 북극성: 마일스톤 선형 보간 페이스
const ns = cfg.north_star
const pts = [ns.baseline, ...ns.milestones].map(p => ({ t: Date.parse(p.date), v: p.value }))
const paceAt = (t) => {
  if (t <= pts[0].t) return pts[0].v
  for (let i = 1; i < pts.length; i++) if (t <= pts[i].t) {
    const a = pts[i - 1], b = pts[i]
    return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t)
  }
  return pts.at(-1).v
}
const au28Row = [...rows].reverse().find(r => r[ns.metric] != null)
if (au28Row) {
  const target = paceAt(au28Row.t), ratio = au28Row[ns.metric] / target
  const tier = ratio >= 1 ? 'ok' : ratio >= ns.pace_tiers.log ? 'log' : ratio >= ns.pace_tiers.diagnose ? 'diagnose' : 'propose'
  results.push({ key: ns.metric, label: ns.label, value: au28Row[ns.metric], ref: Math.round(target), change: `페이스 ${(ratio * 100).toFixed(0)}%`, tier, why: `오늘 기준 목표 ${Math.round(target)}` })
} else {
  results.push({ key: ns.metric, label: ns.label, value: null, tier: 'log', why: 'au28 데이터 없음 (GA4에서 수집 필요)' })
}

for (const m of cfg.metrics) {
  const cur = latest[m.key]
  if (cur == null) { results.push({ key: m.key, label: m.label, value: null, tier: 'ok', why: '오늘 값 없음' }); continue }
  const sign = m.direction === 'up' ? 1 : -1
  const prev = [...rows].reverse().find(r => r.t <= latest.t - 7 * DAY + DAY / 2 && r[m.key] != null)
  const hist = rows.filter(r => r.t <= latest.t - 7 * DAY + DAY / 2 && r[m.key] != null).map(r => r[m.key])
  let tier = 'ok', why = '', change = ''
  if (prev) {
    const pct = prev[m.key] === 0 ? (cur > 0 ? 1 : 0) : (cur - prev[m.key]) / prev[m.key]
    change = `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(0)}% (7일 전 ${prev[m.key]})`
    if (hist.length >= cfg.min_history_for_z) {
      const mean = hist.reduce((a, b) => a + b, 0) / hist.length
      const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length)
      const z = sd > 0 ? sign * (cur - mean) / sd : 0
      const bad = -z
      tier = bad >= cfg.z_tiers.propose ? 'propose' : bad >= cfg.z_tiers.diagnose ? 'diagnose' : bad >= cfg.z_tiers.log ? 'log' : 'ok'
      why = `z=${z.toFixed(2)} (기준 평균 ${mean.toFixed(1)}, n=${hist.length})`
    } else {
      const bad = -sign * pct
      const t = cfg.pct_tiers_when_short_history
      tier = bad >= t.propose ? 'propose' : bad >= t.diagnose ? 'diagnose' : bad >= t.log ? 'log' : 'ok'
      why = `이력 짧음(n=${hist.length}) → 증감률 기준`
    }
    if (Math.max(cur, prev[m.key]) < cfg.min_volume && rank[tier] > rank.log) { tier = 'log'; why += ` / 표본 ${cfg.min_volume} 미만이라 log로 제한` }
  } else why = '비교할 7일 전 값 없음'
  // 완만한 하락(드리프트): 주 단위 값이 drift_weeks번 연속 악화
  const weekly = []
  for (let k = 0; k <= cfg.drift_weeks; k++) {
    const r = [...rows].reverse().find(x => x.t <= latest.t - k * 7 * DAY + DAY / 2 && x.t > latest.t - (k + 1) * 7 * DAY + DAY / 2 && x[m.key] != null)
    weekly.push(r ? r[m.key] : null)
  }
  if (weekly.every(v => v != null) && weekly.slice(0, -1).every((v, i) => sign * (v - weekly[i + 1]) < 0)) {
    if (rank[tier] < rank.diagnose) { tier = 'diagnose'; why += ` / ${cfg.drift_weeks}주 연속 악화(드리프트)` }
  }
  results.push({ key: m.key, label: m.label, value: cur, change, tier, why })
}

const worst = results.reduce((w, r) => rank[r.tier] > rank[w] ? r.tier : w, 'ok')
console.log(`## 지표 밴드 (기준일 ${latest.date})\n`)
console.log('| 지표 | 값 | 변화 | 등급 | 근거 |\n|---|---|---|---|---|')
for (const r of results) console.log(`| ${r.label} | ${r.value ?? '-'} | ${r.change || '-'} | ${r.tier} | ${r.why} |`)
console.log(`\n최고 등급: ${worst}`)
console.log(JSON.stringify({ date: latest.date, worst, results }))
