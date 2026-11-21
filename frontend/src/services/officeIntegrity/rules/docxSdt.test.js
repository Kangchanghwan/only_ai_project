// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, kid, kids, attr, canon, NS } from '../xml.js'

const DOC = 'word/document.xml'
const prs = async (bytes) => new Map(desc((await pkg(bytes)).xml(DOC), 'sdtPr', NS.w).map((p) => [attr(kid(p, 'id'), 'val'), p]))

describe('rule: docx content controls', { timeout: 30_000 }, () => {
  const O = fx('docx-sdt.O.docx')
  const B = fx('docx-sdt.B.docx')

  it('real typed edits: types, attributes and order match the original', async () => {
    const { bytes } = await restore(O, B, fx('docx-sdt.S-typed.docx'), 'docx')
    await expectValid(bytes)
    const PO = await prs(O)
    const PS = await prs(bytes)
    for (const [id, o] of PO) {
      const s = PS.get(id)
      expect(kids(s).map((c) => c.localName), id).toEqual(kids(o).map((c) => c.localName))
      // type element and its children (on/off values like docPartUnique="true" are equivalent)
      expect(kids(kids(s).at(-1)).map((c) => c.localName), id).toEqual(kids(kids(o).at(-1)).map((c) => c.localName))
      if (kids(o).at(-1).localName !== 'docPartObj') expect(canon(kids(s).at(-1)), id).toBe(canon(kids(o).at(-1)))
    }
    // w:text with multiLine, date storeMappedDataAs, no appearance
    const all = [...PS.values()]
    expect(all.some((p) => kid(p, 'text')?.getAttributeNS(NS.w, 'multiLine') === '1')).toBe(true)
    const date = all.map((p) => kid(p, 'date')).find(Boolean)
    expect(kids(date).map((c) => c.localName)).toEqual(['dateFormat', 'lid', 'storeMappedDataAs', 'calendar'])
    expect(all.some((p) => kid(p, 'appearance'))).toBe(false)
  })

  it('keeps a type the user changed', async () => {
    const S = await tweak(B, DOC, (d) => {
      const pr = desc(d, 'sdtPr', NS.w).find((p) => attr(kid(p, 'tag'), 'val') === 'tag1')
      pr.appendChild(d.createElementNS(NS.w, 'w:richText'))
    })
    const { bytes } = await restore(O, B, S, 'docx')
    const pr = [...(await prs(bytes)).values()].find((p) => attr(kid(p, 'tag'), 'val') === 'tag1')
    expect(kid(pr, 'text')).toBeNull()
    expect(kid(pr, 'richText')).not.toBeNull()
  })

  it('is idempotent', async () => {
    await expectIdempotent(O, B, fx('docx-sdt.S-typed.docx'), 'docx')
  })
})
