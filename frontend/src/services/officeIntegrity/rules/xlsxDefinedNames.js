/** xlsx workbook definedNames: the editor writes an exact duplicate of _xlnm._FilterDatabase. Remove exact duplicates. */
import { NS, desc, canon } from '../xml.js'

export default {
  id: 'xlsx-defined-names',
  label: '이름 정의 중복',
  formats: ['xlsx'],
  run(ctx) {
    const part = 'xl/workbook.xml'
    const s = ctx.S.xml(part)
    if (!s) return
    const seen = new Set()
    let n = 0
    for (const d of desc(s, 'definedName', NS.x)) {
      const k = canon(d)
      if (seen.has(k)) { d.parentNode.removeChild(d); n++ } else seen.add(k)
    }
    if (n) { ctx.S.touch(part); ctx.restored(this, n) }
  },
}
