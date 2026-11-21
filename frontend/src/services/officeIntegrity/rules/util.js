/** Helpers shared by the three-way rules (O = original, B = baseline save, S = user's save). */
import { canon, kids, kid } from '../xml.js'

export const same = (a, b) => canon(a) === canon(b)

/** Attribute value by namespace + localName, null when absent. */
export const getA = (el, ns, ln) => (el && el.hasAttributeNS(ns, ln) ? el.getAttributeNS(ns, ln) : null)

/** Set or remove a namespaced attribute, using the given prefix when creating it. */
export function setA(el, ns, prefix, ln, value) {
  if (value == null) { if (el.hasAttributeNS(ns, ln)) el.removeAttributeNS(ns, ln); return }
  if (el.getAttributeNS(ns, ln) === value && el.hasAttributeNS(ns, ln)) return
  el.setAttributeNS(ns, prefix ? prefix + ':' + ln : ln, value)
}

/**
 * Attribute-level three-way merge on one element.
 * For each name: S == B (user left it) -> take O's value; S != B -> keep S.
 * @returns {{ restored: number, user: number }}
 */
export function mergeAttrs(sEl, oEl, bEl, names, ns, prefix, norm = (n, v) => v) {
  let restored = 0
  let user = 0
  for (const n of names) {
    const o = getA(oEl, ns, n)
    const b = norm(n, getA(bEl, ns, n))
    const s = norm(n, getA(sEl, ns, n))
    if (s === b) {
      if (getA(sEl, ns, n) !== o) { setA(sEl, ns, prefix, n, o); restored++ }
    } else user++
  }
  return { restored, user }
}

/**
 * Child-element three-way merge inside one container (e.g. w:rPr of docDefaults).
 * For each child localName: S child equals B child -> make it O's child (or remove when O has none).
 * Children are then ordered by `order` (schema sequence); unknown names keep their relative place at the end.
 */
export function mergeChildren(doc, sBox, oBox, bBox, order) {
  const names = new Set([...kids(oBox), ...kids(bBox), ...kids(sBox)].map((c) => c.localName))
  let restored = 0
  let user = 0
  for (const ln of names) {
    const o = kid(oBox, ln)
    const b = kid(bBox, ln)
    const s = kid(sBox, ln)
    if ((s == null && b == null) || (s && b && same(s, b))) {
      if (o == null && s) { sBox.removeChild(s); restored++ }
      else if (o && !(s && same(s, o))) {
        const n = doc.importNode(o, true)
        if (s) sBox.replaceChild(n, s)
        else sBox.appendChild(n)
        restored++
      }
    } else user++
  }
  if (order) sortChildren(sBox, order)
  return { restored, user }
}

export function sortChildren(box, order) {
  const ch = kids(box)
  const rank = (c) => { const i = order.indexOf(c.localName); return i < 0 ? order.length : i }
  const sorted = ch.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0])
  if (sorted.some((c, i) => c !== ch[i])) {
    for (const c of ch) box.removeChild(c)
    for (const c of sorted) box.appendChild(c)
    return true
  }
  return false
}
