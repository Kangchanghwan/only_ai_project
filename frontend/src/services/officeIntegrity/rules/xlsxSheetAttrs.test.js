// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectIdempotent } from '../testUtil.js'
import { desc, kid, attr, NS } from '../xml.js'

const SHEET = 'xl/worksheets/sheet2.xml'
const link = async (bytes) => desc((await pkg(bytes)).xml(SHEET), 'hyperlink', NS.x).find((h) => attr(h, 'ref') === 'A2')
const pageSetup = async (bytes, part = 'xl/worksheets/sheet1.xml') => kid((await pkg(bytes)).xml(part).documentElement, 'pageSetup')

describe('rule: xlsx page setup and link text', () => {
  it('internal link display text and print defaults come back', async () => {
    const { bytes } = await restore(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.B.xlsx'), 'xlsx')
    expect(attr(await link(bytes), 'display')).toBe('숨김 시트로')
    const ps = await pageSetup(bytes)
    expect(attr(ps, 'paperSize')).toBeUndefined()
    expect(attr(ps, 'orientation')).toBeUndefined()
  })

  it('keeps an orientation the user chose', async () => {
    const S = await tweak(fx('xlsx-notes.B.xlsx'), 'xl/worksheets/sheet1.xml', (d) => kid(d.documentElement, 'pageSetup').setAttribute('orientation', 'landscape'))
    const { bytes } = await restore(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), S, 'xlsx')
    expect(attr(await pageSetup(bytes), 'orientation')).toBe('landscape')
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.B.xlsx'), 'xlsx')
  })
})
