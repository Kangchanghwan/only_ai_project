// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, kids, kid, attr, NS } from '../xml.js'

describe('rule: docx embedded fonts', () => {
  it('copies the font part, fontTable entry, relationship, settings flags and content type back', async () => {
    const O = fx('docx-t1.O.docx')
    const { bytes } = await restore(O, fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    const p = await expectValid(bytes)
    const font = desc(p.xml('word/fontTable.xml'), 'font', NS.w).find((f) => attr(f, 'name') === 'NanumGothic')
    const emb = kid(font, 'embedRegular')
    expect(emb).toBeTruthy()
    const rel = p.relById('word/fontTable.xml', emb.getAttributeNS(NS.r, 'id'))
    expect(Buffer.from(p.bytes(rel.part)).equals(Buffer.from((await pkg(O)).bytes('word/fonts/font1.odttf')))).toBe(true)
    expect(attr(emb, 'fontKey')).toBe('{6C3A1F2B-9D4E-4B7A-8E21-3F5A7C9B0D12}')
    expect(p.defaultType('odttf')).toBe('application/vnd.openxmlformats-officedocument.obfuscatedFont')
    const st = p.xml('word/settings.xml').documentElement
    expect(kids(st, 'embedTrueTypeFonts').length).toBe(1)
    expect(kids(st, 'saveSubsetFonts').length).toBe(1)
    // schema order: the flags come before e.g. defaultTabStop
    const names = kids(st).map((c) => c.localName)
    if (names.includes('defaultTabStop')) expect(names.indexOf('embedTrueTypeFonts')).toBeLessThan(names.indexOf('defaultTabStop'))
  })

  it('does nothing when the original had no embedded fonts', async () => {
    const { report } = await restore(fx('docx-ft.O.docx'), fx('docx-ft.B.docx'), fx('docx-ft.B.docx'), 'docx')
    expect(report.restored.map((r) => r.id)).not.toContain('docx-embedded-fonts')
  })

  it('is idempotent (no second copy of the font)', async () => {
    const r = await expectIdempotent(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    const p = await pkg(r.bytes)
    expect(p.names().filter((n) => n.startsWith('word/fonts/')).length).toBe(1)
  })
})
