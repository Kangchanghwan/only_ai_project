/** Copy an opaque font part from O into S under a free name. Returns the new part name. */
export function copyFontPart(O, S, oPart) {
  let name = oPart
  if (S.has(name)) {
    const m = oPart.match(/^(.*?)(\d*)(\.[^./]+)$/)
    for (let i = 1; S.has(name); i++) name = m[1] + 'r' + i + m[3]
  }
  S.setBytes(name, O.bytes(oPart))
  return name
}

/** Make sure S's content types know the font extension (taken from O). */
export function ensureFontType(O, S, part) {
  const ext = part.split('.').pop()
  const type = O.defaultType(ext) || (O.overrideOf(part) && O.overrideOf(part).getAttribute('ContentType'))
  if (!type) return
  if (O.overrideOf(part)) S.addOverride(part, type)
  else S.addDefault(ext, type)
}
