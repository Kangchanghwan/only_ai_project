// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, kid, kids, NS } from '../xml.js'

const DOC = 'word/document.xml'
const doc = async (bytes) => (await pkg(bytes)).xml(DOC)
const tables = async (bytes) => desc(await doc(bytes), 'tbl', NS.w)
const side = (box, s) => kid(box, s)
const val = (el, n = 'val') => el?.getAttributeNS(NS.w, n) || null
const tblBox = (t) => kid(kid(t, 'tblPr'), 'tblBorders')
const tcBox = (tc) => kid(kid(tc, 'tcPr'), 'tcBorders')
const byPid = (d, id) => desc(d, 'p', NS.w).find((p) => p.getAttributeNS(NS.w14, 'paraId') === id)

describe('rule: docx borders', { timeout: 30_000 }, () => {
  const O = fx('docx-borders.O.docx')
  const B = fx('docx-borders.B.docx')

  it('table, cell, paragraph and page borders go back to the original styles when untouched', async () => {
    const { bytes } = await restore(O, B, fx('docx-borders.S-tableA-edits.docx'), 'docx')
    await expectValid(bytes)
    const [t1o, t2o] = (await tables(O)).slice(1)
    const [t1, t2] = (await tables(bytes)).slice(1)
    for (const s of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) expect(val(side(tblBox(t1), s)), s).toBe(val(side(tblBox(t1o), s)))
    expect(val(side(tblBox(t1), 'top'))).toBe('double')
    const cellsO = desc(t2o, 'tc', NS.w)
    const cells = desc(t2, 'tc', NS.w)
    cellsO.forEach((c, i) => expect(val(side(tcBox(cells[i]), 'top'))).toBe(val(side(tcBox(c), 'top'))))
    // paragraph border: top double, bottom dashed, color auto (the editor wrote 000000)
    const p = desc(await doc(bytes), 'p', NS.w).find((x) => x.textContent.startsWith('문단 테두리'))
    const pb = kid(kid(p, 'pPr'), 'pBdr')
    expect(val(side(pb, 'top'))).toBe('double')
    expect(val(side(pb, 'bottom'))).toBe('dashed')
    expect(val(side(pb, 'top'), 'color')).toBe('auto')
    const pg = kid(desc(await doc(bytes), 'sectPr', NS.w).at(-1), 'pgBorders')
    expect(val(side(pg, 'top'))).toBe('double')
  })

  it('real edit with a new row: new cells inherit the line style of the cell above', async () => {
    const { bytes } = await restore(O, fx('docx-borders.B2.docx'), fx('docx-borders.S2-tableB-newrow.docx'), 'docx')
    await expectValid(bytes)
    const t = (await tables(bytes))[2]
    const rows = kids(t, 'tr')
    const newRow = rows.findIndex((r) => r.textContent.includes('새 행 칸'))
    expect(newRow).toBeGreaterThan(0)
    kids(rows[newRow], 'tc').forEach((tc, c) => {
      const up = kids(rows[newRow - 1], 'tc')[c]
      expect(val(side(tcBox(tc), 'top'))).toBe(val(side(tcBox(up), 'top')))
      expect(val(side(tcBox(tc), 'top'))).not.toBe('single')
    })
    // tcPr children in schema order (the editor writes tcBorders before tcW)
    const tcPr = kid(kids(rows[0], 'tc')[0], 'tcPr')
    expect(kids(tcPr).map((c) => c.localName).indexOf('tcW')).toBeLessThan(kids(tcPr).map((c) => c.localName).indexOf('tcBorders'))
  })

  it('keeps a border the user changed (attribute level) and restores the rest', async () => {
    const S = await tweak(B, DOC, (d) => {
      const t = desc(d, 'tbl', NS.w)[1]
      side(tblBox(t), 'top').setAttributeNS(NS.w, 'w:sz', '24') // user made the top line thicker
    })
    const { bytes, report } = await restore(O, B, S, 'docx')
    const t = (await tables(bytes))[1]
    expect(val(side(tblBox(t), 'top'), 'sz')).toBe('24')
    expect(val(side(tblBox(t), 'top'))).toBe('double') // style still restored: the editor's "single" was untouched
    expect(report.userChanged.map((r) => r.id)).toContain('docx-borders')
  })

  it('a new paragraph inherits pBdr from the previous paragraph', async () => {
    const S = await tweak(B, DOC, (d) => {
      const p = desc(d, 'p', NS.w).find((x) => x.textContent.startsWith('문단 테두리'))
      const n = p.cloneNode(true)
      n.setAttributeNS(NS.w14, 'w14:paraId', '1A2B3C4D')
      for (const t of desc(n, 't', NS.w)) t.textContent = '새 문단'
      p.parentNode.insertBefore(n, p.nextSibling)
    })
    const { bytes } = await restore(O, B, S, 'docx')
    const pb = kid(kid(byPid(await doc(bytes), '1A2B3C4D'), 'pPr'), 'pBdr')
    expect(val(side(pb, 'top'))).toBe('double')
    expect(val(side(pb, 'bottom'))).toBe('dashed')
  })

  it('is idempotent', async () => {
    await expectIdempotent(O, fx('docx-borders.B2.docx'), fx('docx-borders.S2-tableB-newrow.docx'), 'docx')
    await expectIdempotent(O, B, fx('docx-borders.S-tableA-edits.docx'), 'docx')
  })
})
