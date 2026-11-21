// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectIdempotent } from '../testUtil.js'
import { kids, kid, attr } from '../xml.js'

const font0 = async (bytes) => { const p = await pkg(bytes); return kids(kid(p.xml('xl/styles.xml').documentElement, 'fonts'), 'font')[0] }

describe('rule: xlsx default font', { timeout: 30_000 }, () => {
  it('Calibri written by the editor goes back to 맑은 고딕', async () => {
    expect(attr(kid(await font0(fx('xlsx-notes.B.xlsx')), 'name'), 'val')).toBe('Calibri')
    const { bytes } = await restore(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.S-newcomment.xlsx'), 'xlsx')
    expect(attr(kid(await font0(bytes), 'name'), 'val')).toBe('맑은 고딕')
  })

  it('keeps a default font the user changed', async () => {
    const S = await tweak(fx('xlsx-notes.B.xlsx'), 'xl/styles.xml', (d) => kid(kids(kid(d.documentElement, 'fonts'), 'font')[0], 'name').setAttribute('val', '돋움'))
    const { bytes } = await restore(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), S, 'xlsx')
    expect(attr(kid(await font0(bytes), 'name'), 'val')).toBe('돋움')
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.B.xlsx'), 'xlsx')
  })
})
