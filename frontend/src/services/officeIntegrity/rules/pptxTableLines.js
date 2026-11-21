/**
 * pptx table cell lines (a:lnL/lnR/lnT/lnB/lnTlToBr/lnBlToTr in a:tcPr). The editor drops a:prstDash and the
 * cmpd attribute (width and color are kept), and sometimes the whole line. Three-way at attribute and child level.
 * Anchors: slides by p:sldId@id, tables by graphicFrame p:cNvPr@name (ids are renumbered on every save, names
 * are kept), cells by row/column. When row counts differ, rows are aligned by their cell texts; new rows
 * inherit from the row above.
 */
import { NS, kids, kid, desc, attr, canon } from '../xml.js'
import { mergeAttrs, mergeChildren, sortChildren } from './util.js'
import { slidesOf } from './pptxShared.js'

const LINES = ['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr']
const TCPR_ORDER = [...LINES, 'cell3D', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'headers', 'extLst']
const LN_ORDER = ['noFill', 'solidFill', 'gradFill', 'pattFill', 'prstDash', 'custDash', 'round', 'bevel', 'miter', 'headEnd', 'tailEnd', 'extLst']

function tablesOf(doc) {
  const m = new Map()
  const seen = new Map()
  for (const gf of desc(doc, 'graphicFrame', NS.p)) {
    const tbl = desc(gf, 'tbl', NS.a)[0]
    if (!tbl) continue
    const name = attr(desc(gf, 'cNvPr', NS.p)[0], 'name') || ''
    const n = seen.get(name) || 0
    seen.set(name, n + 1)
    m.set(name + '#' + n, tbl)
  }
  return m
}

const rowText = (tr) => kids(tr, 'tc').map((c) => c.textContent).join('\u0001')

/** For each S row: matching B row index or -1 (new row). */
function alignRows(sRows, bRows) {
  if (sRows.length === bRows.length) return sRows.map((_, i) => i)
  const out = []
  let j = 0
  for (const r of sRows) {
    const t = rowText(r)
    let k = j
    while (k < bRows.length && rowText(bRows[k]) !== t) k++
    if (k < bRows.length) { out.push(k); j = k + 1 } else out.push(-1)
  }
  return out
}

function lineAttrNames(...els) {
  const s = new Set()
  for (const e of els) if (e) for (const a of Array.from(e.attributes)) if (!a.name.startsWith('xmlns')) s.add(a.localName)
  return [...s]
}

/** three-way for one line element; returns restored count */
function mergeLine(doc, sPr, ln, o, b, s) {
  if (s && b) {
    if (!o) { if (canon(s) === canon(b)) { sPr.removeChild(s); return { restored: 1, user: 0 } } return { restored: 0, user: 1 } }
    const ra = mergeAttrs(s, o, b, lineAttrNames(o, b, s), null, null)
    const rc = mergeChildren(doc, s, o, b, LN_ORDER)
    return { restored: ra.restored + rc.restored ? 1 : 0, user: ra.user + rc.user ? 1 : 0 }
  }
  if (!s && !b && o) { sPr.appendChild(doc.importNode(o, true)); sortChildren(sPr, TCPR_ORDER); return { restored: 1, user: 0 } }
  if (!s !== !b) return { restored: 0, user: 1 }
  return { restored: 0, user: 0 }
}

function tcPrOf(doc, tc) {
  let pr = kid(tc, 'tcPr')
  if (!pr) { pr = doc.createElementNS(NS.a, 'a:tcPr'); tc.appendChild(pr) }
  return pr
}

export default {
  id: 'pptx-table-lines',
  label: '표 선 모양',
  formats: ['pptx'],
  run(ctx) {
    const { O, B, S } = ctx
    const SO = slidesOf(O)
    const SB = slidesOf(B)
    let restored = 0
    let user = 0
    for (const [id, sp] of slidesOf(S)) {
      const o = O.xml(SO.get(id))
      const b = B.xml(SB.get(id))
      const s = S.xml(sp)
      if (!o || !b || !s) continue
      const TO = tablesOf(o)
      const TB = tablesOf(b)
      let changed = 0
      for (const [key, sT] of tablesOf(s)) {
        const oT = TO.get(key)
        const bT = TB.get(key)
        if (!oT || !bT) continue
        const oRows = kids(oT, 'tr')
        const bRows = kids(bT, 'tr')
        if (oRows.length !== bRows.length) continue
        const sRows = kids(sT, 'tr')
        const map = alignRows(sRows, bRows)
        const eff = new Map() // S row element -> { o: row element, b: row element } used for inheritance
        sRows.forEach((sr, ri) => {
          const bi = map[ri]
          if (bi >= 0) {
            eff.set(sr, { o: oRows[bi], b: bRows[bi] })
            kids(sr, 'tc').forEach((tc, ci) => {
              const oc = kids(oRows[bi], 'tc')[ci]
              const bc = kids(bRows[bi], 'tc')[ci]
              if (!oc || !bc) return
              const sPr = tcPrOf(s, tc)
              for (const ln of LINES) {
                const r = mergeLine(s, sPr, ln, kid(kid(oc, 'tcPr'), ln), kid(kid(bc, 'tcPr'), ln), kid(sPr, ln))
                changed += r.restored
                user += r.user
              }
            })
            return
          }
          // new row: inherit from the row above where its lines equal the above row's baseline lines
          const up = ri > 0 ? eff.get(sRows[ri - 1]) : null
          if (!up) return
          const before = sr.cloneNode(true)
          let inh = 0
          kids(sr, 'tc').forEach((tc, ci) => {
            const oc = kids(up.o, 'tc')[ci]
            const bc = kids(up.b, 'tc')[ci]
            if (!oc || !bc) return
            const sPr = tcPrOf(s, tc)
            for (const ln of LINES) {
              const sl = kid(sPr, ln)
              const bl = kid(kid(bc, 'tcPr'), ln)
              const ol = kid(kid(oc, 'tcPr'), ln)
              if ((sl ? canon(sl) : '') !== (bl ? canon(bl) : '')) continue
              if ((sl ? canon(sl) : '') === (ol ? canon(ol) : '')) continue
              if (sl) sPr.removeChild(sl)
              if (ol) sPr.appendChild(s.importNode(ol, true))
              inh++
            }
            sortChildren(sPr, TCPR_ORDER)
          })
          if (inh) { changed += inh; eff.set(sr, { o: sr, b: before }) }
        })
      }
      if (changed) { S.touch(sp); restored += changed }
    }
    if (restored) ctx.restored(this, restored)
    if (user) ctx.userChanged(this, user)
  },
}
