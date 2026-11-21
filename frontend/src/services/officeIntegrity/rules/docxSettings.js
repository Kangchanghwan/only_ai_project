/** word/settings.xml w:themeFontLang: the editor writes eastAsia zh-CN instead of ko-KR. Attribute-level three-way. */
import { NS, kid } from '../xml.js'
import { mergeAttrs } from './util.js'

export default {
  id: 'docx-theme-font-lang',
  label: '테마 글꼴 언어',
  formats: ['docx'],
  run(ctx) {
    const part = 'word/settings.xml'
    const s = ctx.S.xml(part)
    const o = ctx.O.xml(part)
    const b = ctx.B.xml(part)
    if (!s || !o || !b) return
    const oe = kid(o.documentElement, 'themeFontLang')
    const be = kid(b.documentElement, 'themeFontLang')
    const se = kid(s.documentElement, 'themeFontLang')
    if (!oe || !be || !se) return
    const r = mergeAttrs(se, oe, be, ['val', 'eastAsia', 'bidi'], NS.w, 'w')
    if (r.restored) { ctx.S.touch(part); ctx.restored(this, 1) }
    if (r.user) ctx.userChanged(this, 1)
  },
}
