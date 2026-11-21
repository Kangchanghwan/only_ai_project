/**
 * Border box merge used by the docx border rules. A "box" is w:tblBorders, w:tcBorders, w:pBdr or w:pgBorders;
 * its children are the sides (top, left, ...). The editor only knows "single" and writes auto colors as 000000,
 * size and color are kept. Attribute-level three-way per side.
 */
import { NS, kids, kid } from '../xml.js'
import { mergeAttrs, sortChildren, same } from './util.js'

export const BORDER_ATTRS = ['val', 'sz', 'color', 'space', 'shadow', 'frame', 'themeColor', 'themeTint', 'themeShade']
const SIDE_ORDER = ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV', 'tl2br', 'tr2bl', 'between', 'bar']

export const PARENT_ORDER = {
  tblPr: ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription', 'tblPrChange'],
  tcPr: ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers', 'cellIns', 'cellDel', 'cellMerge', 'tcPrChange'],
  pPr: ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  sectPr: ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'],
}

const norm = (n, v) => (v != null && n === 'color' ? v.toUpperCase() : v)

/**
 * Merge one box. sBox may be null (then it is created inside sParent when O needs it).
 * @returns {{ restored: number, user: number }}
 */
export function mergeBox(doc, sParent, boxName, sBox, oBox, bBox) {
  let restored = 0
  let user = 0
  if (!sBox) {
    // whole box missing in S: restore only when B lacks it too
    if (!oBox || bBox || !sParent) return { restored, user: bBox ? 1 : 0 }
    const n = doc.importNode(oBox, true)
    sParent.appendChild(n)
    if (PARENT_ORDER[sParent.localName]) sortChildren(sParent, PARENT_ORDER[sParent.localName])
    return { restored: 1, user }
  }
  const names = new Set([...kids(oBox), ...kids(bBox), ...kids(sBox)].map((c) => c.localName))
  for (const side of names) {
    const o = kid(oBox, side)
    const b = kid(bBox, side)
    const s = kid(sBox, side)
    if (s && b) {
      if (!o) { if (same(s, b)) { sBox.removeChild(s); restored++ } else user++; continue }
      const r = mergeAttrs(s, o, b, BORDER_ATTRS, NS.w, 'w', norm)
      restored += r.restored
      user += r.user
    } else if (!s && !b) {
      if (o) { sBox.appendChild(doc.importNode(o, true)); restored++ }
    } else user++ // added or removed by the user
  }
  sortChildren(sBox, SIDE_ORDER)
  // the editor writes tcBorders before tcW; put the parent in schema order when every child is known
  const order = sParent && PARENT_ORDER[sParent.localName]
  if (order && kids(sParent).every((c) => order.includes(c.localName))) sortChildren(sParent, order)
  return { restored: restored ? 1 : 0, user: user ? 1 : 0 }
}

/** Make the sides of sBox like oRef where they equal bRef (used for new rows / paragraphs). */
export function inheritBox(doc, sBox, oRef, bRef) {
  if (!sBox || !oRef || !bRef) return false
  const names = new Set([...kids(oRef), ...kids(bRef), ...kids(sBox)].map((c) => c.localName))
  // only when every side of the new box looks exactly like the neighbour's baseline
  for (const side of names) {
    const s = kid(sBox, side)
    const b = kid(bRef, side)
    if (!s !== !b) return false
    if (s && BORDER_ATTRS.some((n) => norm(n, s.getAttributeNS(NS.w, n) || null) !== norm(n, b.getAttributeNS(NS.w, n) || null))) return false
  }
  let changed = false
  for (const side of names) {
    const s = kid(sBox, side)
    const o = kid(oRef, side)
    if (s && !o) { sBox.removeChild(s); changed = true; continue }
    if (!o) continue
    if (!s) { sBox.appendChild(doc.importNode(o, true)); changed = true; continue }
    for (const n of BORDER_ATTRS) {
      const ov = o.hasAttributeNS(NS.w, n) ? o.getAttributeNS(NS.w, n) : null
      const sv = s.hasAttributeNS(NS.w, n) ? s.getAttributeNS(NS.w, n) : null
      if (ov === sv) continue
      if (ov == null) s.removeAttributeNS(NS.w, n)
      else s.setAttributeNS(NS.w, 'w:' + n, ov)
      changed = true
    }
  }
  sortChildren(sBox, SIDE_ORDER)
  return changed
}
