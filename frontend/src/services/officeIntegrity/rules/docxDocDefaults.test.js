// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectIdempotent } from '../testUtil.js'
import { first, kid, kids, canon, NS } from '../xml.js'

const rPr = async (bytes) => kid(first(first((await pkg(bytes)).xml('word/styles.xml'), 'docDefaults'), 'rPrDefault'), 'rPr')
const pPr = async (bytes) => kid(first(first((await pkg(bytes)).xml('word/styles.xml'), 'docDefaults'), 'pPrDefault'), 'pPr')

describe('rule: docx docDefaults', () => {
  it('w:kern dropped by the editor comes back; editor additions to pPrDefault go away', async () => {
    const O = fx('docx-t1.O.docx')
    expect(kid(await rPr(fx('docx-t1.B.docx')), 'kern')).toBeNull()
    const { bytes } = await restore(O, fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    expect(canon(await rPr(bytes))).toBe(canon(await rPr(O)))
    expect(canon(await pPr(bytes))).toBe(canon(await pPr(O)))
    expect(kids(await rPr(bytes)).map((c) => c.localName)).toEqual(['rFonts', 'kern', 'sz', 'szCs', 'lang'])
  })

  it('keeps a default the user changed (child level)', async () => {
    const S = await tweak(fx('docx-t1.B.docx'), 'word/styles.xml', (d) => kid(kid(first(first(d, 'docDefaults'), 'rPrDefault'), 'rPr'), 'sz').setAttributeNS(NS.w, 'w:val', '24'))
    const { bytes } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), S, 'docx')
    const r = await rPr(bytes)
    expect(kid(r, 'sz').getAttributeNS(NS.w, 'val')).toBe('24')
    expect(kid(r, 'kern')).not.toBeNull() // other children still restored
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
  })
})
