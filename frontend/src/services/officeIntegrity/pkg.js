/**
 * Office package (OPC) wrapper: parts, cached XML documents, relationships, content types.
 * Only parts whose XML was changed are re-serialized; everything else keeps its bytes.
 */
import { readZip, writeZip } from './zip.js'
import { parseXml, serializeXml, declOf, NS, attr, kids } from './xml.js'

const dec = new TextDecoder()
const enc = new TextEncoder()
const XML_RE = /\.(xml|rels|vml)$/i

export class Pkg {
  constructor(files) {
    this.files = files // Map name -> Uint8Array
    this.docs = new Map() // name -> { doc, decl }
    this.dirty = new Set()
  }

  static async from(bytes) { return new Pkg(await readZip(bytes)) }

  has(name) { return this.files.has(name) || this.docs.has(name) }
  names() { return [...new Set([...this.files.keys(), ...this.docs.keys()])] }
  bytes(name) { this.flush(name); return this.files.get(name) || null }

  text(name) {
    if (this.docs.has(name) && this.dirty.has(name)) this.flush(name)
    const b = this.files.get(name)
    return b ? dec.decode(b).replace(/^\uFEFF/, '') : null
  }

  setText(name, text) {
    this.docs.delete(name)
    this.dirty.delete(name)
    this.files.set(name, enc.encode(text))
  }

  setBytes(name, bytes) {
    this.docs.delete(name)
    this.dirty.delete(name)
    this.files.set(name, bytes)
  }

  remove(name) {
    this.files.delete(name)
    this.docs.delete(name)
    this.dirty.delete(name)
  }

  /** Parsed XML document for a part (cached), or null when the part is missing. */
  xml(name) {
    if (!name) return null
    const hit = this.docs.get(name)
    if (hit) return hit.doc
    const t = this.text(name)
    if (t == null) return null
    const doc = parseXml(t)
    this.docs.set(name, { doc, decl: declOf(t) })
    return doc
  }

  /** Mark a cached XML part as changed. */
  touch(name) { if (this.docs.has(name)) this.dirty.add(name) }

  /** Create a new XML part from text and return its document. */
  createXml(name, text) {
    this.setText(name, text)
    return this.xml(name)
  }

  flush(name) {
    if (!this.dirty.has(name)) return
    const { doc, decl } = this.docs.get(name)
    this.files.set(name, enc.encode(serializeXml(doc, decl)))
    this.dirty.delete(name)
  }

  flushAll() { for (const n of [...this.dirty]) this.flush(n) }

  async toBytes() {
    this.flushAll()
    return writeZip(this.files)
  }

  /** All parts that look like XML, as text (for validation). */
  xmlParts() { return this.names().filter((n) => XML_RE.test(n)) }

  // ---- relationships ----
  static relsPath(part) {
    const i = part.lastIndexOf('/')
    return (i >= 0 ? part.slice(0, i + 1) : '') + '_rels/' + part.slice(i + 1) + '.rels'
  }

  /** Resolve a relationship target (relative to the source part) to a package part name. */
  static resolve(part, target) {
    if (target.startsWith('/')) return target.slice(1)
    const base = part.split('/').slice(0, -1)
    for (const seg of target.split('/')) {
      if (seg === '..') base.pop()
      else if (seg && seg !== '.') base.push(seg)
    }
    return base.join('/')
  }

  /** Relative target from a source part to a package part name. */
  static relative(fromPart, toPart) {
    const a = fromPart.split('/').slice(0, -1)
    const b = toPart.split('/')
    let i = 0
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
  }

  /** Relationships of a part: [{ id, type, typeUri, target, part, external, el }] */
  rels(part) {
    const rp = Pkg.relsPath(part)
    const doc = this.xml(rp)
    if (!doc) return []
    return kids(doc.documentElement, 'Relationship').map((el) => {
      const external = attr(el, 'TargetMode') === 'External'
      const typeUri = attr(el, 'Type') || ''
      const target = attr(el, 'Target') || ''
      return { id: attr(el, 'Id'), typeUri, type: typeUri.split('/').pop(), target, part: external ? null : Pkg.resolve(part, target), external, el }
    })
  }

  relByType(part, type) { return this.rels(part).find((r) => r.type === type) || null }
  relById(part, id) { return this.rels(part).find((r) => r.id === id) || null }

  /** Add a relationship (creates the rels part when missing). Returns the new id. */
  addRel(part, typeUri, toPart, preferredId) {
    const rp = Pkg.relsPath(part)
    let doc = this.xml(rp)
    if (!doc) doc = this.createXml(rp, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="' + NS.rels + '"></Relationships>')
    const used = new Set(kids(doc.documentElement, 'Relationship').map((e) => attr(e, 'Id')))
    let id = preferredId && !used.has(preferredId) ? preferredId : null
    for (let n = 1; !id; n++) if (!used.has('rId' + n)) id = 'rId' + n
    const el = doc.createElementNS(NS.rels, 'Relationship')
    el.setAttribute('Id', id)
    el.setAttribute('Type', typeUri)
    el.setAttribute('Target', Pkg.relative(part, toPart))
    doc.documentElement.appendChild(el)
    this.touch(rp)
    return id
  }

  removeRel(part, id) {
    const rp = Pkg.relsPath(part)
    const doc = this.xml(rp)
    if (!doc) return
    for (const el of kids(doc.documentElement, 'Relationship')) if (attr(el, 'Id') === id) el.parentNode.removeChild(el)
    this.touch(rp)
  }

  // ---- content types ----
  get ct() { return this.xml('[Content_Types].xml') }

  hasDefault(ext) { return kids(this.ct?.documentElement, 'Default').some((d) => (attr(d, 'Extension') || '').toLowerCase() === ext.toLowerCase()) }

  addDefault(ext, type) {
    if (this.hasDefault(ext)) return
    const doc = this.ct
    const el = doc.createElementNS(NS.ct, 'Default')
    el.setAttribute('Extension', ext)
    el.setAttribute('ContentType', type)
    const firstOverride = kids(doc.documentElement, 'Override')[0]
    doc.documentElement.insertBefore(el, firstOverride || null)
    this.touch('[Content_Types].xml')
  }

  overrideOf(part) { return kids(this.ct?.documentElement, 'Override').find((o) => attr(o, 'PartName') === '/' + part) || null }

  addOverride(part, type) {
    if (this.overrideOf(part)) return
    const doc = this.ct
    const el = doc.createElementNS(NS.ct, 'Override')
    el.setAttribute('PartName', '/' + part)
    el.setAttribute('ContentType', type)
    doc.documentElement.appendChild(el)
    this.touch('[Content_Types].xml')
  }

  removeOverride(part) {
    const o = this.overrideOf(part)
    if (o) { o.parentNode.removeChild(o); this.touch('[Content_Types].xml') }
  }

  defaultType(ext) {
    const d = kids(this.ct?.documentElement, 'Default').find((x) => (attr(x, 'Extension') || '').toLowerCase() === ext.toLowerCase())
    return d ? attr(d, 'ContentType') : null
  }
}
