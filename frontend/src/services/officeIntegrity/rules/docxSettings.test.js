// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectIdempotent } from '../testUtil.js'
import { kid, attr } from '../xml.js'

const tfl = async (bytes) => kid((await pkg(bytes)).xml('word/settings.xml').documentElement, 'themeFontLang')

describe('rule: docx themeFontLang', () => {
  it('eastAsia zh-CN written by the editor goes back to ko-KR', async () => {
    expect(attr(await tfl(fx('docx-t1.B.docx')), 'eastAsia')).toBe('zh-CN')
    const { bytes } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
    expect(attr(await tfl(bytes), 'eastAsia')).toBe('ko-KR')
  })

  it('keeps a value the user changed', async () => {
    const S = await tweak(fx('docx-t1.B.docx'), 'word/settings.xml', (d) => kid(d.documentElement, 'themeFontLang').setAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:eastAsia', 'ja-JP'))
    const { bytes } = await restore(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), S, 'docx')
    expect(attr(await tfl(bytes), 'eastAsia')).toBe('ja-JP')
  })

  it('is idempotent', async () => {
    await expectIdempotent(fx('docx-t1.O.docx'), fx('docx-t1.B.docx'), fx('docx-t1.S-edited.docx'), 'docx')
  })
})
