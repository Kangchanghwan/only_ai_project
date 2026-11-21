import { NS, kids, kid } from '../xml.js'

const PP = 'ppt/presentation.xml'

/** slide id (p:sldId@id) -> slide part */
export function slidesOf(pkg) {
  const m = new Map()
  const pr = pkg.xml(PP)
  for (const s of kids(kid(pr?.documentElement, 'sldIdLst'), 'sldId')) {
    const rel = pkg.relById(PP, s.getAttributeNS(NS.r, 'id'))
    if (rel?.part) m.set(s.getAttribute('id'), rel.part)
  }
  return m
}
