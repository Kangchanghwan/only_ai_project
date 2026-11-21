/**
 * Small per-sheet attributes the editor rewrites:
 *  - pageSetup orientation / paperSize (added as portrait / 9 when the original had none)
 *  - hyperlink display text (dropped on internal links)
 * Attribute-level three-way; sheets matched by name, hyperlinks by cell reference.
 */
import { NS, kids, kid, desc, attr } from '../xml.js'
import { mergeAttrs } from './util.js'
import { sheetsOf } from './xlsxShared.js'

export default {
  id: 'xlsx-sheet-attrs',
  label: '인쇄 설정·링크 표시 글',
  formats: ['xlsx'],
  run(ctx) {
    const SO = sheetsOf(ctx.O)
    const SB = sheetsOf(ctx.B)
    let restored = 0
    let user = 0
    for (const [name, sp] of sheetsOf(ctx.S)) {
      const o = ctx.O.xml(SO.get(name))
      const b = ctx.B.xml(SB.get(name))
      const s = ctx.S.xml(sp)
      if (!o || !b || !s) continue
      let changed = 0
      const sPs = kid(s.documentElement, 'pageSetup')
      if (sPs) {
        const r = mergeAttrs(sPs, kid(o.documentElement, 'pageSetup'), kid(b.documentElement, 'pageSetup'), ['orientation', 'paperSize'], null, null)
        changed += r.restored
        user += r.user
      }
      const links = (d) => new Map(desc(d, 'hyperlink', NS.x).map((h) => [attr(h, 'ref'), h]))
      const LO = links(o)
      const LB = links(b)
      for (const [ref, h] of links(s)) {
        if (!LO.has(ref) || !LB.has(ref)) continue
        const r = mergeAttrs(h, LO.get(ref), LB.get(ref), ['display', 'tooltip'], null, null)
        changed += r.restored
        user += r.user
      }
      if (changed) { ctx.S.touch(sp); restored += changed }
    }
    if (restored) ctx.restored(this, restored)
    if (user) ctx.userChanged(this, user)
  },
}
