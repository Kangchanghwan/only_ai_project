// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { kids, NS } from '../xml.js'

const core = async (bytes) => {
  const d = (await pkg(bytes)).xml('docProps/core.xml')
  return Object.fromEntries(kids(d.documentElement).map((e) => [e.localName, e.textContent]))
}

describe('rule: document properties (core.xml)', () => {
  it('Word Online style original: wiped title/creator/keywords/created come back, Guest becomes the original author', async () => {
    const { bytes } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    const c = await core(bytes)
    const o = await core(fx('docx-t1.O.docx'))
    for (const k of ['title', 'creator', 'keywords', 'lastModifiedBy', 'created']) expect(c[k], k).toBe(o[k])
    // S keeps its cp: structure and its own modified time
    const d = (await pkg(bytes)).xml('docProps/core.xml')
    expect(d.documentElement.prefix).toBe('cp')
    expect(kids(d.documentElement, 'lastModifiedBy')[0].namespaceURI).toBe(NS.cp)
    expect(c.modified).toBe((await core(fx('docx-t1.S-edited.docx'))).modified)
    await expectValid(bytes)
  })

  it('desktop style original (cp:): only lastModifiedBy needed', async () => {
    const { bytes } = await restore(fx('docx-t1c.O.docx'), fx('docx-t1c.B.docx'), fx('docx-t1c.B.docx'), 'docx')
    expect((await core(bytes)).lastModifiedBy).toBe('dummy')
  })

  it('keeps a title the user changed', async () => {
    const S = await tweak(fx('docx-t1c.B.docx'), 'docProps/core.xml', (d) => { kids(d.documentElement, 'title')[0].textContent = '새 제목' })
    const { bytes, report } = await restore(fx('docx-t1c.O.docx'), fx('docx-t1c.B.docx'), S, 'docx')
    expect((await core(bytes)).title).toBe('새 제목')
    expect(report.userChanged.map((r) => r.id)).toContain('core-props')
  })

  it('xlsx and pptx too, and idempotent', async () => {
    for (const [o, b] of [['xlsx-ft.O.xlsx', 'xlsx-ft.B.xlsx'], ['pptx-ft.O.pptx', 'pptx-ft.B.pptx']]) {
      const r = await expectIdempotent(fx(o), fx(b), fx(b), o.split('.').pop())
      expect((await core(r.bytes)).lastModifiedBy).toBe((await core(fx(o))).lastModifiedBy)
    }
  })
})
