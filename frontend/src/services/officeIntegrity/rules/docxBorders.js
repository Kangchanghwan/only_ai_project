/**
 * docx borders in the body: table (w:tblBorders), cell (w:tcBorders), paragraph (w:pBdr), page (w:pgBorders).
 * Anchors: tables by the paragraph ids (w14:paraId) they contain, cells by their first paragraph id,
 * paragraphs by their id, sections by order. New cells inherit from the cell above and new paragraphs
 * from the previous paragraph when their borders equal that neighbour's baseline borders.
 */
import { NS, kids, kid, desc } from '../xml.js'
import { mergeBox, inheritBox } from './docxBorderMerge.js'

const DOC = 'word/document.xml'
const pid = (p) => (p.hasAttributeNS(NS.w14, 'paraId') ? p.getAttributeNS(NS.w14, 'paraId') : null)
const ownParas = (el) => desc(el, 'p', NS.w).filter((p) => closestTbl(p) === closestTblOrSelf(el))
function closestTbl(n) { for (let p = n.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.localName === 'tbl' && p.namespaceURI === NS.w) return p; return null }
function closestTblOrSelf(el) { return el.localName === 'tbl' ? el : closestTbl(el) }

const tblBox = (t) => kid(kid(t, 'tblPr'), 'tblBorders')
const tcBox = (tc) => kid(kid(tc, 'tcPr'), 'tcBorders')
const pBox = (p) => kid(kid(p, 'pPr'), 'pBdr')
const firstPid = (tc) => { const p = desc(tc, 'p', NS.w).find(pid); return p ? pid(p) : null }

function index(doc) {
  const tables = desc(doc, 'tbl', NS.w).map((t) => ({ el: t, pids: new Set(ownParas(t).map(pid).filter(Boolean)) }))
  const cells = new Map()
  for (const tc of desc(doc, 'tc', NS.w)) { const k = firstPid(tc); if (k && !cells.has(k)) cells.set(k, tc) }
  const paras = new Map()
  for (const p of desc(doc, 'p', NS.w)) { const k = pid(p); if (k && !paras.has(k)) paras.set(k, p) }
  const sects = desc(doc, 'sectPr', NS.w).filter((s) => s.parentNode.localName !== 'rPr' && !/Change$/.test(s.parentNode.localName))
  return { tables, cells, paras, sects }
}

/** Table in `other` sharing the most paragraph ids with table t (null when none). */
function matchTable(t, other) {
  let best = null
  let score = 0
  for (const c of other.tables) {
    let n = 0
    for (const id of t.pids) if (c.pids.has(id)) n++
    if (n > score) { score = n; best = c.el }
  }
  return best
}

export default {
  id: 'docx-borders',
  label: '테두리(표·셀·문단·쪽)',
  formats: ['docx'],
  run(ctx) {
    const { O, B, S } = ctx
    const sDoc = S.xml(DOC)
    const IO = index(O.xml(DOC))
    const IB = index(B.xml(DOC))
    const IS = index(sDoc)
    let restored = 0
    let user = 0
    const add = (r) => { restored += r.restored; user += r.user }

    // fallback when tables carry no paragraph ids: same table count everywhere -> match by position
    const byPos = IS.tables.length === IO.tables.length && IS.tables.length === IB.tables.length
    IS.tables.forEach((t, i) => {
      const o = matchTable(t, IO) || (byPos && !t.pids.size ? IO.tables[i].el : null)
      const b = matchTable(t, IB) || (byPos && !t.pids.size ? IB.tables[i].el : null)
      if (o && b) add(mergeBox(sDoc, kid(t.el, 'tblPr'), 'tblBorders', tblBox(t.el), tblBox(o), tblBox(b)))
    })
    for (const [k, tc] of IS.cells) {
      const o = IO.cells.get(k)
      const b = IB.cells.get(k)
      if (o && b) add(mergeBox(sDoc, kid(tc, 'tcPr'), 'tcBorders', tcBox(tc), tcBox(o), tcBox(b)))
    }
    for (const [k, p] of IS.paras) {
      const o = IO.paras.get(k)
      const b = IB.paras.get(k)
      if (o && b) add(mergeBox(sDoc, kid(p, 'pPr'), 'pBdr', pBox(p), pBox(o), pBox(b)))
    }
    IS.sects.forEach((s, i) => {
      const o = IO.sects[i]
      const b = IB.sects[i]
      if (o && b) add(mergeBox(sDoc, s, 'pgBorders', kid(s, 'pgBorders'), kid(o, 'pgBorders'), kid(b, 'pgBorders')))
    })

    // New cells (new rows): inherit from the cell above, row by row (a new row can sit under another new row)
    let inherited = 0
    const eff = new Map() // new cell -> { o, b } borders to pass on to the next new row
    for (const t of IS.tables) {
      const rows = kids(t.el, 'tr')
      for (let r = 1; r < rows.length; r++) {
        const cells = kids(rows[r], 'tc')
        const prev = kids(rows[r - 1], 'tc')
        cells.forEach((tc, c) => {
          const k = firstPid(tc)
          if (k && IO.cells.has(k)) return // anchored cell, handled above
          const up = prev[c]
          if (!up) return
          const uk = firstPid(up)
          const ref = eff.get(up) || (uk && IO.cells.has(uk) && IB.cells.has(uk) ? { o: tcBox(IO.cells.get(uk)), b: tcBox(IB.cells.get(uk)) } : null)
          const box = tcBox(tc)
          if (!ref || !box) return
          const before = box.cloneNode(true)
          if (inheritBox(sDoc, box, ref.o, ref.b)) { inherited++; eff.set(tc, { o: box, b: before }) }
        })
      }
    }
    // New paragraphs: inherit pBdr from the previous paragraph
    const ps = desc(sDoc, 'p', NS.w)
    const effP = new Map()
    for (let i = 1; i < ps.length; i++) {
      const p = ps[i]
      const k = pid(p)
      if (k && IO.paras.has(k)) continue
      const box = pBox(p)
      if (!box) continue
      const prev = ps[i - 1]
      const pk = pid(prev)
      const ref = effP.get(prev) || (pk && IO.paras.has(pk) && IB.paras.has(pk) ? { o: pBox(IO.paras.get(pk)), b: pBox(IB.paras.get(pk)) } : null)
      if (!ref || !ref.o || !ref.b) continue
      const before = box.cloneNode(true)
      if (inheritBox(sDoc, box, ref.o, ref.b)) { inherited++; effP.set(p, { o: box, b: before }) }
    }

    if (restored || inherited) { S.touch(DOC); ctx.restored(this, restored + inherited) }
    if (user) ctx.userChanged(this, user)
  },
}
