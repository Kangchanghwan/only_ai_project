/**
 * docx content controls (w:sdt). The editor drops w:text (with w:multiLine) and the date's
 * w:storeMappedDataAs, adds w15:appearance="boundingBox" and an empty w:rPr, and writes sdtPr / date
 * children out of schema order. Anchor: w:id.
 */
import { NS, kids, kid, desc, attr, canon } from '../xml.js'
import { SDT_TYPES } from '../check/signature.js'
import { sortChildren } from './util.js'

const PR_ORDER = ['rPr', 'alias', 'tag', 'id', 'lock', 'placeholder', 'temporary', 'showingPlcHdr', 'dataBinding', 'label', 'tabIndex']
const DATE_ORDER = ['dateFormat', 'lid', 'storeMappedDataAs', 'calendar']

const byId = (doc) => {
  const m = new Map()
  for (const pr of desc(doc, 'sdtPr', NS.w)) {
    const id = attr(kid(pr, 'id'), 'val')
    if (id != null && !m.has(id)) m.set(id, pr)
  }
  return m
}
const typeOf = (pr) => kids(pr).find((c) => SDT_TYPES.has(c.localName)) || null

/** Schema order of sdtPr: known W elements, then extension elements, then the type choice last. */
export function orderSdtPr(pr) {
  const ch = kids(pr)
  const rank = (c) => {
    if (SDT_TYPES.has(c.localName)) return 100
    const i = PR_ORDER.indexOf(c.localName)
    return c.namespaceURI === NS.w && i >= 0 ? i : 50
  }
  const sorted = ch.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0])
  if (sorted.some((c, i) => c !== ch[i])) {
    for (const c of ch) pr.removeChild(c)
    for (const c of sorted) pr.appendChild(c)
    return true
  }
  return false
}

export default {
  id: 'docx-content-controls',
  label: '입력 칸(내용 컨트롤)',
  formats: ['docx'],
  run(ctx) {
    const part = 'word/document.xml'
    const S = ctx.S.xml(part)
    const MO = byId(ctx.O.xml(part))
    const MB = byId(ctx.B.xml(part))
    let restored = 0
    let user = 0
    let touched = false
    for (const [id, sPr] of byId(S)) {
      const oPr = MO.get(id)
      const bPr = MB.get(id)
      if (!oPr || !bPr) continue
      let fixed = false
      const oT = typeOf(oPr)
      const bT = typeOf(bPr)
      const sT = typeOf(sPr)
      if (oT && !bT && !sT) {
        // type element lost by the editor and the user did not pick another type
        sPr.appendChild(S.importNode(oT, true))
        fixed = true
      } else if (oT && bT && sT && oT.localName === bT.localName && sT.localName === bT.localName) {
        // children lost inside the type element (e.g. date storeMappedDataAs), in O's order
        const get = (t, ln) => kids(t, ln)[0]
        const out = []
        for (const oc of kids(oT)) {
          const sc = get(sT, oc.localName)
          if (sc) { if (!out.includes(sc)) out.push(sc) } else if (!get(bT, oc.localName)) { out.push(S.importNode(oc, true)); fixed = true }
        }
        for (const sc of kids(sT)) if (!out.includes(sc)) out.push(sc)
        for (const c of kids(sT)) sT.removeChild(c)
        for (const c of out) sT.appendChild(c)
        // attributes lost on the type element (e.g. w:text w:multiLine)
        for (const a of Array.from(oT.attributes)) {
          if (a.name.startsWith('xmlns')) continue
          if (!sT.hasAttributeNS(a.namespaceURI, a.localName) && !bT.hasAttributeNS(a.namespaceURI, a.localName)) { sT.setAttributeNS(a.namespaceURI, a.name, a.value); fixed = true }
        }
      } else if (sT && bT && sT.localName !== bT.localName) user++
      // elements the editor added (absent in O, identical in B and S): appearance, empty rPr
      for (const sc of kids(sPr)) {
        if (SDT_TYPES.has(sc.localName)) continue
        if (kids(oPr, sc.localName).length) continue
        const bc = kids(bPr, sc.localName)[0]
        if (!bc || canon(bc) !== canon(sc)) continue
        if (sc.localName === 'appearance' || (sc.localName === 'rPr' && sc.children.length === 0)) { sPr.removeChild(sc); fixed = true }
      }
      if (fixed) restored++
    }
    for (const pr of desc(S, 'sdtPr', NS.w)) if (orderSdtPr(pr)) touched = true
    for (const d of desc(S, 'date', NS.w)) if (d.parentNode.localName === 'sdtPr' && sortChildren(d, DATE_ORDER)) touched = true
    if (restored || touched) ctx.S.touch(part)
    if (restored) ctx.restored(this, restored)
    if (user) ctx.userChanged(this, user)
  },
}
