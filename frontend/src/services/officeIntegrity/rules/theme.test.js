// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { first, canon, attr, kids } from '../xml.js'

const fontScheme = async (bytes, part) => first((await pkg(bytes)).xml(part), 'fontScheme')
const hang = (fs) => kids(first(fs, 'minorFont'), 'font').find((f) => attr(f, 'script') === 'Hang')

describe('rule: theme fonts', () => {
  it('docx: untouched font scheme goes back to the original (Hangul script fonts, empty ea)', async () => {
    const O = fx('docx-t1.O.docx')
    const { bytes, report } = await restore(O, fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    const out = await fontScheme(bytes, 'word/theme/theme1.xml')
    expect(canon(out)).toBe(canon(await fontScheme(O, 'word/theme/theme1.xml')))
    expect(attr(hang(out), 'typeface')).toBe('맑은 고딕')
    expect(report.restored.map((r) => r.id)).toContain('theme-fonts')
    await expectValid(bytes)
  })

  it('xlsx and pptx (slide master and notes master themes)', async () => {
    for (const [o, b, part] of [['xlsx-ft.O.xlsx', 'xlsx-ft.B.xlsx', 'xl/theme/theme1.xml'], ['pptx-t3.O.pptx', 'pptx-t3.B.pptx', 'ppt/theme/theme1.xml']]) {
      const O = fx(o)
      const { bytes } = await restore(O, fx(b), fx(b), o.split('.').pop())
      const p = await pkg(bytes)
      const sPart = o.endsWith('xlsx') ? p.relByType('xl/workbook.xml', 'theme').part : part
      expect(canon(first(p.xml(sPart), 'fontScheme'))).toBe(canon(await fontScheme(O, part)))
    }
    // the editor adds theme2.xml for the notes master; it gets the master's original scheme too
    const p = await pkg((await restore(fx('pptx-t3.O.pptx'), fx('pptx-t3.B.pptx'), fx('pptx-t3.B.pptx'), 'pptx')).bytes)
    const nm = p.relByType('ppt/presentation.xml', 'notesMaster')
    if (nm) expect(attr(first(first(p.xml(p.relByType(nm.part, 'theme').part), 'minorFont'), 'ea'), 'typeface')).not.toBe('Arial')
  })

  it('keeps a font scheme the user changed', async () => {
    const S = await tweak(fx('docx-t1.B.docx'), 'word/theme/theme1.xml', (d) => first(first(d, 'minorFont'), 'latin').setAttribute('typeface', '바탕'))
    const { bytes, report } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), S, 'docx')
    expect(attr(first(await fontScheme(bytes, 'word/theme/theme1.xml'), 'minorFont').getElementsByTagName('*')[0], 'typeface')).toBe('바탕')
    expect(report.userChanged.map((r) => r.id)).toContain('theme-fonts')
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
  })
})
