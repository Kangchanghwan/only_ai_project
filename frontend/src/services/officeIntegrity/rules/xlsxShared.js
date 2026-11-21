import { NS, desc, attr } from '../xml.js'

const WB = 'xl/workbook.xml'

/** sheet name -> worksheet part */
export function sheetsOf(pkg) {
  const wb = pkg.xml(WB)
  const m = new Map()
  for (const s of desc(wb, 'sheet', NS.x)) {
    const rel = pkg.relById(WB, s.getAttributeNS(NS.r, 'id'))
    if (rel?.part) m.set(attr(s, 'name'), rel.part)
  }
  return m
}

export const stylesPart = (pkg) => pkg.relByType(WB, 'styles')?.part || 'xl/styles.xml'
