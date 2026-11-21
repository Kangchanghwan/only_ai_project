// @vitest-environment jsdom
// The pptx fixtures have no real user-edited save; user changes and new rows are synthetic tweaks of B.
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, kid, kids, attr, canon, NS } from '../xml.js'

const O = fx('pptx-tablelines.O.pptx')
const B = fx('pptx-tablelines.B.pptx')
const SLIDE = 'ppt/slides/slide2.xml'
const table = (d) => desc(d, 'graphicFrame', NS.p).map((g) => desc(g, 'tbl', NS.a)[0]).find(Boolean)
const cell = (t, r, c) => kids(kids(t, 'tr')[r], 'tc')[c]
const line = (tc, ln) => kid(kid(tc, 'tcPr'), ln)

describe('rule: pptx table lines', () => {
  it('untouched: dash style, compound type and dropped lines come back', async () => {
    const { bytes } = await restore(O, B, B, 'pptx')
    await expectValid(bytes)
    const to = table((await pkg(O)).xml(SLIDE))
    const ts = table((await pkg(bytes)).xml(SLIDE))
    kids(to, 'tr').forEach((tr, r) => kids(tr, 'tc').forEach((tc, c) => {
      for (const ln of ['lnL', 'lnR', 'lnT', 'lnB']) expect(canon(line(cell(ts, r, c), ln)), r + ':' + c + ln).toBe(canon(line(tc, ln)))
    }))
    expect(attr(kid(line(cell(ts, 0, 1), 'lnL'), 'prstDash'), 'val')).toBe('dash')
  })

  it('keeps a width the user changed and restores the dash on the same line', async () => {
    const S = await tweak(B, SLIDE, (d) => line(cell(table(d), 0, 0), 'lnL').setAttribute('w', '76200'))
    const { bytes, report } = await restore(O, B, S, 'pptx')
    const l = line(cell(table((await pkg(bytes)).xml(SLIDE)), 0, 0), 'lnL')
    expect(attr(l, 'w')).toBe('76200')
    expect(attr(l, 'cmpd')).toBe('sng')
    expect(attr(kid(l, 'prstDash'), 'val')).toBe('solid')
    expect(report.userChanged.map((r) => r.id)).toContain('pptx-table-lines')
  })

  it('a new row inherits from the row above (rows aligned by text)', async () => {
    const S = await tweak(B, SLIDE, (d) => {
      const t = table(d)
      const rows = kids(t, 'tr')
      const n = rows[1].cloneNode(true)
      for (const x of desc(n, 't', NS.a)) x.textContent = '새 행'
      t.insertBefore(n, rows[2] || null)
    })
    const { bytes } = await restore(O, B, S, 'pptx')
    const t = table((await pkg(bytes)).xml(SLIDE))
    const rows = kids(t, 'tr')
    const ni = rows.findIndex((r) => r.textContent.includes('새 행'))
    kids(rows[ni], 'tc').forEach((tc, c) => expect(canon(line(tc, 'lnT'))).toBe(canon(line(kids(rows[ni - 1], 'tc')[c], 'lnT'))))
    // rows after the new one still match their originals
    const to = table((await pkg(O)).xml(SLIDE))
    expect(canon(line(cell(t, ni + 1, 0), 'lnL'))).toBe(canon(line(cell(to, ni, 0), 'lnL')))
  })

  it('is idempotent', async () => {
    await expectIdempotent(O, B, B, 'pptx')
  })
})
