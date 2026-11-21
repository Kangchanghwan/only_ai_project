/** Test helpers for officeIntegrity (imported by *.test.js only). */
import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import { Pkg } from './pkg.js'
import { isWellFormed, serializeXml } from './xml.js'
import { restoreAfterSave } from './index.js'
import { signature } from './check/signature.js'

export const fx = (name) => new Uint8Array(readFileSync(new URL('./__fixtures__/' + name, import.meta.url)))
export const extOf = (name) => name.split('.').pop()

/** Fixtures were saved from the given original, so it is also the prepared file (no ids added by us). */
export async function restore(O, B, S, ext, ctx = { prepared: O, addedParaIds: [] }) {
  return restoreAfterSave({ original: O, baseline: B, saved: S, ext, ctx })
}

export const pkg = (bytes) => Pkg.from(bytes)

/** Change one XML part with a DOM callback and return new bytes. */
export async function tweak(bytes, part, fn) {
  const p = await Pkg.from(bytes)
  const doc = p.xml(part)
  fn(doc, p)
  p.touch(part)
  return p.toBytes()
}

export async function expectValid(bytes) {
  const p = await Pkg.from(bytes)
  for (const n of p.xmlParts().filter((x) => !/\.vml$/i.test(x))) expect(isWellFormed(p.text(n)), n).toBe(true)
  return p
}

/** XML text of every part, for "same result" comparisons. */
export async function partTexts(bytes) {
  const p = await Pkg.from(bytes)
  const out = {}
  for (const n of p.names().sort()) out[n] = /\.(xml|rels|vml)$/i.test(n) ? p.text(n) : 'bin:' + p.bytes(n).length
  return out
}

/** Restore twice; the second run must not change anything. */
export async function expectIdempotent(O, B, S, ext) {
  const r1 = await restore(O, B, S, ext)
  const r2 = await restore(O, B, r1.bytes, ext)
  expect(await partTexts(r2.bytes)).toEqual(await partTexts(r1.bytes))
  return r1
}

export const sig = async (bytes) => signature(await Pkg.from(bytes))
export { serializeXml }
