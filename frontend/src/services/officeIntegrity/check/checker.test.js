// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, sig, expectValid, extOf } from '../testUtil.js'
import { precheck } from '../index.js'
import { diffKeys } from './compare.js'

// [original, baseline, saved] from real editor runs
const TRIPLES = [
  ['docx-t1.O.docx', 'docx-t1.B.docx', 'docx-t1.S-edited.docx'],
  ['docx-t1c.O.docx', 'docx-t1c.B.docx', 'docx-t1c.B.docx'],
  ['docx-ft.O.docx', 'docx-ft.B.docx', 'docx-ft.B.docx'],
  ['docx-borders.O.docx', 'docx-borders.B.docx', 'docx-borders.S-tableA-edits.docx'],
  ['docx-borders.O.docx', 'docx-borders.B2.docx', 'docx-borders.S2-tableB-newrow.docx'],
  ['docx-sdt.O.docx', 'docx-sdt.B.docx', 'docx-sdt.S-typed.docx'],
  ['docx-formfields.O.docx', 'docx-formfields.B.docx', 'docx-formfields.B.docx'],
  ['xlsx-notes.O.xlsx', 'xlsx-notes.B.xlsx', 'xlsx-notes.B.xlsx'],
  ['xlsx-notes.O.xlsx', 'xlsx-notes.B.xlsx', 'xlsx-notes.S-newcomment.xlsx'],
  ['xlsx-notes.O.xlsx', 'xlsx-notes.B.xlsx', 'xlsx-notes.S-editednote.xlsx'],
  ['xlsx-ft.O.xlsx', 'xlsx-ft.B.xlsx', 'xlsx-ft.B.xlsx'],
  ['xlsx-borders.O.xlsx', 'xlsx-borders.B.xlsx', 'xlsx-borders.B.xlsx'],
  ['pptx-t3.O.pptx', 'pptx-t3.B.pptx', 'pptx-t3.B.pptx'],
  ['pptx-ft.O.pptx', 'pptx-ft.B.pptx', 'pptx-ft.B.pptx'],
  ['pptx-tablelines.O.pptx', 'pptx-tablelines.B.pptx', 'pptx-tablelines.B.pptx'],
]

describe('integrity checker', { timeout: 30_000 }, () => {
  it.each(TRIPLES)('%s + %s + %s: nothing editor-caused remains, output is valid', async (o, b, s) => {
    const O = fx(o)
    const B = fx(b)
    const { bytes, report } = await restore(O, B, fx(s), extOf(o))
    expect(report.errors).toEqual([])
    expect(report.remaining).toEqual([])
    await expectValid(bytes)
    // the editor did change something in every fixture
    expect(diffKeys(await sig(O), await sig(B)).length).toBeGreaterThan(0)
  })

  it.each(TRIPLES.filter((t) => t[1] === t[2]))('untouched save of %s gives back the original semantics', async (o, b) => {
    const { bytes } = await restore(fx(o), fx(b), fx(b), extOf(o))
    expect(diffKeys(await sig(fx(o)), await sig(bytes))).toEqual([])
  })

  it('precheck lists only what no rule restores', async () => {
    expect((await precheck({ original: fx('docx-t1.O.docx'), baseline: fx('docx-t1.B.docx'), ext: 'docx', ctx: { prepared: fx('docx-t1.O.docx'), addedParaIds: [] } })).items).toEqual([])
    // an editor change with no rule (here: a paragraph's text) is reported
    const { tweak } = await import('../testUtil.js')
    const B = await tweak(fx('docx-ft.B.docx'), 'word/document.xml', (d) => { const t = d.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')[0]; t.textContent = t.textContent + '?' })
    const { items } = await precheck({ original: fx('docx-ft.O.docx'), baseline: B, ext: 'docx', ctx: { prepared: fx('docx-ft.O.docx'), addedParaIds: [] } })
    expect(items.length).toBe(1)
    expect(items[0].label).toBe('문단 내용')
  })

  it('user edits are not reported as remaining', async () => {
    const { report } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    expect(diffKeys(await sig(fx('docx-t1.B.docx')), await sig(fx('docx-t1.S-edited.docx'))).length).toBeGreaterThan(0)
    expect(report.remaining).toEqual([])
  })
})
