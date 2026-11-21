/**
 * docProps/core.xml. The editor always writes lastModifiedBy "Guest", and drops title/creator/keywords/created
 * from Word Online style files (default namespace, no cp: prefix). For each field: S == B -> O's value.
 * S keeps its own structure (cp: prefix) and its own modified time.
 */
import { NS, kids } from '../xml.js'

const FIELDS = [
  ['title', NS.dc, 'dc'],
  ['subject', NS.dc, 'dc'],
  ['creator', NS.dc, 'dc'],
  ['keywords', NS.cp, 'cp'],
  ['description', NS.dc, 'dc'],
  ['category', NS.cp, 'cp'],
  ['lastModifiedBy', NS.cp, 'cp'],
  ['created', NS.dcterms, 'dcterms'],
]
// schema-friendly order used when inserting
const ORDER = ['category', 'contentStatus', 'created', 'creator', 'description', 'identifier', 'keywords', 'language', 'lastModifiedBy', 'lastPrinted', 'modified', 'revision', 'subject', 'title', 'version']

const field = (doc, ln) => (doc ? kids(doc.documentElement, ln)[0] || null : null)
const val = (el) => (el ? el.textContent : null)

export default {
  id: 'core-props',
  label: '문서 속성(제목·작성자 등)',
  formats: ['docx', 'xlsx', 'pptx'],
  run(ctx) {
    const part = 'docProps/core.xml'
    const o = ctx.O.xml(part)
    const s = ctx.S.xml(part)
    if (!o || !s) return
    const b = ctx.B.xml(part)
    let n = 0
    for (const [ln, ns, prefix] of FIELDS) {
      const oEl = field(o, ln)
      const bEl = field(b, ln)
      const sEl = field(s, ln)
      const ov = val(oEl)
      if (val(sEl) !== val(bEl)) { ctx.userChanged(this, 1); continue }
      if (val(sEl) === ov) continue
      if (oEl == null) { sEl.parentNode.removeChild(sEl); n++; continue }
      let el = sEl
      if (!el) {
        el = s.createElementNS(ns, prefix + ':' + ln)
        const after = kids(s.documentElement).find((c) => ORDER.indexOf(c.localName) > ORDER.indexOf(ln))
        s.documentElement.insertBefore(el, after || null)
      }
      el.textContent = ov
      if (ln === 'created') el.setAttributeNS(NS.xsi, 'xsi:type', oEl.getAttributeNS(NS.xsi, 'type') || 'dcterms:W3CDTF')
      n++
    }
    if (n) { ctx.S.touch(part); ctx.restored(this, n) }
  },
}
