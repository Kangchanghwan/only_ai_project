/**
 * Small XML helpers shared by the integrity rules.
 * Uses the platform DOMParser / XMLSerializer (browser, or jsdom in tests).
 * Lookups go by localName (and namespace URI where it matters), never by prefix.
 */
export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  x: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  xmlns: 'http://www.w3.org/2000/xmlns/',
}

export const DEFAULT_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** Parse XML text; throws when the parser reports an error. */
export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML parse error')
  return doc
}

/** True when text parses as XML without errors. */
export function isWellFormed(text) {
  try { parseXml(text); return true } catch { return false }
}

/** Serialize a document, keeping the given XML declaration. */
export function serializeXml(doc, decl = DEFAULT_DECL) {
  let s = new XMLSerializer().serializeToString(doc)
  s = s.replace(/^<\?xml[^>]*\?>\s*/, '')
  return (decl ? decl + '\r\n' : '') + s
}

export const declOf = (text) => (String(text).match(/^\uFEFF?\s*(<\?xml[^>]*\?>)/) || [])[1] || DEFAULT_DECL

/** Element children with the given localName (all element children when ln is omitted). */
export const kids = (el, ln) => (el ? Array.from(el.children).filter((c) => !ln || c.localName === ln) : [])
export const kid = (el, ln) => (el ? Array.from(el.children).find((c) => c.localName === ln) || null : null)

/** Descendants by localName, optionally restricted to a namespace URI. */
export function desc(el, ln, ns) {
  const out = []
  if (!el) return out
  const root = el.nodeType === 9 ? el.documentElement : el
  if (!root) return out
  // iterative pre-order walk (document order); live collections are slow in some DOM implementations
  const any = ln === '*'
  const stack = []
  for (let c = root.lastElementChild; c; c = c.previousElementSibling) stack.push(c)
  if (el.nodeType === 9) stack.length = 0, stack.push(root)
  while (stack.length) {
    const n = stack.pop()
    if ((any || n.localName === ln) && (!ns || n.namespaceURI === ns)) out.push(n)
    for (let c = n.lastElementChild; c; c = c.previousElementSibling) stack.push(c)
  }
  return out
}
export const first = (el, ln, ns) => desc(el, ln, ns)[0] || null

/** Attribute value by localName regardless of prefix/namespace (undefined when absent). */
export function attr(el, ln) {
  if (!el) return undefined
  for (const a of el.attributes) if (a.localName === ln) return a.value
  return undefined
}

/** Canonical string of an element for equality checks: no namespace declarations, no whitespace noise. */
export function canon(el) {
  if (!el) return ''
  const walk = (e) => {
    const at = Array.from(e.attributes)
      .filter((a) => a.namespaceURI !== NS.xmlns && a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
      .map((a) => '{' + (a.namespaceURI || '') + '}' + a.localName + '=' + a.value)
      .sort()
    const ch = Array.from(e.childNodes)
      .map((n) => (n.nodeType === 1 ? walk(n) : n.nodeType === 3 || n.nodeType === 4 ? n.nodeValue.trim() : ''))
      .filter(Boolean)
    return '<{' + (e.namespaceURI || '') + '}' + e.localName + ' ' + at.join(' ') + '>' + ch.join('') + '</>'
  }
  return walk(el)
}

/** Import a node from another document (deep). */
export const importInto = (doc, node) => doc.importNode(node, true)

/** Replace all children of el with the given list (in order). */
export function setChildren(el, list) {
  for (const c of Array.from(el.children)) el.removeChild(c)
  for (const c of list) el.appendChild(c)
}
