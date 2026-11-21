// @vitest-environment jsdom
// Real baseline from the editor; deleted and added slides are synthetic tweaks of B.
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, kid, kids, NS } from '../xml.js'

const PP = 'ppt/presentation.xml'
const sections = async (bytes) => desc((await pkg(bytes)).xml(PP), 'section', NS.p14).map((s) => s.getAttribute('name') + ':' + desc(s, 'sldId', NS.p14).map((x) => x.getAttribute('id')).join(','))

describe('rule: pptx sections', () => {
  const O = fx('pptx-t3.O.pptx')
  const B = fx('pptx-t3.B.pptx')

  it('restores the sections the editor dropped', async () => {
    expect(await sections(B)).toEqual([])
    const { bytes } = await restore(O, B, B, 'pptx')
    await expectValid(bytes)
    expect(await sections(bytes)).toEqual(['첫 구역:256', '둘째 구역:257,258'])
    // extLst is the last child of p:presentation
    expect(kids((await pkg(bytes)).xml(PP).documentElement).at(-1).localName).toBe('extLst')
  })

  it('drops deleted slides and puts new slides into the section of the preceding slide', async () => {
    const S = await tweak(B, PP, (d) => {
      const lst = kid(d.documentElement, 'sldIdLst')
      const [a, b] = kids(lst, 'sldId')
      lst.removeChild(b) // slide 257 deleted
      const n = a.cloneNode(true)
      n.setAttribute('id', '300') // new slide after the first one
      lst.insertBefore(n, a.nextSibling)
    })
    const { bytes } = await restore(O, B, S, 'pptx')
    expect(await sections(bytes)).toEqual(['첫 구역:256,300', '둘째 구역:258'])
  })

  it('is idempotent', async () => {
    await expectIdempotent(O, B, B, 'pptx')
  })
})
