// @vitest-environment jsdom
// Synthetic only: no real editor output in the fixtures collapsed a table style's borders.
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectIdempotent } from '../testUtil.js'
import { desc, kid, attr, NS } from '../xml.js'

const STY = 'word/styles.xml'
const grid = (d) => desc(d, 'style', NS.w).find((s) => attr(kid(s, 'name'), 'val') === 'Table Grid')
const top = (d) => kid(kid(kid(grid(d), 'tblPr'), 'tblBorders'), 'top')

describe('rule: docx style borders (synthetic)', { timeout: 30_000 }, () => {
  // O: Table Grid with a double top line. B and S: the editor collapsed it to single.
  const make = async () => {
    const O = await tweak(fx('docx-borders.O.docx'), STY, (d) => top(d).setAttributeNS(NS.w, 'w:val', 'double'))
    return { O, B: fx('docx-borders.B.docx') }
  }

  it('restores a collapsed table style border by style name', async () => {
    const { O, B } = await make()
    expect(attr(top((await pkg(B)).xml(STY)), 'val')).toBe('single')
    const { bytes } = await restore(O, B, B, 'docx')
    expect(attr(top((await pkg(bytes)).xml(STY)), 'val')).toBe('double')
  })

  it('keeps a style border the user changed', async () => {
    const { O, B } = await make()
    const S = await tweak(B, STY, (d) => top(d).setAttributeNS(NS.w, 'w:color', 'FF0000'))
    const { bytes } = await restore(O, B, S, 'docx')
    const t = top((await pkg(bytes)).xml(STY))
    expect(attr(t, 'color')).toBe('FF0000')
    expect(attr(t, 'val')).toBe('double')
  })

  it('is idempotent', async () => {
    const { O, B } = await make()
    await expectIdempotent(O, B, B, 'docx')
  })
})
