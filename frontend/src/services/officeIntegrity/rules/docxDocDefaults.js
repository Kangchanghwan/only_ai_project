/**
 * styles.xml w:docDefaults. The editor drops children of the default run properties (e.g. w:kern) and adds
 * attributes/empty elements to the default paragraph properties. Child-element three-way inside
 * rPrDefault/rPr and pPrDefault/pPr.
 */
import { NS, kid, first } from '../xml.js'
import { mergeChildren } from './util.js'
import { PARENT_ORDER } from './docxBorderMerge.js'

const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath']

function box(doc, wrap, inner) {
  const dd = first(doc, 'docDefaults', NS.w)
  return kid(kid(dd, wrap), inner)
}

function ensureBox(doc, wrap, inner) {
  let dd = first(doc, 'docDefaults', NS.w)
  if (!dd) return null
  let w = kid(dd, wrap)
  if (!w) { w = doc.createElementNS(NS.w, 'w:' + wrap); if (wrap === 'rPrDefault') dd.insertBefore(w, dd.firstElementChild); else dd.appendChild(w) }
  let i = kid(w, inner)
  if (!i) { i = doc.createElementNS(NS.w, 'w:' + inner); w.appendChild(i) }
  return i
}

export default {
  id: 'docx-doc-defaults',
  label: '기본 글자·문단 서식',
  formats: ['docx'],
  run(ctx) {
    const part = 'word/styles.xml'
    const s = ctx.S.xml(part)
    const o = ctx.O.xml(part)
    const b = ctx.B.xml(part)
    if (!s || !o || !b) return
    let restored = 0
    let user = 0
    for (const [wrap, inner, order] of [['rPrDefault', 'rPr', RPR_ORDER], ['pPrDefault', 'pPr', PARENT_ORDER.pPr]]) {
      const ob = box(o, wrap, inner)
      if (!ob) continue
      const sb = box(s, wrap, inner) || ensureBox(s, wrap, inner)
      if (!sb) continue
      const r = mergeChildren(s, sb, ob, box(b, wrap, inner), order)
      restored += r.restored
      user += r.user
    }
    if (restored) { ctx.S.touch(part); ctx.restored(this, restored) }
    if (user) ctx.userChanged(this, user)
  },
}
