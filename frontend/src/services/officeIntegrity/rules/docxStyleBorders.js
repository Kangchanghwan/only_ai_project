/**
 * Borders defined in styles.xml (table styles, including conditional tblStylePr parts, and paragraph styles),
 * matched by style name. Same attribute-level three-way as body borders.
 * No real editor output collapsed a table style in our fixtures; covered by a synthetic test.
 */
import { NS, kids, kid, desc, attr } from '../xml.js'
import { mergeBox } from './docxBorderMerge.js'

const BOXES = ['tblBorders', 'tcBorders', 'pBdr']

function boxesOf(style) {
  const m = new Map()
  for (const ln of BOXES) {
    for (const box of desc(style, ln, NS.w)) {
      const cond = box.parentNode.parentNode?.localName === 'tblStylePr' ? attr(box.parentNode.parentNode, 'type') : ''
      m.set(cond + '/' + ln, box)
    }
  }
  return m
}
const byName = (doc) => new Map(desc(doc, 'style', NS.w).map((s) => [(attr(kid(s, 'name'), 'val') || '').toLowerCase() + '|' + attr(s, 'type'), s]))

export default {
  id: 'docx-style-borders',
  label: '스타일 테두리',
  formats: ['docx'],
  run(ctx) {
    const part = ctx.S.relByType('word/document.xml', 'styles')?.part || 'word/styles.xml'
    const s = ctx.S.xml(part)
    const o = ctx.O.xml(ctx.O.relByType('word/document.xml', 'styles')?.part || 'word/styles.xml')
    const b = ctx.B.xml(ctx.B.relByType('word/document.xml', 'styles')?.part || 'word/styles.xml')
    if (!s || !o || !b) return
    const SO = byName(o)
    const SB = byName(b)
    let restored = 0
    let user = 0
    for (const [name, sStyle] of byName(s)) {
      const oStyle = SO.get(name)
      const bStyle = SB.get(name)
      if (!oStyle || !bStyle) continue
      const bo = boxesOf(oStyle)
      const bb = boxesOf(bStyle)
      const bs = boxesOf(sStyle)
      for (const [k, sBox] of bs) {
        if (!bo.has(k) || !bb.has(k)) continue
        const r = mergeBox(s, sBox.parentNode, kids(sBox)[0]?.localName, sBox, bo.get(k), bb.get(k))
        restored += r.restored
        user += r.user
      }
    }
    if (restored) { ctx.S.touch(part); ctx.restored(this, restored) }
    if (user) ctx.userChanged(this, user)
  },
}
