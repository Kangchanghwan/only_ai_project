// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fx, restore, pkg, tweak, expectValid, expectIdempotent } from '../testUtil.js'
import { desc, attr } from '../xml.js'

const O = fx('xlsx-notes.O.xlsx')
const B = fx('xlsx-notes.B.xlsx')
const SHEET = 'xl/worksheets/sheet2.xml'

async function state(bytes) {
  const p = await expectValid(bytes)
  const cm = p.relByType(SHEET, 'comments')
  const th = p.relByType(SHEET, 'threadedComment')
  const vml = p.relByType(SHEET, 'vmlDrawing')
  const d = p.xml(cm.part)
  const authors = desc(d, 'author').map((a) => a.textContent)
  return {
    p,
    notes: Object.fromEntries(desc(d, 'comment').map((c) => [attr(c, 'ref'), { author: authors[+attr(c, 'authorId')], text: desc(c, 't').map((t) => t.textContent).join('') }])),
    authors,
    threads: th ? desc(p.xml(th.part), 'threadedComment').map((t) => attr(t, 'ref')) : [],
    vml: vml ? p.text(vml.part) : '',
    persons: !!p.relByType('xl/workbook.xml', 'person'),
    threadCT: p.text('[Content_Types].xml').includes('threadedcomments+xml'),
  }
}

describe('rule: xlsx notes', { timeout: 30_000 }, () => {
  it('fast path: untouched note becomes the original legacy note, thread and persons removed', async () => {
    const { bytes } = await restore(O, B, B, 'xlsx')
    const s = await state(bytes)
    const o = await state(O)
    expect(s.notes).toEqual(o.notes)
    expect(s.threads).toEqual([])
    expect(s.persons).toBe(false)
    expect(s.threadCT).toBe(false)
    expect(s.vml).toBe(o.vml)
  })

  it('mixed: untouched note restored, comment the user added stays threaded', async () => {
    const { bytes, report } = await restore(O, B, fx('xlsx-notes.S-newcomment.xlsx'), 'xlsx')
    const s = await state(bytes)
    expect(s.notes.B2).toEqual({ author: '시험자', text: '셀 메모 내용' })
    expect(s.threads).toEqual(['C2'])
    expect(s.persons).toBe(true)
    expect(s.notes.C2.text).toContain('새로 단 주석')
    expect(s.authors.length).toBe(new Set(Object.values(s.notes).map((n) => n.author)).size) // no unused authors
    expect(s.vml).not.toMatch(/o:gfxdata="[^"]*"[^>]*>(?:(?!<\/v:shape>)[\s\S])*<x:Row>1<\/x:Row>\s*<x:Column>1</)
    expect(report.userChanged.find((r) => r.id === 'xlsx-notes').count).toBe(1)
  })

  it('edited note text without replies becomes a plain note with the new text and the original author', async () => {
    const { bytes } = await restore(O, B, fx('xlsx-notes.S-editednote.xlsx'), 'xlsx')
    const s = await state(bytes)
    expect(s.notes.B2).toEqual({ author: '시험자', text: '셀 메모 내용 (고침)' })
    expect(s.threads).toEqual(['C2'])
    // restored shape takes the original anchor
    expect(s.vml).toContain('<x:Anchor>2, 15, 0, 2, 4, 15, 4, 4</x:Anchor>')
  })

  it('a note with a reply stays threaded', async () => {
    const S = await tweak(B, 'xl/threadedComments/threadedComment1.xml', (d) => {
      const top = desc(d, 'threadedComment')[0]
      const r = top.cloneNode(true)
      r.setAttribute('id', '{11111111-2222-3333-4444-555555555555}')
      r.setAttribute('parentId', attr(top, 'id'))
      desc(r, 'text')[0].textContent = '답글'
      d.documentElement.appendChild(r)
    })
    const { bytes } = await restore(O, B, S, 'xlsx')
    const s = await state(bytes)
    expect(s.threads.length).toBe(2)
    expect(s.persons).toBe(true)
  })

  it('is idempotent', async () => {
    await expectIdempotent(O, B, fx('xlsx-notes.S-newcomment.xlsx'), 'xlsx')
    await expectIdempotent(O, B, fx('xlsx-notes.S-editednote.xlsx'), 'xlsx')
    await expectIdempotent(O, B, B, 'xlsx')
  })
})
