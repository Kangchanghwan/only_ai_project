/**
 * pptx embedded fonts. The editor drops ppt/fonts/*.fntdata, p:embeddedFontLst, the relationships
 * and the content type. If O embeds a font that S/B lack, copy it back. Font bytes are opaque.
 */
import { NS, kids, kid, attr } from '../xml.js'
import { copyFontPart, ensureFontType } from './fontsShared.js'

const PP = 'ppt/presentation.xml'
// elements that come after p:embeddedFontLst in CT_Presentation
const AFTER = ['custShowLst', 'photoAlbum', 'custDataLst', 'kinsoku', 'defaultTextStyle', 'modifyVerifier', 'extLst']

const fontsOf = (doc) => kids(kid(doc?.documentElement, 'embeddedFontLst'), 'embeddedFont')
const face = (ef) => attr(kid(ef, 'font'), 'typeface')

export default {
  id: 'pptx-embedded-fonts',
  label: '프레젠테이션에 포함된 글꼴',
  formats: ['pptx'],
  run(ctx) {
    const { O, B, S } = ctx
    const o = O.xml(PP)
    const s = S.xml(PP)
    if (!o || !s) return
    const oFonts = fontsOf(o)
    if (!oFonts.length) return
    const sFaces = new Set(fontsOf(s).map(face))
    const bFaces = new Set(fontsOf(B.xml(PP)).map(face))
    const missing = oFonts.filter((ef) => !sFaces.has(face(ef)) && !bFaces.has(face(ef)))
    if (!missing.length) return
    let list = kid(s.documentElement, 'embeddedFontLst')
    if (!list) {
      list = s.createElementNS(NS.p, 'p:embeddedFontLst')
      const after = kids(s.documentElement).find((c) => AFTER.includes(c.localName))
      s.documentElement.insertBefore(list, after || null)
    }
    for (const ef of missing) {
      const n = s.importNode(ef, true)
      for (const c of kids(n).filter((x) => x.localName !== 'font')) {
        const rel = O.relById(PP, c.getAttributeNS(NS.r, 'id'))
        if (!rel || !O.has(rel.part)) { n.removeChild(c); continue }
        const part = copyFontPart(O, S, rel.part)
        ensureFontType(O, S, part)
        c.setAttributeNS(NS.r, 'r:id', S.addRel(PP, rel.typeUri, part, rel.id))
      }
      list.appendChild(n)
    }
    // flags on <p:presentation>: restore when O had them and S == B
    const root = s.documentElement
    for (const a of ['embedTrueTypeFonts', 'saveSubsetFonts']) {
      const ov = o.documentElement.getAttribute(a)
      const bv = B.xml(PP)?.documentElement.getAttribute(a)
      if (ov != null && root.getAttribute(a) === bv && root.getAttribute(a) !== ov) root.setAttribute(a, ov)
    }
    S.touch(PP)
    ctx.restored(this, missing.length)
  },
}
