/**
 * Paragraph ids (w14:paraId) used as anchors by the docx rules.
 * prepare: give every w:p in the body without an id a new one (unique, below 0x80000000).
 * Existing ids are found by namespace URI, not prefix: Office Online writes them as wp14:paraId with
 * xmlns:wp14 bound to the w14 namespace, and a second paraId attribute would make the XML invalid.
 * cleanup: remove the ids we added (the editor keeps them as they are).
 */
import { NS, desc } from '../xml.js'

const DOC = 'word/document.xml'
const MC_IGNORABLE = 'Ignorable'

export function addParaIds(pkg) {
  const doc = pkg.xml(DOC)
  if (!doc) return []
  const root = doc.documentElement
  const used = new Set()
  for (const el of desc(doc, '*')) {
    for (const a of Array.from(el.attributes)) if (a.namespaceURI === NS.w14 && (a.localName === 'paraId' || a.localName === 'textId')) used.add(a.value.toUpperCase())
  }
  const added = []
  let n = 0
  const next = () => {
    for (;;) {
      const id = (0x7c000000 + ++n).toString(16).toUpperCase().padStart(8, '0')
      if (!used.has(id)) { used.add(id); return id }
    }
  }
  for (const p of desc(doc, 'p', NS.w)) {
    if (p.hasAttributeNS(NS.w14, 'paraId')) continue
    const id = next()
    p.setAttributeNS(NS.w14, 'w14:paraId', id)
    added.push(id)
  }
  if (added.length) {
    // w14 must be declared and ignorable for readers that do not know it
    if (!root.lookupNamespaceURI('w14') || root.lookupNamespaceURI('w14') !== NS.w14) root.setAttributeNS(NS.xmlns, 'xmlns:w14', NS.w14)
    const mcPrefix = root.lookupPrefix(NS.mc)
    if (mcPrefix) {
      const cur = root.getAttributeNS(NS.mc, MC_IGNORABLE) || ''
      const list = cur.split(/\s+/).filter(Boolean)
      if (!list.includes('w14')) root.setAttributeNS(NS.mc, mcPrefix + ':' + MC_IGNORABLE, [...list, 'w14'].join(' '))
    } else {
      root.setAttributeNS(NS.xmlns, 'xmlns:mc', NS.mc)
      root.setAttributeNS(NS.mc, 'mc:' + MC_IGNORABLE, 'w14')
    }
    pkg.touch(DOC)
  }
  return added
}

export function removeParaIds(pkg, ids) {
  const set = new Set(ids)
  if (!set.size) return 0
  const doc = pkg.xml(DOC)
  if (!doc) return 0
  let n = 0
  for (const p of desc(doc, 'p', NS.w)) {
    if (set.has(p.getAttributeNS(NS.w14, 'paraId'))) { p.removeAttributeNS(NS.w14, 'paraId'); n++ }
  }
  if (n) pkg.touch(DOC)
  return n
}
