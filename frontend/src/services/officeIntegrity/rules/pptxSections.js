/**
 * pptx sections (p14:sectionLst in presentation.xml extLst). The editor drops them.
 * If absent in both B and S, restore O's: keep only slide ids present in S, and put slides that O does not
 * know into the section of the preceding slide.
 */
import { NS, kids, kid, desc } from '../xml.js'

const PP = 'ppt/presentation.xml'
const SECTION_EXT = '{521415D9-36F7-43E2-AB2F-B90AF26B5E84}'

const sectionExt = (doc) => kids(kid(doc?.documentElement, 'extLst'), 'ext').find((e) => e.getAttribute('uri') === SECTION_EXT) || null

export default {
  id: 'pptx-sections',
  label: '슬라이드 구역',
  formats: ['pptx'],
  run(ctx) {
    const o = ctx.O.xml(PP)
    const s = ctx.S.xml(PP)
    const b = ctx.B.xml(PP)
    if (!o || !s) return
    const oExt = sectionExt(o)
    if (!oExt) return
    if (sectionExt(b) || sectionExt(s)) { if (!sectionExt(b) && sectionExt(s)) ctx.userChanged(this, 1); return }
    const sIds = kids(kid(s.documentElement, 'sldIdLst'), 'sldId').map((e) => e.getAttribute('id'))
    const ext = s.importNode(oExt, true)
    const sections = desc(ext, 'section', NS.p14)
    const where = new Map() // slide id -> section element (from O)
    for (const sec of sections) for (const id of desc(sec, 'sldId', NS.p14).map((e) => e.getAttribute('id'))) where.set(id, sec)
    // walk S's slide order and assign every slide to a section
    const assign = new Map(sections.map((sec) => [sec, []]))
    let cur = sections[0]
    for (const id of sIds) {
      if (where.has(id)) cur = where.get(id)
      if (cur) assign.get(cur).push(id)
    }
    for (const sec of sections) {
      let lst = kid(sec, 'sldIdLst')
      if (!lst) { lst = s.createElementNS(NS.p14, 'p14:sldIdLst'); sec.appendChild(lst) }
      for (const c of kids(lst)) lst.removeChild(c)
      for (const id of assign.get(sec)) {
        const e = s.createElementNS(NS.p14, lst.prefix ? lst.prefix + ':sldId' : 'p14:sldId')
        e.setAttribute('id', id)
        lst.appendChild(e)
      }
    }
    let extLst = kid(s.documentElement, 'extLst')
    if (!extLst) { extLst = s.createElementNS(NS.p, 'p:extLst'); s.documentElement.appendChild(extLst) }
    extLst.insertBefore(ext, extLst.firstElementChild)
    ctx.S.touch(PP)
    ctx.restored(this, 1)
  },
}
