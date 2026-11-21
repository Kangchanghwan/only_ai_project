// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readZip, writeZip } from './zip.js'
import { fx } from './testUtil.js'

describe('officeIntegrity zip', () => {
  it('reads a real editor output and writes it back without losing bytes', async () => {
    const files = await readZip(fx('docx-t1.B.docx'))
    expect(files.has('word/document.xml')).toBe(true)
    const again = await readZip(await writeZip(files))
    expect([...again.keys()].sort()).toEqual([...files.keys()].sort())
    for (const [k, v] of files) expect(Buffer.from(again.get(k)).equals(Buffer.from(v)), k).toBe(true)
  })

  it('puts [Content_Types].xml first and compresses', async () => {
    const files = new Map([['a.xml', new TextEncoder().encode('<a>' + 'x'.repeat(5000) + '</a>')], ['[Content_Types].xml', new TextEncoder().encode('<Types/>')]])
    const out = await writeZip(files)
    expect(out.length).toBeLessThan(1000)
    expect([...(await readZip(out)).keys()][0]).toBe('[Content_Types].xml')
  })
})
