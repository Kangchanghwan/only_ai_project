/**
 * Office data-integrity layer for the browser editor (ranuts/document, OnlyOffice based).
 *
 * The editor silently rewrites parts of a file on save. Flow:
 *  1. prepareForEditor(original)  -> bytes to open (docx: paragraph ids added as anchors) + ctx
 *  2. right after the document opens, save once without edits = baseline B
 *  3. precheck(O, B)              -> editor changes that no rule can undo (for a short notice)
 *  4. after the user saves S: restoreAfterSave(O, B, S) -> for every guarded item, S == B (untouched) puts O's
 *     value back, S != B (user changed it) keeps S. Then the checker lists what is still different.
 * Comparisons use a semantic signature, never raw bytes (two saves differ only in ids and timestamps).
 */
import { Pkg } from './pkg.js'
import { isWellFormed } from './xml.js'
import { RULES } from './rules/index.js'
import { addParaIds, removeParaIds } from './rules/docxParaIds.js'
import { signature, remainingDiffs } from './check/compare.js'

export const SUPPORTED = ['docx', 'xlsx', 'pptx']

const toU8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b))
const normExt = (ext) => String(ext || '').toLowerCase().replace(/^\./, '')

/** @returns {Promise<{ bytes: Uint8Array, ctx: { ext: string, prepared: Uint8Array, addedParaIds: string[] } }>} */
export async function prepareForEditor(bytes, ext) {
  ext = normExt(ext)
  const original = toU8(bytes)
  if (ext !== 'docx') return { bytes: original, ctx: { ext, prepared: original, addedParaIds: [] } }
  const pkg = await Pkg.from(original)
  const added = addParaIds(pkg)
  const out = added.length ? await pkg.toBytes() : original
  return { bytes: out, ctx: { ext, prepared: out, addedParaIds: added } }
}

function makeLog() {
  const restored = new Map()
  const user = new Map()
  const bump = (m, rule, n) => { const cur = m.get(rule.id) || { id: rule.id, label: rule.label, count: 0 }; cur.count += n; m.set(rule.id, cur) }
  return {
    restored: (rule, n = 1) => bump(restored, rule, n),
    userChanged: (rule, n = 1) => bump(user, rule, n),
    lists: () => ({ restored: [...restored.values()], userChanged: [...user.values()] }),
  }
}

async function runRules(O, B, S, ext, ctxIn) {
  const log = makeLog()
  const errors = []
  const ctx = { O, B, S, ext, restored: log.restored, userChanged: log.userChanged }
  for (const rule of RULES) {
    if (!rule.formats.includes(ext)) continue
    try { rule.run(ctx) } catch (e) { errors.push({ id: rule.id, label: rule.label, message: String(e?.message || e) }) }
  }
  if (ext === 'docx') removeParaIds(S, ctxIn?.addedParaIds || [])
  return { ...log.lists(), errors }
}

function validate(pkg) {
  pkg.flushAll()
  return pkg.xmlParts().filter((n) => !/\.vml$/i.test(n)).filter((n) => !isWellFormed(pkg.text(n)))
}

/**
 * @returns {Promise<{ bytes: Uint8Array, report: { restored: object[], userChanged: object[], remaining: object[], errors: object[] } }>}
 */
export async function restoreAfterSave({ original, baseline, saved, ext, ctx }) {
  ext = normExt(ext || ctx?.ext)
  const savedU8 = toU8(saved)
  if (!SUPPORTED.includes(ext)) return { bytes: savedU8, report: { restored: [], userChanged: [], remaining: [], errors: [] } }
  const [O, B, S, O0, S0] = await Promise.all([
    Pkg.from(ctx?.prepared || original),
    Pkg.from(baseline),
    Pkg.from(savedU8),
    Pkg.from(original),
    Pkg.from(savedU8),
  ])
  const log = await runRules(O, B, S, ext, ctx)
  const bad = validate(S)
  if (bad.length) {
    // never hand out a broken file: fall back to the editor's own save
    return { bytes: savedU8, report: { restored: [], userChanged: log.userChanged, remaining: [{ key: 'invalid', label: '되돌리기 실패(편집기 저장본 그대로)', where: bad.join(', ') }], errors: log.errors } }
  }
  const bytes = await S.toBytes()
  const R = await Pkg.from(bytes)
  const remaining = remainingDiffs(signature(O0), signature(B), signature(S0), signature(R))
  return { bytes, report: { ...log, remaining } }
}

/** Editor changes (O vs B) that no rule restores: restore B against itself and list what is still different. */
export async function precheck({ original, baseline, ext, ctx }) {
  const { report } = await restoreAfterSave({ original, baseline, saved: baseline, ext, ctx })
  return { items: report.remaining }
}

export { signature }
export { TESTED_EDITOR_BUILDS, editorBuildStatus, checkEditorBuild } from './editorBuild.js'
