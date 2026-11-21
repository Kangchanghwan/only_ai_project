/**
 * Theme font scheme (all formats). The editor empties the Hangul script fonts and sets ea/cs to Arial.
 * If S's <a:fontScheme> equals B's, put O's back. Themes are matched by role
 * (document theme; for pptx each slide master's theme by order, and the notes master's theme).
 */
import { first, desc, NS } from '../xml.js'
import { same } from './util.js'

function themeRoles(pkg, ext) {
  const roles = new Map()
  if (ext === 'docx') { const r = pkg.relByType('word/document.xml', 'theme'); if (r) roles.set('main', r.part) }
  if (ext === 'xlsx') { const r = pkg.relByType('xl/workbook.xml', 'theme'); if (r) roles.set('main', r.part) }
  if (ext === 'pptx') {
    const pp = 'ppt/presentation.xml'
    // masters in presentation.xml order
    desc(pkg.xml(pp), 'sldMasterId').forEach((el, i) => {
      const m = pkg.relById(pp, el.getAttributeNS(NS.r, 'id'))
      const t = m && pkg.relByType(m.part, 'theme')
      if (t) roles.set('master' + i, t.part)
    })
    const nm = pkg.relByType(pp, 'notesMaster')
    const nt = nm && pkg.relByType(nm.part, 'theme')
    if (nt) roles.set('notesMaster', nt.part)
    const hm = pkg.relByType(pp, 'handoutMaster')
    const ht = hm && pkg.relByType(hm.part, 'theme')
    if (ht) roles.set('handoutMaster', ht.part)
  }
  return roles
}

export default {
  id: 'theme-fonts',
  label: '테마 글꼴',
  formats: ['docx', 'xlsx', 'pptx'],
  run(ctx) {
    const { O, B, S, ext } = ctx
    const ro = themeRoles(O, ext)
    const rb = themeRoles(B, ext)
    const rs = themeRoles(S, ext)
    for (const [role, sPart] of rs) {
      const oPart = ro.get(role)
      const bPart = rb.get(role)
      if (!oPart || !bPart) continue
      const sDoc = S.xml(sPart)
      const sFs = first(sDoc, 'fontScheme')
      const bFs = first(B.xml(bPart), 'fontScheme')
      const oFs = first(O.xml(oPart), 'fontScheme')
      if (!sFs || !bFs || !oFs) continue
      if (same(sFs, oFs)) continue
      if (same(sFs, bFs)) {
        sFs.parentNode.replaceChild(sDoc.importNode(oFs, true), sFs)
        S.touch(sPart)
        ctx.restored(this, 1)
      } else ctx.userChanged(this, 1)
    }
  },
}
