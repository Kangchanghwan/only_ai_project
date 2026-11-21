/**
 * Semantic signature of an office package: a flat map key -> string describing what a reader
 * sees (text, formatting, tables, borders, notes, sections, document properties, ...).
 * Two saves of the same document by the editor give the same signature; raw bytes never matter.
 *
 * Normalizations for changes that are equivalent (no action needed):
 *  - xlsx: conditional formatting / data validation in x14 ext, inline vs shared strings,
 *    explicit "none" borders, numeric "5.0" vs "5", theme-scheme fonts (name ignored)
 *  - pptx: shape ids (names are used), hyperlink u="sng", empty <p:transition/>
 */
import { NS, attr, kids, kid, desc, first } from '../xml.js'
import { Pkg } from '../pkg.js'

const hashBytes = (u8) => {
  let h = 0x811c9dc5
  for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0') + '/' + u8.length
}

const one = (el, ln) => first(el, ln)
const realAttrs = (el) => Array.from(el.attributes).filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
const hasAncestor = (el, ln) => { for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.localName === ln) return true; return false }
const truthy = (v) => v === undefined || ['1', 'true', 'on'].includes(v)
const colorNorm = (v) => (v == null ? '' : /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : v)

function rprSig(rPr) {
  if (!rPr) return '-'
  const o = []
  for (const c of kids(rPr)) {
    const ln = c.localName
    if (ln === 'rFonts') o.push('font=' + ['ascii', 'hAnsi', 'eastAsia', 'cs', 'asciiTheme', 'eastAsiaTheme'].map((n) => attr(c, n) || '').join('/'))
    else if (['lang', 'noProof', 'rStyle'].includes(ln)) continue
    else {
      const v = attr(c, 'val')
      const nv = truthy(v) ? '' : ['0', 'false', 'off'].includes(v) ? '=0' : '=' + colorNorm(v)
      o.push(ln + nv + (attr(c, 'fill') ? ':' + attr(c, 'fill').toUpperCase() : ''))
    }
  }
  return o.sort().join(',') || '-'
}

const BORDER_ATTRS = ['val', 'sz', 'color', 'space', 'shadow', 'frame', 'themeColor']
const borderAttr = (b, n) => {
  const v = attr(b, n)
  if (n === 'color') return colorNorm(v)
  if (n === 'space' && v === '0') return ''
  if ((n === 'shadow' || n === 'frame') && ['0', 'false', 'off'].includes(v)) return ''
  return v || ''
}
const borderSig = (box) => kids(box).map((b) => b.localName + ':' + BORDER_ATTRS.map((n) => borderAttr(b, n)).join('/')).sort().join(',')

// Symbol fonts: <w:sym w:font="Wingdings" w:char="F0FC"/> and a Wingdings run with text U+00FC show the same glyph
const SYMBOL_FONT = /^(wingdings( 2| 3)?|webdings|symbol)$/i
const symKey = (font, code) => '[sym:' + font.toLowerCase() + ':' + (code & 0xff).toString(16).toUpperCase().padStart(2, '0') + ']'

export function themeSig(pkg, part) {
  const t = pkg.xml(part)
  if (!t) return ''
  const fs = one(t, 'fontScheme')
  return ['majorFont', 'minorFont'].map((m) => {
    const f = one(fs, m)
    return m + ':latin=' + attr(one(f, 'latin'), 'typeface') + ',ea=' + attr(one(f, 'ea'), 'typeface') + ',cs=' + attr(one(f, 'cs'), 'typeface') + ',scripts=' + kids(f, 'font').map((x) => attr(x, 'script') + '=' + attr(x, 'typeface')).sort().join('/')
  }).join(' ; ') + ' | colors=' + kids(one(t, 'clrScheme')).map((c) => c.localName + ':' + (attr(c.firstElementChild, 'val') || attr(c.firstElementChild, 'lastClr'))).join(',')
}

function common(pkg, put) {
  const bins = pkg.names().filter((n) => !/\.(xml|rels|vml)$/i.test(n) && !/thumbnail|printerSettings/i.test(n))
  put('bin.multiset', bins.map((k) => (/fonts\//.test(k) ? 'font:' : 'bin:') + hashBytes(pkg.bytes(k))).sort().join(' | '))
  const core = pkg.xml('docProps/core.xml')
  for (const n of ['title', 'subject', 'creator', 'keywords', 'description', 'lastModifiedBy', 'category', 'created']) put('core.' + n, (one(core, n)?.textContent || '').trim())
  const cust = pkg.xml('docProps/custom.xml')
  put('custom.props', desc(cust, 'property').map((p) => attr(p, 'name') + '=' + p.textContent).join('; '))
}

function wordSig(pkg, put) {
  const mainP = 'word/document.xml'
  const rels = Object.fromEntries(pkg.rels(mainP).map((r) => [r.id, r]))
  const doc = pkg.xml(mainP)
  const body = one(doc, 'body')
  const themeRel = pkg.relByType(mainP, 'theme')
  put('w.theme', themeSig(pkg, themeRel?.part || 'word/theme/theme1.xml'))
  const st = pkg.xml('word/settings.xml')
  const tfl = one(st, 'themeFontLang')
  put('w.themeFontLang', [attr(tfl, 'val'), attr(tfl, 'eastAsia'), attr(tfl, 'bidi')].join('/'))
  put('w.settings.flags', ['embedTrueTypeFonts', 'saveSubsetFonts', 'trackRevisions', 'evenAndOddHeaders', 'mirrorMargins', 'updateFields'].map((n) => { const e = one(st, n); return e && truthy(attr(e, 'val')) ? n : '' }).filter(Boolean).join(','))
  const prot = one(st, 'documentProtection') // an element without enforcement protects nothing
  put('w.protection', prot && attr(prot, 'enforcement') && truthy(attr(prot, 'enforcement')) ? (attr(prot, 'edit') || '') : '')
  const sty = pkg.xml('word/styles.xml')
  const dd = one(sty, 'docDefaults')
  const pPrD = one(one(dd, 'pPrDefault'), 'pPr')
  put('w.docDefaults.rPr', rprSig(one(one(dd, 'rPrDefault'), 'rPr')) + ' | lang=' + [attr(one(dd, 'lang'), 'val'), attr(one(dd, 'lang'), 'eastAsia')].join('/'))
  put('w.docDefaults.pPr', kids(pPrD).filter((e) => e.attributes.length || e.children.length).map((e) => e.localName + ':' + Array.from(e.attributes).filter((a) => !(/Autospacing$/.test(a.localName) && a.value === '0')).map((a) => a.localName + '=' + a.value).sort().join('&')).sort().join(','))
  const styles = desc(sty, 'style')
  const styleName = (s) => (attr(kid(s, 'name'), 'val') || '').toLowerCase()
  const byId = new Map(styles.map((s) => [attr(s, 'styleId'), s]))
  // Only styles the document uses (and what they are based on): the editor adds hundreds of unused built-ins
  const used = new Set()
  const useStyle = (id) => { while (id && !used.has(id) && byId.has(id)) { used.add(id); id = attr(kid(byId.get(id), 'basedOn'), 'val') } }
  for (const ln of ['pStyle', 'rStyle', 'tblStyle']) for (const e of desc(doc, ln, NS.w)) useStyle(attr(e, 'val'))
  for (const s of styles) if (attr(s, 'default') === '1' && attr(s, 'type') === 'paragraph') useStyle(attr(s, 'styleId'))
  const usedStyles = styles.filter((s) => used.has(attr(s, 'styleId')))
  put('w.styles.used', usedStyles.map((s) => styleName(s) + '[' + attr(s, 'type') + ']' + rprSig(kid(s, 'rPr'))).sort().join(' ; '))
  for (const s of usedStyles.filter((x) => attr(x, 'type') === 'table')) put('w.tblStyle[' + styleName(s) + '].borders', borderSig(one(kid(s, 'tblPr'), 'tblBorders')))

  const symFontOf = (t) => { const f = attr(kid(kid(t.parentNode, 'rPr'), 'rFonts'), 'ascii'); return f && SYMBOL_FONT.test(f) ? f : null }
  const paraText = (p) => desc(p, '*').map((e) => e.localName === 't' && symFontOf(e) ? Array.from(e.textContent).map((ch) => symKey(symFontOf(e), ch.codePointAt(0))).join('') : e.localName === 'sym' ? symKey(attr(e, 'font') || '', parseInt(attr(e, 'char') || '0', 16)) : e.localName === 't' ? e.textContent : e.localName === 'delText' ? '{-' + e.textContent + '-}' : e.localName === 'tab' && e.parentNode.localName === 'r' ? '\t' : e.localName === 'br' ? (attr(e, 'type') === 'page' ? '[PB]' : '\n') : e.localName === 'sym' ? '[sym:' + attr(e, 'font') + ':' + attr(e, 'char') + ']' : '').join('')
  const ps = desc(body, 'p', NS.w)
  put('w.body.paragraphs', String(ps.length))
  ps.forEach((p, i) => {
    put('w.p' + String(i).padStart(3, '0'), paraText(p))
    const pb = one(kid(p, 'pPr'), 'pBdr')
    // keyed by paragraph id so inserted paragraphs do not shift the key
    if (pb && pb.children.length) put('w.pBdr[' + (p.getAttributeNS(NS.w14, 'paraId') || 'i' + i) + ']', borderSig(pb))
  })
  const fontRuns = {}
  for (const r of desc(body, 'r', NS.w)) {
    const t = kids(r, 't').map((c) => c.textContent).join('')
    if (!t) continue
    if (SYMBOL_FONT.test(attr(kid(kid(r, 'rPr'), 'rFonts'), 'ascii') || '')) continue // symbol runs are compared as text above
    const k = rprSig(kid(r, 'rPr'))
    fontRuns[k] = (fontRuns[k] || 0) + 1
  }
  put('w.runFormats', Object.entries(fontRuns).map(([k, v]) => k + ' x' + v).sort().join(' ; '))
  const pFmt = {}
  for (const p of ps) {
    const pp = kid(p, 'pPr')
    if (!pp) continue
    const k = kids(pp).filter((c) => !['rPr', 'sectPr', 'pStyle', 'pBdr'].includes(c.localName) && (c.attributes.length || c.children.length) && !(['keepNext', 'keepLines', 'widowControl'].includes(c.localName) && truthy(attr(c, 'val'))))
      .map((c) => c.localName + ':' + Array.from(c.attributes).filter((a) => !(/Autospacing$/.test(a.localName) && a.value === '0') && !(a.localName === 'val' && truthy(a.value))).map((a) => a.localName + '=' + a.value).sort().join('&') + (c.children.length ? '{' + kids(c).map((x) => x.localName + '=' + (attr(x, 'val') || '')).join(',') + '}' : '')).sort().join(';')
    if (k) pFmt[k] = (pFmt[k] || 0) + 1
  }
  put('w.paraFormats', Object.entries(pFmt).map(([k, v]) => k + ' x' + v).sort().join(' || '))
  put('w.pStyles', ps.map((p) => attr(one(kid(p, 'pPr'), 'pStyle'), 'val')).filter(Boolean).map((id) => (styleName(styles.find((s) => attr(s, 'styleId') === id)) || '?' + id).toLowerCase()).join(','))
  put('w.ins', desc(body, 'ins', NS.w).map((e) => attr(e, 'author') + ':' + e.textContent).join(' ; '))
  put('w.del', desc(body, 'del', NS.w).map((e) => attr(e, 'author') + ':' + e.textContent).join(' ; '))
  put('w.bookmarks', desc(body, 'bookmarkStart').map((e) => attr(e, 'name')).filter((n) => n && !n.startsWith('_')).join(','))
  put('w.hyperlinks', desc(body, 'hyperlink', NS.w).map((h) => (attr(h, 'id') ? 'ext:' + rels[attr(h, 'id')]?.target : 'anchor:' + attr(h, 'anchor')) + '=' + h.textContent).join(' ; '))
  put('w.fields', [...desc(body, 'fldSimple').map((e) => 'simple:' + attr(e, 'instr').trim().replace(/\s+/g, ' ')), ...desc(body, 'instrText').map((e) => 'complex:' + e.textContent.trim().replace(/\s+/g, ' '))].join(' ; '))
  desc(body, 'sdt', NS.w).forEach((s, i) => {
    const pr = kid(s, 'sdtPr')
    const typeEl = kids(pr).find((c) => SDT_TYPES.has(c.localName))
    // on/off elements: <x/> and <x w:val="true"/> mean the same
    const inner = typeEl ? kids(typeEl).map((c) => c.localName + '=' + (['true', 'on', '1'].includes(attr(c, 'val')) ? '' : attr(c, 'val') ?? '')).join('&') + Array.from(typeEl.attributes).filter((a) => !a.name.startsWith('xmlns')).map((a) => '@' + a.localName + '=' + a.value).sort().join('') : ''
    put('w.sdt' + i, 'alias=' + attr(kid(pr, 'alias'), 'val') + ',tag=' + attr(kid(pr, 'tag'), 'val') + ',type=' + (typeEl ? typeEl.localName + '{' + inner + '}' : '-') + ',extra=' + kids(pr).map((c) => c.localName).filter((n) => !['alias', 'tag', 'id', 'rPr', 'showingPlcHdr', 'placeholder'].includes(n) && !SDT_TYPES.has(n)).sort().join('/') + ':' + kid(s, 'sdtContent')?.textContent)
  })
  put('w.numbering.use', desc(body, 'numPr').map((n) => 'num' + attr(one(n, 'numId'), 'val') + '/l' + attr(one(n, 'ilvl'), 'val')).join(','))
  const numRel = pkg.relByType(mainP, 'numbering')
  const usedLvls = new Set(desc(doc, 'ilvl', NS.w).map((e) => attr(e, 'val')))
  put('w.numbering.defs', desc(pkg.xml(numRel?.part), 'lvl').filter((l) => usedLvls.has(attr(l, 'ilvl'))).map((l) => 'l' + attr(l, 'ilvl') + ':' + attr(one(l, 'numFmt'), 'val') + ':' + attr(one(l, 'lvlText'), 'val') + ':start' + attr(one(l, 'start'), 'val')).join(','))
  desc(body, 'tbl', NS.w).forEach((t, ti) => {
    const rows = kids(t, 'tr')
    put('w.tbl' + ti, rows.map((r) => kids(r, 'tc').map((c) => {
      const pr = kid(c, 'tcPr')
      return (attr(kid(pr, 'gridSpan'), 'val') ? 'span' + attr(kid(pr, 'gridSpan'), 'val') : '') + (kid(pr, 'vMerge') ? 'vm:' + (attr(kid(pr, 'vMerge'), 'val') || 'continue') : '') + (attr(kid(pr, 'shd'), 'fill') ? 'fill:' + attr(kid(pr, 'shd'), 'fill').toUpperCase() : '') + '[' + c.textContent + ']'
    }).join('|')).join(' / '))
    const firstId = desc(t, 'p', NS.w).map((p) => p.getAttributeNS(NS.w14, 'paraId')).find(Boolean)
    put('w.tblBorders[' + (firstId || 'i' + ti) + ']', borderSig(kid(kid(t, 'tblPr'), 'tblBorders')))
    put('w.tbl' + ti + '.style', attr(kid(kid(t, 'tblPr'), 'tblStyle'), 'val') ? styleName(styles.find((s) => attr(s, 'styleId') === attr(kid(kid(t, 'tblPr'), 'tblStyle'), 'val'))) : '')
    rows.forEach((r, ri) => kids(r, 'tc').forEach((c, ci) => {
      const box = kid(kid(c, 'tcPr'), 'tcBorders')
      if (!box || !box.children.length) return
      const id = desc(c, 'p', NS.w).map((p) => p.getAttributeNS(NS.w14, 'paraId')).find(Boolean)
      put('w.tcBorders[' + (id || 'i' + ti + ':' + ri + ':' + ci) + ']', borderSig(box))
    }))
  })
  put('w.drawings', desc(body, 'docPr').map((d) => attr(d, 'name') + '|' + attr(d, 'descr') + '|ext=' + attr(kid(d.parentNode, 'extent'), 'cx') + 'x' + attr(kid(d.parentNode, 'extent'), 'cy')).join(' ; '))
  put('w.math', desc(body, 'oMath').map((m) => m.textContent).join(' ; '))
  // header/footer text without field results (PAGE etc. are recomputed on every save)
  const partText = (id) => {
    const d = pkg.xml(rels[id]?.part)
    if (!d) return ''
    return desc(d, 't', NS.w).filter((t) => !hasAncestor(t, 'fldSimple')).map((t) => t.textContent).join('')
  }
  desc(doc, 'sectPr', NS.w).forEach((s, i) => {
    const pg = kid(s, 'pgSz')
    put('w.sect' + i, 'pg=' + attr(pg, 'w') + 'x' + attr(pg, 'h') + ':' + (attr(pg, 'orient') || 'portrait') + ',cols=' + (attr(kid(s, 'cols'), 'num') || '1') + ',type=' + (attr(kid(s, 'type'), 'val') || 'nextPage') + ',mar=' + ['top', 'left', 'header', 'footer'].map((n) => attr(kid(s, 'pgMar'), n)).join('/') + ',hdr=' + kids(s, 'headerReference').map((h) => attr(h, 'type') + ':' + partText(attr(h, 'id'))).join('/') + ',ftr=' + kids(s, 'footerReference').map((h) => attr(h, 'type') + ':' + partText(attr(h, 'id'))).join('/'))
    const pgb = kid(s, 'pgBorders')
    if (pgb && pgb.children.length) put('w.sect' + i + '.pgBorders', borderSig(pgb))
  })
  const partOf = (t) => pkg.relByType(mainP, t)?.part
  put('w.comments', desc(pkg.xml(partOf('comments')), 'comment').map((c) => attr(c, 'author') + ':' + c.textContent).join(' ; ') + ' | anchors=' + desc(body, 'commentRangeStart').length)
  put('w.footnotes', desc(pkg.xml(partOf('footnotes')), 'footnote').filter((f) => !attr(f, 'type')).map((f) => f.textContent.trim()).join(' ; ') + ' | refs=' + desc(body, 'footnoteReference').length)
  put('w.endnotes', desc(pkg.xml(partOf('endnotes')), 'endnote').filter((f) => !attr(f, 'type')).map((f) => f.textContent.trim()).join(' ; '))
  const ftPart = partOf('fontTable') || 'word/fontTable.xml'
  const ftRels = Object.fromEntries(pkg.rels(ftPart).map((r) => [r.id, r]))
  put('w.embeddedFonts', desc(pkg.xml(ftPart), 'font').filter((f) => kids(f).some((c) => /^embed/.test(c.localName))).map((f) => attr(f, 'name') + ':' + kids(f).filter((c) => /^embed/.test(c.localName)).map((c) => c.localName + '->' + (ftRels[attr(c, 'id')]?.part && pkg.has(ftRels[attr(c, 'id')].part) ? hashBytes(pkg.bytes(ftRels[attr(c, 'id')].part)) : 'missing')).join(',')).join(' ; '))
  // VML inside mc:Fallback is only the fallback of a DrawingML object
  put('w.altChunks/ole/vml', ['altChunk', 'object', 'OLEObject', 'pict', 'txbxContent'].map((n) => n + '=' + desc(body, n).filter((e) => !hasAncestor(e, 'Fallback')).length).join(','))
}

export const SDT_TYPES = new Set(['text', 'richText', 'date', 'dropDownList', 'comboBox', 'picture', 'docPartObj', 'docPartList', 'group', 'citation', 'bibliography', 'equation', 'checkbox', 'repeatingSection', 'repeatingSectionItem'])

/** Font signature for xlsx styles. Theme-scheme fonts are rendered from the theme, so their name is ignored. */
export function xlsxFontSig(f) {
  const scheme = attr(kid(f, 'scheme'), 'val')
  const name = scheme ? 'scheme:' + scheme : attr(kid(f, 'name'), 'val')
  return name + (kid(f, 'b') && truthy(attr(kid(f, 'b'), 'val')) ? ' B' : '') + (kid(f, 'i') && truthy(attr(kid(f, 'i'), 'val')) ? ' I' : '') + ' sz' + parseFloat(attr(kid(f, 'sz'), 'val')) + (attr(kid(f, 'color'), 'rgb') ? ' ' + attr(kid(f, 'color'), 'rgb').toUpperCase() : '')
}

function cellSig(pkg, put) {
  const wbP = 'xl/workbook.xml'
  const wb = pkg.xml(wbP)
  const rels = Object.fromEntries(pkg.rels(wbP).map((r) => [r.id, r]))
  put('x.theme', themeSig(pkg, pkg.relByType(wbP, 'theme')?.part))
  const sstPart = pkg.relByType(wbP, 'sharedStrings')?.part
  const sst = kids(pkg.xml(sstPart)?.documentElement, 'si').map((si) => desc(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''))
  const sty = pkg.xml(pkg.relByType(wbP, 'styles')?.part || 'xl/styles.xml')
  const nfm = {}
  for (const n of desc(sty, 'numFmt')) nfm[attr(n, 'numFmtId')] = attr(n, 'formatCode')
  const fonts = kids(kid(sty?.documentElement, 'fonts'), 'font').map(xlsxFontSig)
  put('x.defaultFont', fonts[0] || '')
  const fills = kids(kid(sty?.documentElement, 'fills'), 'fill').map((f) => attr(one(f, 'patternFill'), 'patternType') + ':' + (attr(one(f, 'fgColor'), 'rgb') || attr(one(f, 'fgColor'), 'theme') || ''))
  const borders = kids(kid(sty?.documentElement, 'borders'), 'border').map((b) => kids(b).map((c) => attr(c, 'style') && attr(c, 'style') !== 'none' ? c.localName + ':' + attr(c, 'style') : '').filter(Boolean).join(','))
  const xfs = kids(kid(sty?.documentElement, 'cellXfs'), 'xf').map((x) => {
    const id = attr(x, 'numFmtId') || '0'
    const al = kid(x, 'alignment')
    return 'fmt=' + (nfm[id] ?? 'builtin' + id) + '|font=' + fonts[+attr(x, 'fontId') || 0] + '|fill=' + fills[+attr(x, 'fillId') || 0] + '|border=' + borders[+attr(x, 'borderId') || 0] + (al && al.attributes.length ? '|align=' + Array.from(al.attributes).map((a) => a.localName + '=' + a.value).sort().join('&') : '')
  })
  put('x.definedNames', desc(wb, 'definedName').map((d) => attr(d, 'name') + (attr(d, 'localSheetId') !== undefined ? '@' + attr(d, 'localSheetId') : '') + (truthy(attr(d, 'hidden')) && attr(d, 'hidden') ? '(h)' : '') + '=' + d.textContent).sort().join(' ; '))
  const sheets = desc(wb, 'sheet')
  put('x.sheets', sheets.map((s) => attr(s, 'name') + ':' + (attr(s, 'state') || 'visible')).join(','))
  const dxfL = kids(kid(sty?.documentElement, 'dxfs'), 'dxf')
  const dxfSig = (d) => d ? desc(d, '*').filter((e) => e.localName !== 'fgColor' && e.localName !== 'patternFill').map((e) => e.localName + (attr(e, 'rgb') ? '=' + attr(e, 'rgb').toUpperCase() : '')).join(',') : ''
  for (const s of sheets) {
    const sp = rels[attr(s, 'id')]?.part
    const w = pkg.xml(sp)
    if (!w) continue
    const sr = Object.fromEntries(pkg.rels(sp).map((r) => [r.id, r]))
    const nm = 'x[' + attr(s, 'name') + '].'
    for (const c of desc(w, 'c', NS.x)) {
      const t = attr(c, 't')
      const v = kid(c, 'v')?.textContent
      const f = kid(c, 'f')
      let val = t === 's' ? sst[+v] : t === 'inlineStr' ? desc(c, 't').map((x) => x.textContent).join('') : v
      if (t === 'n' || !t) val = v === undefined ? '' : String(+v)
      const typ = t === 'inlineStr' ? 's' : t || 'n'
      put(nm + attr(c, 'r'), typ + ':' + val + (f ? ' f=' + (f.textContent || '') + (attr(f, 't') ? '<' + attr(f, 't') + (attr(f, 'ref') ? ' ' + attr(f, 'ref') : '') + (attr(f, 'si') !== undefined ? ' si' + attr(f, 'si') : '') + '>' : '') : '') + ' xf{' + xfs[+attr(c, 's') || 0] + '}')
    }
    put(nm + 'merges', desc(w, 'mergeCell').map((m) => attr(m, 'ref')).join(','))
    put(nm + 'cf', desc(w, 'conditionalFormatting').map((cf) => (attr(cf, 'sqref') || kid(cf, 'sqref')?.textContent) + ':' + kids(cf, 'cfRule').map((r) => attr(r, 'type') + '/' + (attr(r, 'operator') || '') + '/' + kids(r).filter((x) => x.localName === 'formula' || x.localName === 'f').map((x) => x.textContent).join('&') + '/' + dxfSig(attr(r, 'dxfId') !== undefined ? dxfL[+attr(r, 'dxfId')] : kid(r, 'dxf'))).join('+')).sort().join(' ; '))
    put(nm + 'dv', desc(w, 'dataValidation').map((d) => (attr(d, 'sqref') || kid(d, 'sqref')?.textContent) + ':' + attr(d, 'type') + ':' + (kid(d, 'formula1')?.textContent || '')).sort().join(' ; '))
    put(nm + 'links', desc(w, 'hyperlink').map((h) => attr(h, 'ref') + '->' + (attr(h, 'id') ? sr[attr(h, 'id')]?.target : '#' + (attr(h, 'location') || '').replace(/'([^'!]+)'!/, '$1!')) + (attr(h, 'display') ? ' "' + attr(h, 'display') + '"' : '') + (attr(h, 'tooltip') ? ' tip=' + attr(h, 'tooltip') : '')).join(' ; '))
    const pane = one(w, 'pane')
    put(nm + 'pane', pane ? [attr(pane, 'xSplit'), attr(pane, 'ySplit'), attr(pane, 'state'), attr(pane, 'topLeftCell')].join('/') : '')
    put(nm + 'cols', desc(w, 'col').map((c) => attr(c, 'min') + '-' + attr(c, 'max') + ':w' + parseFloat(attr(c, 'width')) + (attr(c, 'hidden') === '1' ? ':hidden' : '')).join(','))
    put(nm + 'rows', desc(w, 'row').filter((r) => attr(r, 'customHeight') === '1' || attr(r, 'hidden') === '1').map((r) => attr(r, 'r') + ':' + (attr(r, 'customHeight') === '1' ? 'h' + parseFloat(attr(r, 'ht')) : '') + (attr(r, 'hidden') === '1' ? 'hidden' : '')).join(','))
    put(nm + 'autoFilter', attr(one(w, 'autoFilter'), 'ref') || '')
    put(nm + 'tabColor', attr(one(w, 'tabColor'), 'rgb') || '')
    put(nm + 'page', (attr(one(w, 'pageSetup'), 'orientation') || '') + '/' + (attr(one(w, 'pageSetup'), 'paperSize') || '') + '/hdr=' + (one(w, 'oddHeader')?.textContent || ''))
    const cm = pkg.relByType(sp, 'comments')
    put(nm + 'notes', cm ? desc(pkg.xml(cm.part), 'comment').map((c) => attr(c, 'ref') + ':' + desc(c, 't').map((t) => t.textContent).join('')).sort().join(' ; ') : '')
    const th = pkg.relByType(sp, 'threadedComment')
    put(nm + 'threaded', th ? desc(pkg.xml(th.part), 'threadedComment').map((t) => attr(t, 'ref') + (attr(t, 'parentId') ? '(reply)' : '') + ':' + (one(t, 'text')?.textContent || '')).sort().join(' ; ') : '')
  }
}

function slideSig(pkg, put) {
  const pp = 'ppt/presentation.xml'
  const pr = pkg.xml(pp)
  const rels = Object.fromEntries(pkg.rels(pp).map((r) => [r.id, r]))
  const sz = one(pr, 'sldSz')
  put('p.size', attr(sz, 'cx') + 'x' + attr(sz, 'cy'))
  const masterPart = rels[one(pr, 'sldMasterId')?.getAttributeNS(NS.r, 'id')]?.part
  put('p.theme', themeSig(pkg, (masterPart && pkg.relByType(masterPart, 'theme')?.part) || pkg.relByType(pp, 'theme')?.part))
  put('p.embeddedFonts', desc(pr, 'embeddedFont').map((e) => attr(kid(e, 'font'), 'typeface') + ':' + kids(e).filter((c) => c.localName !== 'font').map((c) => c.localName + '->' + (rels[c.getAttributeNS(NS.r, 'id')]?.part && pkg.has(rels[c.getAttributeNS(NS.r, 'id')].part) ? hashBytes(pkg.bytes(rels[c.getAttributeNS(NS.r, 'id')].part)) : 'missing')).join('/')).join(' ; '))
  put('p.defaultTextStyle', rprSig(one(one(pr, 'defaultTextStyle'), 'defRPr')) + ' lang=' + attr(one(one(pr, 'defaultTextStyle'), 'defRPr'), 'lang'))
  const sldIds = kids(one(pr, 'sldIdLst'), 'sldId')
  const idToIdx = {}
  sldIds.forEach((s, i) => { idToIdx[attr(s, 'id')] = i + 1 })
  put('p.sections', desc(pr, 'section').map((s) => attr(s, 'name') + ':' + desc(s, 'sldId').map((x) => idToIdx[attr(x, 'id')]).join(',')).join(' ; '))
  const runSig = (r) => {
    const p = kid(r, 'rPr')
    if (!p) return '-'
    const link = !!kid(p, 'hlinkClick')
    return ['sz', 'b', 'i', 'u', 'strike'].map((n) => (attr(p, n) && !(n === 'u' && link && attr(p, n) === 'sng') ? n + '=' + attr(p, n) : '')).filter(Boolean)
      .concat(['latin', 'ea', 'cs'].map((n) => (kid(p, n) ? n + '=' + attr(kid(p, n), 'typeface') : '')).filter(Boolean))
      .concat(kid(p, 'solidFill') ? ['color=' + colorNorm(attr(kid(kid(p, 'solidFill'), 'srgbClr'), 'val') || attr(kid(kid(p, 'solidFill'), 'schemeClr'), 'val'))] : [])
      .concat(link ? ['link'] : []).join(',')
  }
  const lineSig = (ln) => !ln ? '' : ['w', 'cmpd', 'cap'].map((n) => attr(ln, n) || '').join('/') + ':' + (attr(one(ln, 'srgbClr'), 'val') || attr(one(ln, 'schemeClr'), 'val') || (kid(ln, 'noFill') ? 'none' : '')) + ':' + (attr(kid(ln, 'prstDash'), 'val') || '')
  sldIds.forEach((sid, i) => {
    const sp = rels[sid.getAttributeNS(NS.r, 'id')]?.part
    const s = pkg.xml(sp)
    if (!s) return
    const sr = Object.fromEntries(pkg.rels(sp).map((r) => [r.id, r]))
    const nm = 'p.s' + (i + 1) + '.'
    put(nm + 'show', attr(s.documentElement, 'show') || '1')
    const lay = pkg.relByType(sp, 'slideLayout')
    put(nm + 'layout', attr(one(pkg.xml(lay?.part), 'cSld'), 'name') || lay?.part || '')
    put(nm + 'paras', desc(s, 'p', NS.a).map((p) => desc(p, 't', NS.a).map((t) => t.textContent).join('')).join(' ¶ '))
    const rf = {}
    for (const r of desc(s, 'r', NS.a)) { if (!kid(r, 't')?.textContent) continue; const k = runSig(r); rf[k] = (rf[k] || 0) + 1 }
    put(nm + 'runFormats', Object.entries(rf).map(([k, v]) => k + ' x' + v).sort().join(' ; '))
    put(nm + 'paraFormats', desc(s, 'pPr', NS.a).map((p) => realAttrs(p).map((a) => a.localName + '=' + a.value).concat(kids(p).filter((c) => realAttrs(c).length || c.children.length).map((c) => c.localName + (attr(c, 'char') ? '=' + attr(c, 'char') : attr(c, 'typeface') ? '=' + attr(c, 'typeface') : ''))).join('&')).filter(Boolean).join(' ; '))
    put(nm + 'links', desc(s, 'hlinkClick').map((h) => sr[h.getAttributeNS(NS.r, 'id')]?.target || '').join(','))
    put(nm + 'pics', desc(s, 'pic', NS.p).map((p) => { const id = one(p, 'blip')?.getAttributeNS(NS.r, 'embed'); return attr(one(p, 'cNvPr'), 'descr') + '|' + (sr[id]?.part && pkg.has(sr[id].part) ? hashBytes(pkg.bytes(sr[id].part)) : 'norel') + '|' + attr(one(p, 'ext'), 'cx') + 'x' + attr(one(p, 'ext'), 'cy') }).join(' ; '))
    desc(s, 'graphicFrame', NS.p).forEach((gf) => {
      const t = one(gf, 'tbl')
      if (!t) return
      const tn = nm + 'tbl[' + attr(one(gf, 'cNvPr'), 'name') + ']'
      put(tn, kids(t, 'tr').map((r) => kids(r, 'tc').map((c) => (attr(c, 'gridSpan') ? 'span' + attr(c, 'gridSpan') : '') + (attr(c, 'hMerge') ? 'hm' : '') + (attr(c, 'rowSpan') ? 'rs' + attr(c, 'rowSpan') : '') + (attr(c, 'vMerge') ? 'vm' : '') + '[' + c.textContent + ']').join('|')).join(' / '))
      put(tn + '.lines', kids(t, 'tr').map((r) => kids(r, 'tc').map((c) => LINE_NAMES.map((ln) => lineSig(kid(kid(c, 'tcPr'), ln))).join(',')).join('|')).join(' / '))
    })
    put(nm + 'shapes', desc(s, 'sp', NS.p).map((sh) => {
      const spPr = kid(sh, 'spPr')
      const x = kid(spPr, 'xfrm')
      return attr(one(sh, 'cNvPr'), 'name') + ':' + (attr(kid(spPr, 'prstGeom'), 'prst') || '-') + (attr(x, 'rot') ? ' rot' + attr(x, 'rot') : '') + ' @' + attr(kid(x, 'off'), 'x') + ',' + attr(kid(x, 'off'), 'y') + ' ' + attr(kid(x, 'ext'), 'cx') + 'x' + attr(kid(x, 'ext'), 'cy') + (kid(spPr, 'solidFill') ? ' fill=' + attr(one(kid(spPr, 'solidFill'), 'srgbClr'), 'val') : '') + (kid(spPr, 'ln') ? ' ln=' + lineSig(kid(spPr, 'ln')) : '')
    }).join(' ; '))
    const tr = one(s, 'transition')
    // a transition without an effect or auto-advance time does nothing (the editor writes one on every slide)
    put(nm + 'transition', tr && (tr.children.length || attr(tr, 'advTm')) ? kids(tr).map((c) => c.localName).join(',') + ' spd=' + (attr(tr, 'spd') || '') + ' advTm=' + (attr(tr, 'advTm') || '') : '')
    put(nm + 'timing', one(s, 'timing') ? desc(one(s, 'timing'), 'cTn').length + ' nodes' : '')
    const ns = pkg.relByType(sp, 'notesSlide')
    put(nm + 'notes', ns ? desc(pkg.xml(ns.part), 't', NS.a).map((t) => t.textContent).join('') : '')
    put(nm + 'media', String(desc(s, 'videoFile').length + desc(s, 'audioFile').length + desc(s, 'media').length))
    put(nm + 'comments', String(pkg.rels(sp).filter((r) => /comment/i.test(r.type)).length))
  })
}

export const LINE_NAMES = ['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr']

export function formatOf(pkg) {
  if (pkg.has('word/document.xml')) return 'docx'
  if (pkg.has('xl/workbook.xml')) return 'xlsx'
  if (pkg.has('ppt/presentation.xml')) return 'pptx'
  return null
}

/** @returns {Record<string, string>} */
export function signature(pkg) {
  const S = {}
  const put = (k, v) => { S[k] = v == null ? '' : String(v) }
  common(pkg, put)
  const f = formatOf(pkg)
  if (f === 'docx') wordSig(pkg, put)
  if (f === 'xlsx') cellSig(pkg, put)
  if (f === 'pptx') slideSig(pkg, put)
  return S
}

export { Pkg }
