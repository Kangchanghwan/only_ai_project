/**
 * xlsx default font (first font in styles.xml). The editor turns 맑은 고딕 into Calibri, which changes every
 * cell that uses the default style. If S's first font equals B's, put O's first font back.
 */
import { kids, kid, canon } from '../xml.js'
import { stylesPart } from './xlsxShared.js'

export default {
  id: 'xlsx-default-font',
  label: '기본 글꼴',
  formats: ['xlsx'],
  run(ctx) {
    const sp = stylesPart(ctx.S)
    const s = ctx.S.xml(sp)
    const o = ctx.O.xml(stylesPart(ctx.O))
    const b = ctx.B.xml(stylesPart(ctx.B))
    const f0 = (d) => kids(kid(d?.documentElement, 'fonts'), 'font')[0] || null
    const sf = f0(s)
    const of = f0(o)
    const bf = f0(b)
    if (!sf || !of || !bf) return
    if (canon(sf) === canon(of)) return
    if (canon(sf) !== canon(bf)) { ctx.userChanged(this, 1); return }
    sf.parentNode.replaceChild(s.importNode(of, true), sf)
    ctx.S.touch(sp)
    ctx.restored(this, 1)
  },
}
