// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, expectIdempotent } from '../testUtil.js'
import { desc, attr, NS } from '../xml.js'

const names = async (bytes) => desc((await pkg(bytes)).xml('xl/workbook.xml'), 'definedName', NS.x).map((d) => attr(d, 'name') + '=' + d.textContent)

describe('rule: xlsx defined names', { timeout: 30_000 }, () => {
  it('removes the exact duplicate _xlnm._FilterDatabase', async () => {
    const b = await names(fx('xlsx-notes.B.xlsx'))
    expect(b.filter((n) => n.startsWith('_xlnm._FilterDatabase')).length).toBe(2)
    const { bytes } = await restore(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.B.xlsx'), 'xlsx')
    expect((await names(bytes)).sort()).toEqual((await names(fx('xlsx-notes.O.xlsx'))).sort())
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('xlsx-notes.O.xlsx'), fx('xlsx-notes.B.xlsx'), fx('xlsx-notes.B.xlsx'), 'xlsx')
  })
})
