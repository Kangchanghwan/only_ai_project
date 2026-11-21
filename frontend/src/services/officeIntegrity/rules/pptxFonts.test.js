// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, expectValid, expectIdempotent } from '../testUtil.js'
import { kid, kids, NS } from '../xml.js'

const PP = 'ppt/presentation.xml'

describe('rule: pptx embedded fonts', () => {
  it('copies font part, embeddedFontLst, relationship and content type back', async () => {
    const O = fx('pptx-t3.O.pptx')
    const { bytes } = await restore(O, fx('pptx-t3.B.pptx'), fx('pptx-t3.B.pptx'), 'pptx')
    const p = await expectValid(bytes)
    const root = p.xml(PP).documentElement
    const ef = kids(kid(root, 'embeddedFontLst'), 'embeddedFont')
    expect(ef.length).toBe(1)
    expect(kid(ef[0], 'font').getAttribute('typeface')).toBe('NanumGothic')
    const rel = p.relById(PP, kid(ef[0], 'regular').getAttributeNS(NS.r, 'id'))
    expect(Buffer.from(p.bytes(rel.part)).equals(Buffer.from((await pkg(O)).bytes('ppt/fonts/font1.fntdata')))).toBe(true)
    expect(p.defaultType('fntdata')).toBe('application/x-fontdata')
    // schema order: embeddedFontLst sits after notesSz and before defaultTextStyle
    const order = kids(root).map((c) => c.localName)
    expect(order.indexOf('embeddedFontLst')).toBeGreaterThan(order.indexOf('notesSz'))
    expect(order.indexOf('embeddedFontLst')).toBeLessThan(order.indexOf('defaultTextStyle'))
  })

  it('is idempotent', async () => {
    const r = await expectIdempotent(fx('pptx-t3.O.pptx'), fx('pptx-t3.B.pptx'), fx('pptx-t3.B.pptx'), 'pptx')
    expect((await pkg(r.bytes)).names().filter((n) => n.startsWith('ppt/fonts/')).length).toBe(1)
  })
})
