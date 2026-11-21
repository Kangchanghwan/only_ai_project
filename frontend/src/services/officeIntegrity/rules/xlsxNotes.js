/**
 * xlsx legacy notes. The editor turns every note (comments part + VML) into a threaded comment plus a persons
 * part, and keeps a legacy fallback whose body starts with "작성자:". Per sheet:
 *  - notes the user did not touch -> the original note (fast path: copy O's comments part and VML when nothing changed)
 *  - note text edited, no replies -> plain legacy note with the new text and O's author
 *  - comments the user added, or notes with replies -> stay threaded
 * Restored shapes lose o:gfxdata and take O's style and anchor. Unused authors are removed (authorId remapped).
 * Threaded part / persons part (with relationship and content type) are removed when no thread is left.
 */
import { desc, attr } from '../xml.js'
import { sheetsOf } from './xlsxShared.js'

const WB = 'xl/workbook.xml'
const XR = 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision'

function legacy(pkg, part) {
  const d = part ? pkg.xml(part) : null
  if (!d) return null
  const authors = desc(d, 'author').map((a) => a.textContent)
  const m = new Map()
  for (const c of desc(d, 'comment')) m.set(attr(c, 'ref'), { el: c, author: authors[+attr(c, 'authorId')] })
  return { d, authors, m }
}

function threads(pkg, part) {
  const d = part ? pkg.xml(part) : null
  if (!d) return null
  const tops = new Map()
  const replies = new Map()
  for (const t of desc(d, 'threadedComment')) {
    const p = attr(t, 'parentId')
    const text = desc(t, 'text')[0]?.textContent || ''
    if (p) replies.set(p, (replies.get(p) || 0) + 1)
    else tops.set(attr(t, 'ref'), { el: t, id: attr(t, 'id'), text })
  }
  return { d, tops, replies }
}

const colRow = (ref) => {
  const m = ref.match(/^([A-Z]+)(\d+)$/)
  return { col: m[1].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1, row: +m[2] - 1 }
}

/** Find the VML shape for a cell (regex: VML from Excel is not always well-formed XML). */
function shapeFor(vml, ref) {
  const { col, row } = colRow(ref)
  const re = new RegExp('<v:shape [^>]*>(?:(?!</v:shape>)[\\s\\S])*?<x:Row>' + row + '</x:Row>\\s*<x:Column>' + col + '</x:Column>[\\s\\S]*?</v:shape>')
  return vml.match(re)?.[0] || null
}

function fixShape(sShape, oShape) {
  let ns = sShape.replace(/\s*o:gfxdata="[^"]*"/, '')
  if (oShape) {
    const st = oShape.match(/ style='[^']*'| style="[^"]*"/)?.[0]
    if (st) ns = ns.replace(/ style='[^']*'| style="[^"]*"/, st)
    const an = oShape.match(/<x:Anchor>[^<]*<\/x:Anchor>/)?.[0]
    if (an) ns = ns.replace(/<x:Anchor>[^<]*<\/x:Anchor>/, an)
  }
  return ns
}

function removePart(S, ownerPart, rel) {
  S.remove(rel.part)
  S.removeRel(ownerPart, rel.id)
  S.removeOverride(rel.part)
}

export default {
  id: 'xlsx-notes',
  label: '메모(노트)',
  formats: ['xlsx'],
  run(ctx) {
    const { O, B, S } = ctx
    const SO = sheetsOf(O)
    const SB = sheetsOf(B)
    let restored = 0
    let converted = 0
    let kept = 0
    for (const [name, sp] of sheetsOf(S)) {
      const op = SO.get(name)
      const bp = SB.get(name)
      if (!op || !bp) continue
      const sTh = S.relByType(sp, 'threadedComment')
      const oCm = O.relByType(op, 'comments')
      if (!sTh || !oCm || O.relByType(op, 'threadedComment')) continue // nothing converted, or O already used threads
      const sCm = S.relByType(sp, 'comments')
      const bTh = B.relByType(bp, 'threadedComment')
      const OL = legacy(O, oCm.part)
      const ST = threads(S, sTh.part)
      const BT = bTh ? threads(B, bTh.part) : null
      const SL = legacy(S, sCm?.part)
      if (!OL || !ST || !SL) continue

      const plan = new Map()
      for (const [ref, t] of ST.tops) {
        if (!OL.m.has(ref) || ST.replies.get(t.id)) { plan.set(ref, 'keep'); continue }
        const b = BT?.tops.get(ref)
        plan.set(ref, b && b.text === t.text ? 'restore' : 'convert')
      }
      const kinds = [...plan.values()]
      const oVml = O.relByType(op, 'vmlDrawing')
      const sVml = S.relByType(sp, 'vmlDrawing')
      const allRestore = ST.tops.size === OL.m.size && [...OL.m.keys()].every((r) => plan.get(r) === 'restore') && ST.d && desc(ST.d, 'threadedComment').length === ST.tops.size

      if (allRestore) {
        // fast path: nothing changed in this sheet's notes
        S.setText(sCm.part, O.text(oCm.part))
        if (oVml && sVml) S.setText(sVml.part, O.text(oVml.part))
        restored += kinds.length
        removePart(S, sp, sTh)
        continue
      }

      const d = SL.d
      const root = d.documentElement
      const nsMain = root.namespaceURI
      const authorsEl = desc(d, 'authors')[0]
      const listEl = desc(d, 'commentList')[0]
      const authors = SL.authors.slice()
      const aid = (who) => {
        let i = authors.indexOf(who)
        if (i < 0) {
          authors.push(who)
          const a = d.createElementNS(nsMain, 'author')
          a.textContent = who
          authorsEl.appendChild(a)
          i = authors.length - 1
        }
        return i
      }
      let vml = sVml ? S.text(sVml.part) : null
      const oV = oVml ? O.text(oVml.part) : ''
      for (const [ref, kind] of plan) {
        if (kind === 'keep') { kept++; continue }
        const o = OL.m.get(ref)
        const sEl = SL.m.get(ref)?.el
        let nEl
        if (kind === 'restore') nEl = d.importNode(o.el, true)
        else {
          nEl = d.createElementNS(nsMain, 'comment')
          nEl.setAttribute('ref', ref)
          const tx = d.createElementNS(nsMain, 'text')
          const r = d.createElementNS(nsMain, 'r')
          const t = d.createElementNS(nsMain, 't')
          t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
          t.textContent = ST.tops.get(ref).text.replace(/\n$/, '')
          r.appendChild(t)
          tx.appendChild(r)
          nEl.appendChild(tx)
        }
        if (nEl.hasAttributeNS(XR, 'uid')) nEl.removeAttributeNS(XR, 'uid')
        nEl.setAttribute('authorId', String(aid(o.author)))
        if (sEl) listEl.replaceChild(nEl, sEl)
        else listEl.appendChild(nEl)
        const tEl = ST.tops.get(ref).el
        tEl.parentNode.removeChild(tEl)
        if (vml) {
          const sShape = shapeFor(vml, ref)
          if (sShape) vml = vml.replace(sShape, fixShape(sShape, shapeFor(oV, ref)))
        }
        if (kind === 'restore') restored++
        else converted++
      }
      // drop unused authors, remap authorId
      const used = new Set(desc(d, 'comment').map((c) => +attr(c, 'authorId')))
      const remap = new Map()
      let k = 0
      desc(d, 'author').forEach((a, i) => { if (used.has(i)) remap.set(i, k++); else a.parentNode.removeChild(a) })
      for (const c of desc(d, 'comment')) c.setAttribute('authorId', String(remap.get(+attr(c, 'authorId'))))
      S.touch(sCm.part)
      if (sVml && vml != null) S.setText(sVml.part, vml)
      if (desc(ST.d, 'threadedComment').length === 0) removePart(S, sp, sTh)
      else S.touch(sTh.part)
    }

    // persons part only matters while some sheet still has threads
    const anyThread = [...sheetsOf(S).values()].some((sp) => S.relByType(sp, 'threadedComment'))
    const person = S.relByType(WB, 'person')
    if (person && !anyThread && (restored || converted)) removePart(S, WB, person)

    if (restored + converted) ctx.restored(this, restored + converted)
    if (converted || kept) ctx.userChanged(this, converted + kept)
  },
}

