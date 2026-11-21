// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, pkg, sig, expectValid } from '../testUtil.js'
import { prepareForEditor, restoreAfterSave } from '../index.js'
import { desc, NS, isWellFormed } from '../xml.js'

const ids = async (bytes) => desc((await pkg(bytes)).xml('word/document.xml'), 'p', NS.w).map((p) => p.getAttributeNS(NS.w14, 'paraId'))

describe('docx paragraph id preparation', () => {
  it('adds ids only where missing, detecting Office Online wp14:paraId by namespace', async () => {
    const O = fx('docx-t1.O.docx')
    const text = (await pkg(O)).text('word/document.xml')
    expect(text).toMatch(/wp14:paraId=/) // Office Online: wp14 bound to the w14 namespace on some paragraphs
    const before = await ids(O)
    const { bytes, ctx } = await prepareForEditor(O, 'docx')
    const after = await ids(bytes)
    expect(after.every(Boolean)).toBe(true)
    expect(ctx.addedParaIds.length).toBe(before.filter((x) => !x).length)
    expect(new Set(after).size).toBe(after.length)
    for (const id of ctx.addedParaIds) expect(parseInt(id, 16)).toBeLessThan(0x80000000)
    const xml = (await pkg(bytes)).text('word/document.xml')
    expect(isWellFormed(xml)).toBe(true)
    expect(xml).not.toMatch(/<w:p [^>]*paraId="[^"]*"[^>]*paraId=/)
    await expectValid(bytes)
  })

  it('is a no-op for xlsx/pptx and for a fully prepared docx', async () => {
    const x = fx('xlsx-ft.O.xlsx')
    expect((await prepareForEditor(x, 'xlsx')).bytes).toBe(x)
    const once = await prepareForEditor(fx('docx-t1.O.docx'), 'docx')
    const twice = await prepareForEditor(once.bytes, 'docx')
    expect(twice.ctx.addedParaIds).toEqual([])
  })

  it('removes the added ids after restore', async () => {
    const O = fx('docx-t1.O.docx')
    const { bytes: P, ctx } = await prepareForEditor(O, 'docx')
    // the editor keeps paragraph ids: simulate B and S as the prepared file itself
    const { bytes } = await restoreAfterSave({ original: O, baseline: P, saved: P, ext: 'docx', ctx })
    const left = await ids(bytes)
    for (const id of ctx.addedParaIds) expect(left).not.toContain(id)
    expect(await sig(bytes)).toEqual(await sig(O))
  })
})
