/**
 * docx embedded fonts. The editor drops word/fonts/*.odttf, the w:embed* entries in fontTable.xml,
 * their relationships, the settings flags and the odttf content type.
 * If O embeds a font and S/B do not, copy it back. Font bytes are opaque.
 */
import { NS, kids, kid, desc, attr } from '../xml.js'
import { copyFontPart, ensureFontType } from './fontsShared.js'
import { same } from './util.js'

const isEmbed = (c) => /^embed/.test(c.localName)
// CT_Settings sequence up to the font flags
const SETTINGS_BEFORE = ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts']

function fontTablePart(pkg) {
  return pkg.relByType('word/document.xml', 'fontTable')?.part || 'word/fontTable.xml'
}

function restoreFlags(ctx, rule) {
  const part = 'word/settings.xml'
  const o = ctx.O.xml(part)
  const s = ctx.S.xml(part)
  const b = ctx.B.xml(part)
  if (!o || !s) return 0
  let n = 0
  for (const ln of ['embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts']) {
    const oe = kid(o.documentElement, ln)
    const se = kid(s.documentElement, ln)
    const be = kid(b?.documentElement, ln)
    if (!oe || se || be) continue
    const el = s.importNode(oe, true)
    const rank = SETTINGS_BEFORE.indexOf(ln)
    const after = kids(s.documentElement).find((c) => { const r = SETTINGS_BEFORE.indexOf(c.localName); return r < 0 || r > rank })
    s.documentElement.insertBefore(el, after || null)
    n++
  }
  if (n) ctx.S.touch(part)
  return n
}

export default {
  id: 'docx-embedded-fonts',
  label: '문서에 포함된 글꼴',
  formats: ['docx'],
  run(ctx) {
    const { O, B, S } = ctx
    const oPart = fontTablePart(O)
    const sPart = fontTablePart(S)
    const oft = O.xml(oPart)
    const sft = S.xml(sPart)
    if (!oft || !sft) return
    const bft = B.xml(fontTablePart(B))
    const named = (doc, name) => desc(doc, 'font', NS.w).find((f) => attr(f, 'name') === name) || null
    let n = 0
    for (const of of desc(oft, 'font', NS.w).filter((f) => kids(f).some(isEmbed))) {
      const name = attr(of, 'name')
      const sf = named(sft, name)
      const bf = named(bft, name)
      if (sf && kids(sf).some(isEmbed)) continue // still embedded
      if (bf && kids(bf).some(isEmbed)) continue
      if (sf && bf && !same(sf, bf)) { ctx.userChanged(this, 1); continue }
      const nf = sft.importNode(of, true)
      for (const e of kids(nf).filter(isEmbed)) {
        const rel = O.relById(oPart, e.getAttributeNS(NS.r, 'id'))
        if (!rel || !O.has(rel.part)) { nf.removeChild(e); continue }
        const part = copyFontPart(O, S, rel.part)
        ensureFontType(O, S, part)
        const id = S.addRel(sPart, rel.typeUri, part, rel.id)
        e.setAttributeNS(NS.r, 'r:id', id)
      }
      if (sf) sf.parentNode.replaceChild(nf, sf)
      else sft.documentElement.appendChild(nf)
      n++
    }
    if (n) {
      S.touch(sPart)
      restoreFlags(ctx, this)
      ctx.restored(this, n)
    }
  },
}
