import { describe, it, expect, beforeEach } from 'vitest'
import { createHwpAgent, dismissRecoveryDialog, HwpAgentError } from './hwpAgent.js'

/**
 * 메모리 안의 가짜 HwpDocument. 실제 엔진에서 실측한 동작만 흉내 낸다.
 *  - 읽기: 여백·들여쓰기·문단 간격은 px (= 쓰기 값 / 150, 간격은 / 75), 소수 한 자리
 *  - 쓰기: 여백·들여쓰기는 pt×200, 간격·글자 크기는 pt×100
 *  - splitParagraph 는 문단 모양을 잇고, createTable 의 칸 문단은 표를 만든 문단의 모양을 물려받는다 (실측 결함)
 */
function makeDoc(paras) {
  const state = {
    paras: paras.map((p) => ({ text: p.text, ps: { align: 'justify', ml: 0, mr: 0, indent: 0, sb: 0, sa: 0, ls: 160, lsType: 'Percent', ...(p.ps || {}) }, cs: { size: 1000, bold: false, font: '함초롬바탕', ...(p.cs || {}) }, ctrls: p.ctrls || [] })),
    calls: [],
    mutations: 0,
  }
  const px = (raw, k) => Math.round((raw / k) * 10) / 10
  const need = (i) => { if (!state.paras[i]) throw new Error('문단 인덱스 범위 초과 ' + i); return state.paras[i] }
  const mut = (name, fn) => (...args) => { state.mutations++; state.calls.push(name); return fn(...args) }
  const OK = JSON.stringify({ ok: true })
  const d = {
    getSectionCount: () => 1,
    getParagraphCount: () => state.paras.length,
    getParagraphLength: (s, i) => need(i).text.length,
    getLogicalLength: (s, i) => need(i).text.length + need(i).ctrls.length * 8,
    getTextRange: (s, i, off, n) => need(i).text.slice(off, off + n),
    getControlTextPositions: (s, i) => JSON.stringify(need(i).ctrls.map(() => 0)),
    getParaPropertiesAt: (s, i) => {
      const p = need(i).ps
      return JSON.stringify({ alignment: p.align, lineSpacing: p.ls, lineSpacingType: p.lsType, marginLeft: px(p.ml, 150), marginRight: px(p.mr, 150), indent: px(p.indent, 150), spacingBefore: px(p.sb, 75), spacingAfter: px(p.sa, 75), paraShapeId: 1, headType: p.head || 'None' })
    },
    getCharPropertiesAt: (s, i) => {
      const c = need(i).cs
      return JSON.stringify({ fontFamily: c.font, fontSize: c.size, bold: c.bold, charShapeId: 3 })
    },
    getStyleAt: () => JSON.stringify({ id: 0, name: '바탕글' }),
    getControls: () => {
      const out = []
      state.paras.forEach((p, i) => p.ctrls.forEach((c, k) => out.push({ ctrlId: c.id, userDesc: c.desc || '', list: 0, para: i, controlIndex: k, props: { Width: 28346, Height: 14173 } })))
      return JSON.stringify(out)
    },
    getPictureProperties: (s, i, k) => { if (need(i).ctrls[k].pic) return '{}'; throw new Error('그림이 아닙니다') },
    getTextBoxControlIndex: (s, i) => need(i).ctrls.findIndex((c) => c.textbox),
    searchAllText: (q) => JSON.stringify(state.paras.flatMap((p, i) => (p.text.includes(q) ? [{ sec: 0, para: i, charOffset: p.text.indexOf(q), length: q.length }] : []))),
    getPageDef: () => JSON.stringify({ width: 59528, marginLeft: 5102, marginRight: 5102, marginGutter: 0 }),
    getTextFileUnicode: () => JSON.stringify(state.paras.map((p) => p.text).join('\r\n')),
    pageCount: () => 1,
    // 표
    getTableDimensions: (s, i, k) => { const t = need(i).ctrls[k]; return JSON.stringify({ rowCount: t.rows, colCount: t.cols, cellCount: t.rows * t.cols }) },
    getCellInfo: (s, i, k, c) => { const t = need(i).ctrls[k]; return JSON.stringify({ row: Math.floor(c / t.cols), col: c % t.cols, rowSpan: 1, colSpan: 1 }) },
    getCellParagraphCount: () => 1,
    getCellParagraphLength: (s, i, k, c) => need(i).ctrls[k].cells[c].text.length,
    getTextInCell: (s, i, k, c) => need(i).ctrls[k].cells[c].text,
    getTableProperties: (s, i, k) => JSON.stringify({ tableWidth: need(i).ctrls[k].width || 0 }),
    // 쓰기
    insertText: mut('insertText', (s, i, off, t) => { const p = need(i); p.text = p.text.slice(0, off) + t + p.text.slice(off); return OK }),
    deleteText: mut('deleteText', (s, i, off, n) => { const p = need(i); p.text = p.text.slice(0, off) + p.text.slice(off + n); return OK }),
    deleteParagraph: mut('deleteParagraph', (s, i) => { need(i); state.paras.splice(i, 1); return OK }),
    splitParagraph: mut('splitParagraph', (s, i) => { const p = need(i); state.paras.splice(i + 1, 0, { text: '', ps: { ...p.ps }, cs: { ...p.cs }, ctrls: [] }); return JSON.stringify({ ok: true, paraIdx: i + 1 }) }),
    setParaShapeId: mut('setParaShapeId', (s, i) => { need(i); return OK }),
    setCharShapeId: mut('setCharShapeId', (s, i) => { need(i); return OK }),
    applyParaFormat: mut('applyParaFormat', (s, i, json) => {
      const p = need(i).ps; const v = JSON.parse(json)
      if (v.alignment !== undefined) p.align = v.alignment
      if (v.marginLeft !== undefined) p.ml = v.marginLeft
      if (v.marginRight !== undefined) p.mr = v.marginRight
      if (v.indent !== undefined) p.indent = v.indent
      if (v.spacingBefore !== undefined) p.sb = v.spacingBefore
      if (v.spacingAfter !== undefined) p.sa = v.spacingAfter
      if (v.lineSpacing !== undefined) p.ls = v.lineSpacing
      return OK
    }),
    applyCharFormat: mut('applyCharFormat', (s, i, a, b, json) => { const c = need(i).cs; const v = JSON.parse(json); if (v.fontSize !== undefined) c.size = v.fontSize; if (v.bold !== undefined) c.bold = v.bold; return OK }),
    findOrCreateFontId: mut('findOrCreateFontId', () => 7),
    applyStyle: mut('applyStyle', () => OK),
    createTable: mut('createTable', (s, i, off, rows, cols) => {
      const p = need(i)
      const cells = Array.from({ length: rows * cols }, () => ({ text: '', ps: { ...p.ps } })) // 칸 문단이 본문 문단 모양을 물려받는다
      p.ctrls.push({ id: 'tbl', rows, cols, cells, width: 41952 })
      state.paras.splice(i + 1, 0, { text: '', ps: { ...p.ps }, cs: { ...p.cs }, ctrls: [] })
      return JSON.stringify({ ok: true, paraIdx: i, controlIdx: p.ctrls.length - 1 })
    }),
    setCellProperties: mut('setCellProperties', (s, i, k, c, json) => { const v = JSON.parse(json); if (v.width) need(i).ctrls[k].cells[c].width = v.width; if (v.fillColor) need(i).ctrls[k].cells[c].fill = v.fillColor; return OK }),
    setTableProperties: mut('setTableProperties', () => OK),
    applyParaFormatInCell: mut('applyParaFormatInCell', (s, i, k, c, cp, json) => {
      const cell = need(i).ctrls[k].cells[c]; const v = JSON.parse(json)
      if (v.marginLeft !== undefined) cell.ps.ml = v.marginLeft
      if (v.indent !== undefined) cell.ps.indent = v.indent
      if (v.alignment !== undefined) cell.ps.align = v.alignment
      return OK
    }),
    insertTextInCell: mut('insertTextInCell', (s, i, k, c, cp, off, t) => { need(i).ctrls[k].cells[c].text += t; return OK }),
    applyCharFormatInCell: mut('applyCharFormatInCell', (s, i, k, c, cp, a, b, json) => { const v = JSON.parse(json); const cell = need(i).ctrls[k].cells[c]; if (v.bold) cell.bold = true; if (v.fontSize) cell.size = v.fontSize; return OK }),
    deleteTableControl: mut('deleteTableControl', (s, i, k) => { need(i).ctrls.splice(k, 1); return OK }),
    deleteShapeControl: mut('deleteShapeControl', (s, i, k) => { need(i).ctrls.splice(k, 1); return OK }),
    deletePictureControl: mut('deletePictureControl', (s, i, k) => { need(i).ctrls.splice(k, 1); return OK }),
  }
  return { d, state }
}

/** studio 의 transaction / 명령 오류 경계를 흉내 낸다 (스냅샷 롤백, 트랩이면 잠금). */
function makeWindow(doc) {
  const { d, state } = doc
  const env = { txCount: 0, status: 'ready', undone: 0, redone: 0 }
  const snapshot = () => structuredClone(state.paras)
  const facade = {
    read: (fn) => fn(d),
    transaction(label, fn) {
      env.txCount++
      const before = snapshot()
      try {
        fn({ doc: () => d, deferPagination() {} })
      } catch (e) {
        state.paras = before // 스냅샷 롤백
        env.status = e && e.trap ? 'blocked' : 'ready'
        const err = new Error('Studio 편집 명령을 완료하지 못했습니다.')
        err.name = 'StudioCommandError'
        err.cause = e
        err.report = Promise.resolve({ recovery: e && e.trap ? 'unknown' : 'succeeded' })
        throw err
      }
    },
  }
  const win = {
    rhwpStudio: { plugins: { loaded: new Map([['hwpctrl', { facade, surface: { undo: () => { env.undone++ }, redo: () => { env.redone++ } } }]]) } },
    rhwpCommandErrors: { getState: () => ({ status: env.status }) },
  }
  return { win, env }
}

const sample = () => makeDoc([
  { text: '', ctrls: [{ id: 'secd' }, { id: 'cold' }] },
  { text: '제목입니다', ps: { align: 'center', ml: 4000, indent: -2000, sb: 700 }, cs: { size: 1600, bold: true } },
  { text: '본문 첫 줄' },
  { text: '', ctrls: [{ id: 'tbl', rows: 1, cols: 2, cells: [{ text: '작성방법' }, { text: '내용' }] }] },
  { text: '', ctrls: [{ id: 'gso', textbox: true, desc: '글상자' }] },
  { text: '끝' },
])

let doc, win, env, agent
beforeEach(() => {
  doc = sample()
  ;({ win, env } = makeWindow(doc))
  agent = createHwpAgent(() => Promise.resolve(win))
})

describe('단위 변환', () => {
  it('setParaShape(pt) 후 outline 이 같은 pt 값을 돌려준다', async () => {
    await agent.setParaShape(2, { left: 20, right: 5.5, indent: -10, before: 3.5, after: 1, lineSpacing: 150, align: 'right' })
    const [p] = await agent.outline({ from: 2, to: 2 })
    expect([p.left, p.right, p.indent, p.before, p.after, p.lineSpacing, p.align]).toEqual([20, 5.5, -10, 3.5, 1, 150, 'right'])
  })

  it('쓰기 값은 여백·들여쓰기 pt×200, 간격 pt×100 으로 나간다', async () => {
    await agent.setParaShape(2, { left: 20, indent: 7.5, before: 4 })
    expect(doc.state.paras[2].ps).toMatchObject({ ml: 4000, indent: 1500, sb: 400 })
  })

  it('setCharShape 크기는 pt×100, outline.size 는 pt', async () => {
    await agent.setCharShape(2, { size: 14, bold: true })
    expect(doc.state.paras[2].cs).toMatchObject({ size: 1400, bold: true })
    expect((await agent.outline({ from: 2, to: 2 }))[0].size).toBe(14)
  })

  it('잘못된 단위 입력은 거절한다', async () => {
    await expect(agent.setParaShape(2, { left: '20' })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    await expect(agent.setParaShape(2, { align: 'middle' })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    await expect(agent.setCharShape(2, { color: 'red' })).rejects.toMatchObject({ code: 'INVALID_ARG' })
  })
})

describe('검증은 WASM 호출 전에', () => {
  it('범위 밖 문단은 RANGE 로 거절하고 문서·트랜잭션을 건드리지 않는다', async () => {
    const before = doc.state.mutations
    for (const call of [
      () => agent.replaceParagraph(99, 'x'),
      () => agent.replaceParagraph(-1, 'x'),
      () => agent.insertParagraphAfter(99, 'x'),
      () => agent.insertParagraphAfter(2, 'x', { like: 99 }),
      () => agent.deleteParagraphs(3, 99),
      () => agent.setParaShape([4, 2], { left: 1 }),
      () => agent.setCharShape(2, { from: 3, to: 99, bold: true }),
      () => agent.insertTable(99, { rows: 2, cols: 2 }),
      () => agent.deleteObject({ para: 99, ctrlIdx: 0 }),
    ]) await expect(call()).rejects.toMatchObject({ code: 'RANGE' })
    expect(doc.state.mutations).toBe(before)
    expect(env.txCount).toBe(0)
  })

  it('줄바꿈이 든 글은 거절한다', async () => {
    await expect(agent.replaceParagraph(2, 'a\nb')).rejects.toMatchObject({ code: 'MULTILINE' })
    expect(doc.state.mutations).toBe(0)
  })
})

describe('replaceParagraph', () => {
  it('expect 가 다르면 EXPECT_MISMATCH 와 현재 글을 알려 준다', async () => {
    const err = await agent.replaceParagraph(2, '새 글', { expect: '다른 글' }).catch((e) => e)
    expect(err).toBeInstanceOf(HwpAgentError)
    expect(err).toMatchObject({ code: 'EXPECT_MISMATCH', actual: '본문 첫 줄' })
    expect(doc.state.paras[2].text).toBe('본문 첫 줄')
    expect(env.txCount).toBe(0)
  })

  it('expect 가 맞으면 글만 바꾸고 문단 모양은 그대로 둔다', async () => {
    const res = await agent.replaceParagraph(1, '새 제목', { expect: '제목입니다' })
    expect(res).toMatchObject({ i: 1, oldText: '제목입니다' })
    expect(doc.state.paras[1].text).toBe('새 제목')
    expect(doc.state.paras[1].ps.align).toBe('center')
    expect(doc.state.paras[1].cs.bold).toBe(true)
  })
})

describe('insertParagraphAfter', () => {
  it('새 문단 번호를 돌려주고 글이 들어간다', async () => {
    const r = await agent.insertParagraphAfter(1, '추가')
    expect(r).toEqual({ i: 2 })
    expect(doc.state.paras[2].text).toBe('추가')
    expect(doc.state.paras[3].text).toBe('본문 첫 줄')
  })

  it('like 가 다르면 그 문단의 모양을 따라 setParaShapeId/setCharShapeId 를 쓴다', async () => {
    await agent.insertParagraphAfter(2, '추가', { like: 1 })
    expect(doc.state.calls).toContain('setParaShapeId')
    expect(doc.state.calls).toContain('setCharShapeId')
  })
})

describe('deleteParagraphs', () => {
  it('컨트롤이 든 문단은 지우지 않고 글만 지우며 무엇을 남겼는지 알려 준다', async () => {
    doc.state.paras[3].text = '표 앞 글'
    const res = await agent.deleteParagraphs(0, 3)
    expect(res.deleted).toBe(2) // 1, 2
    expect(res.kept.map((k) => k.i)).toEqual([0, 3])
    expect(res.kept[0].controls).toEqual(['section', 'column'])
    expect(res.kept[1]).toMatchObject({ controls: ['table'], textCleared: true })
    expect(doc.state.paras.map((p) => p.ctrls.length)).toEqual([2, 1, 1, 0]) // 구역·표·글상자·끝
    expect(doc.state.paras[1].text).toBe('')
    expect(doc.state.paras[3].text).toBe('끝')
  })

  it('전체를 지워도 컨트롤 문단이 남는다', async () => {
    const res = await agent.deleteParagraphs(0, 5)
    expect(res.deleted).toBe(3) // 제목·본문·끝
    expect(res.kept.map((k) => k.i)).toEqual([0, 3, 4])
    expect(doc.state.paras).toHaveLength(3)
  })

  it('문단이 하나뿐이면 그 문단은 글만 지운다', async () => {
    const one = makeDoc([{ text: '혼자' }])
    const w = makeWindow(one)
    const res = await createHwpAgent(() => w.win).deleteParagraphs(0, 0)
    expect(res).toMatchObject({ deleted: 0, kept: [{ i: 0, textCleared: true }] })
    expect(one.state.paras).toHaveLength(1)
  })
})

describe('insertTable', () => {
  it('칸 문단의 여백·들여쓰기를 0 으로 되돌린다 (본문 문단 모양이 새지 않는다)', async () => {
    const r = await agent.insertTable(1, { rows: 2, cols: 2, cells: [['구분', '내용'], ['a', 'b']], header: { bold: true } })
    expect(r).toMatchObject({ rows: 2, cols: 2 })
    const table = doc.state.paras[r.para].ctrls[r.ctrlIdx]
    expect(table.cells.map((c) => c.text)).toEqual(['구분', '내용', 'a', 'b'])
    for (const c of table.cells) expect(c.ps).toMatchObject({ ml: 0, indent: 0, align: 'left' })
    expect(table.cells[0].bold).toBe(true)
    expect(table.cells[2].bold).toBeUndefined()
  })

  it('칸 글 정렬: header.align > colAlign > cellAlign > left, align 은 표 위치만 바꾼다', async () => {
    const r = await agent.insertTable(1, {
      rows: 2, cols: 3, cells: [['가', '나', '다'], ['1', '2', '3']], align: 'center',
      cellAlign: 'right', colAlign: [null, 'center', 'left'], header: { bold: true, align: 'center' },
    })
    const cells = doc.state.paras[r.para].ctrls[r.ctrlIdx].cells
    expect(cells.map((c) => c.ps.align)).toEqual(['center', 'center', 'center', 'right', 'center', 'left'])
    expect(doc.state.calls).toContain('setTableProperties') // align:'center' 는 표 위치
  })

  it('정렬을 안 주면 칸 글은 왼쪽, align 만 줘도 칸 글은 안 바뀐다', async () => {
    const r = await agent.insertTable(1, { rows: 1, cols: 2, cells: [['a', 'b']], align: 'center' })
    expect(doc.state.paras[r.para].ctrls[r.ctrlIdx].cells.map((c) => c.ps.align)).toEqual(['left', 'left'])
  })

  it('cellSize(pt) 는 글이 든 칸에만 pt×100 으로, header.shade 는 머리 행 칸마다 채운다', async () => {
    const r = await agent.insertTable(1, { rows: 2, cols: 2, cells: [['가', '나'], ['1', '']], cellSize: 9.5, header: { shade: '#D9D9D9' } })
    const cells = doc.state.paras[r.para].ctrls[r.ctrlIdx].cells
    expect(cells.map((c) => c.size)).toEqual([950, 950, 950, undefined])
    expect(cells.map((c) => c.fill)).toEqual(['#D9D9D9', '#D9D9D9', undefined, undefined])
    expect(cells[0].bold).toBe(true)
  })

  it('잘못된 정렬·색·크기는 문서를 건드리기 전에 거절한다', async () => {
    const before = doc.state.mutations
    for (const spec of [{ cellAlign: 'middle' }, { colAlign: ['left'] }, { colAlign: ['left', 'x'] }, { cellSize: 0 }, { header: { shade: 'gray' } }, { header: { align: 'distribute' } }]) {
      await expect(agent.insertTable(1, { rows: 1, cols: 2, ...spec })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    }
    expect(doc.state.mutations).toBe(before)
  })

  it('기본 너비는 글 영역 − 앞 문단 좌·우 여백이고 표 자리 문단 왼쪽 여백이 anchorLeft 다', async () => {
    doc.state.paras[2].ps.ml = 4000 // 20pt
    const r = await agent.insertTable(2, { rows: 1, cols: 2 })
    const widths = doc.state.paras[r.para].ctrls[r.ctrlIdx].cells.map((c) => c.width)
    expect(r.availableMm).toBeCloseTo((59528 - 5102 * 2 - 2000) / (7200 / 25.4), 0) // 글 영역 49324 − 20pt(2000)
    expect(widths[0] + widths[1]).toBeLessThanOrEqual(59528 - 5102 * 2 - 2000)
    expect(widths[0] + widths[1]).toBeGreaterThan(59528 - 5102 * 2 - 2000 - 4)
    expect(r.anchorLeft).toBe(20)
    expect(doc.state.paras[r.para].ps.ml).toBe(4000)
    const r2 = await agent.insertTable(2, { rows: 1, cols: 2, anchorLeft: 0 })
    expect(doc.state.paras[r2.para].ps.ml).toBe(0)
    expect(r2.availableMm).toBeGreaterThan(r.availableMm)
  })

  it('colWidths 합이 사용 가능 너비를 넘으면 TOO_WIDE 로 거절하고 문서를 건드리지 않는다', async () => {
    doc.state.paras[2].ps.ml = 4000
    const before = doc.state.mutations
    const err = await agent.insertTable(2, { rows: 1, cols: 2, colWidths: [90, 90] }).catch((e) => e)
    expect(err).toMatchObject({ code: 'TOO_WIDE' })
    expect(err.widthMm).toBe(180)
    expect(doc.state.mutations).toBe(before)
  })

  it('fit:true 면 비율대로 줄여 넣는다', async () => {
    const r = await agent.insertTable(2, { rows: 1, cols: 2, colWidths: [100, 200], fit: true })
    const [a, b] = doc.state.paras[r.para].ctrls[r.ctrlIdx].cells.map((c) => c.width)
    expect(a + b).toBeLessThanOrEqual(59528 - 5102 * 2)
    expect(Math.abs(b / a - 2)).toBeLessThan(0.01)
  })

  it('열 너비는 mm 로 받아 칸마다 보낸다', async () => {
    await agent.insertTable(2, { rows: 2, cols: 2, colWidths: [30, 40] })
    expect(doc.state.calls.filter((c) => c === 'setCellProperties')).toHaveLength(4)
  })

  it('잘못된 표 정의는 문서를 건드리기 전에 거절한다', async () => {
    const before = doc.state.mutations
    await expect(agent.insertTable(2, { rows: 0, cols: 2 })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    await expect(agent.insertTable(2, { rows: 2, cols: 2, cells: [['a', 'b', 'c']] })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    await expect(agent.insertTable(2, { rows: 2, cols: 2, colWidths: [30] })).rejects.toMatchObject({ code: 'INVALID_ARG' })
    expect(doc.state.mutations).toBe(before)
  })
})

describe('listObjects / deleteObject / getTable', () => {
  it('표·글상자를 나열하고 글을 보여 준다', async () => {
    const objs = await agent.listObjects()
    expect(objs.map((o) => [o.para, o.kind])).toEqual([[3, 'table'], [4, 'textbox']])
    expect(objs[0].text).toContain('작성방법')
  })

  it('getTable 은 칸 글을 2차원으로 돌려준다', async () => {
    expect(await agent.getTable(3)).toEqual({ rows: 1, cols: 2, cells: [['작성방법', '내용']] })
    await expect(agent.getTable(2)).rejects.toMatchObject({ code: 'NOT_A_TABLE' })
  })

  it('deleteObject 는 종류에 맞는 삭제를 하고, 구역 정의는 거절한다', async () => {
    expect(await agent.deleteObject({ para: 3, ctrlIdx: 0 })).toMatchObject({ deleted: { kind: 'table' }, emptyParagraph: true })
    expect(await agent.deleteObject({ para: 4, ctrlIdx: 0 })).toMatchObject({ deleted: { kind: 'textbox' } })
    await expect(agent.deleteObject({ para: 0, ctrlIdx: 0 })).rejects.toMatchObject({ code: 'NOT_DELETABLE' })
    await expect(agent.deleteObject({ para: 2, ctrlIdx: 0 })).rejects.toMatchObject({ code: 'NO_OBJECT' })
  })
})

describe('outline 모양', () => {
  it('문단마다 글·모양·컨트롤을 돌려준다', async () => {
    const o = await agent.outline({ from: 0, to: 3 })
    expect(o).toHaveLength(4)
    expect(o[1]).toEqual({
      i: 1, text: '제목입니다', len: 5, left: 20, right: 0, indent: -10, align: 'center', lineSpacing: 160,
      before: 7, after: 0, size: 16, bold: true, font: '함초롬바탕', controls: [], styleName: '바탕글',
    })
    expect(o[0].controls).toEqual([{ kind: 'section', ctrlIdx: 0 }, { kind: 'column', ctrlIdx: 1 }])
    expect(o[3].controls).toEqual([{ kind: 'table', ctrlIdx: 0 }])
    await expect(agent.outline({ from: 3, to: 1 })).rejects.toMatchObject({ code: 'RANGE' })
  })

  it('find 는 {i, offset} 을 돌려준다', async () => {
    expect(await agent.find('첫 줄')).toEqual([{ i: 2, offset: 3 }])
  })
})

describe('check', () => {
  it('쪽 수와 자리표시를 점검한다', async () => {
    doc.state.paras[2].text = '해당 [ ] 예 [○] 아니오'
    const r = await agent.check({ maxPages: 2 })
    expect(r.pages).toBe(1)
    expect(r.ok).toBe(false)
    expect(r.placeholders.sort()).toEqual(['[ ]', '[○]'])
    expect((await agent.check({ maxPages: 0 })).reasons.join()).toContain('쪽 수')
  })
})

describe('edit / undo', () => {
  it('여러 호출이 한 트랜잭션(undo 한 단계)이다', async () => {
    const res = await agent.edit('묶음', (a) => {
      a.replaceParagraph(2, 'A')
      const p = a.insertParagraphAfter(2, 'B')
      a.setCharShape(p.i, { bold: true })
      return a.outline({ from: 2, to: 3 }).map((x) => x.text)
    })
    expect(res).toEqual(['A', 'B'])
    expect(env.txCount).toBe(1)
  })

  it('중간에 실패하면 전체를 되돌리고 원래 오류를 돌려준 뒤에도 쓸 수 있다', async () => {
    const snapshot = JSON.stringify(doc.state.paras)
    const err = await agent.edit('실패', (a) => {
      a.replaceParagraph(2, '바뀜')
      a.replaceParagraph(99, '범위 밖')
    }).catch((e) => e)
    expect(err).toMatchObject({ code: 'RANGE' }) // Studio 경계 오류가 아니라 원래 오류
    expect(JSON.stringify(doc.state.paras)).toBe(snapshot) // 롤백
    expect(await agent.replaceParagraph(2, '다시 됨')).toMatchObject({ i: 2 })
    expect(doc.state.paras[2].text).toBe('다시 됨')
  })

  it('WASM 오류(트랩 아님)도 롤백되고 편집기는 쓸 수 있다', async () => {
    doc.d.applyParaFormat = () => { throw new Error('렌더링 오류: 엔진 오류') }
    const err = await agent.setParaShape(2, { left: 1 }).catch((e) => e)
    expect(err.message).toContain('엔진 오류')
    expect(env.status).toBe('ready')
    expect(await agent.replaceParagraph(2, '계속')).toMatchObject({ i: 2 })
  })

  it('트랩으로 잠기면 EDITOR_BLOCKED 로 알리고 이후 호출은 트랜잭션 없이 바로 거절한다', async () => {
    doc.d.deleteText = () => { const e = new Error('memory access out of bounds'); e.trap = true; throw e }
    const err = await agent.replaceParagraph(2, '새 글').catch((e) => e)
    expect(err).toMatchObject({ code: 'EDITOR_BLOCKED' })
    const tx = env.txCount
    await expect(agent.replaceParagraph(1, 'x')).rejects.toMatchObject({ code: 'EDITOR_BLOCKED' })
    await expect(agent.edit('x', () => {})).rejects.toMatchObject({ code: 'EDITOR_BLOCKED' })
    expect(env.txCount).toBe(tx)
    expect(await agent.outline({ from: 1, to: 1 })).toHaveLength(1) // 읽기는 계속 된다
    expect(await agent.status()).toEqual({ status: 'blocked' })
    env.status = 'ready' // 문서를 다시 열면 풀린다
    expect(await agent.insertParagraphAfter(1, '복구')).toMatchObject({ i: 2 })
  })

  it('edit 의 함수가 async 면 거절한다', async () => {
    await expect(agent.edit('a', async () => {})).rejects.toMatchObject({ code: 'EDIT_ASYNC' })
  })

  it('undo/redo 는 surface 로 전달된다', async () => {
    await agent.undo(); await agent.redo()
    expect([env.undone, env.redone]).toEqual([1, 1])
  })
})

describe('연결', () => {
  it('플러그인이 없으면 NO_PLUGIN', async () => {
    const a = createHwpAgent(() => ({ rhwpStudio: { plugins: { loaded: new Map() } } }))
    await expect(a.outline()).rejects.toMatchObject({ code: 'NO_PLUGIN' })
  })
})

describe('문서 복구 대화상자', () => {
  const fakeWindow = (withDialog) => {
    const clicked = []
    const later = { textContent: '나중에', click: () => clicked.push('later') }
    const wrap = { querySelectorAll: () => [later], querySelector: () => null }
    const title = { textContent: '문서 복구', closest: () => wrap }
    return { clicked, win: { document: { querySelectorAll: () => (withDialog ? [title] : []) } } }
  }

  it('떠 있으면 "나중에"를 누른다', async () => {
    const f = fakeWindow(true)
    expect(await dismissRecoveryDialog(f.win, 0)).toBe(true)
    expect(f.clicked).toEqual(['later'])
  })

  it('없으면 false', async () => {
    expect(await dismissRecoveryDialog(fakeWindow(false).win, 0)).toBe(false)
  })
})

describe('대화상자 감시', () => {
  const modalWin = (base, titles) => {
    base.document = { querySelectorAll: () => titles.map((t) => ({ textContent: t, closest: () => null })) }
    return base
  }

  it('dialogs() 는 열린 모달 제목을 돌려준다', async () => {
    modalWin(win, ['저장 확인'])
    expect(await agent.dialogs()).toEqual(['저장 확인'])
  })

  it('대기 중에 모달이 뜨면 DIALOG_BLOCKED 로 제목과 함께 끝난다', async () => {
    modalWin(win, ['저장 확인'])
    const err = await agent.guard(() => new Promise(() => {}), { timeout: 5000 }).catch((e) => e)
    expect(err).toMatchObject({ code: 'DIALOG_BLOCKED', dialogs: ['저장 확인'] })
    expect(err.message).toContain('저장 확인')
  })

  it('모달 없이 시간이 지나면 TIMEOUT', async () => {
    const err = await agent.guard(() => new Promise(() => {}), { timeout: 150 }).catch((e) => e)
    expect(err).toMatchObject({ code: 'TIMEOUT' })
  })

  it('정상 작업은 그대로 결과를 돌려준다', async () => {
    expect(await agent.guard(async () => 42)).toBe(42)
  })

  it('MutationObserver 가 문서 복구 대화상자를 뜨는 즉시 닫는다', async () => {
    const clicked = []
    let cb = null
    const later = { textContent: '나중에', click: () => clicked.push('later') }
    const wrap = { querySelectorAll: () => [later], querySelector: () => null }
    let open = false
    win.document = {
      body: {},
      documentElement: {},
      querySelectorAll: () => (open ? [{ textContent: '문서 복구', closest: () => wrap }] : []),
    }
    win.MutationObserver = class { constructor(f) { cb = f } observe() {} }
    await agent.dismissDialogs() // 감시 설치
    expect(clicked).toEqual([])
    open = true
    cb() // 대화상자가 뜸
    expect(clicked).toEqual(['later'])
  })
})

describe('배포 부속물', () => {
  it('hwpAgentMethods.js 의 이름이 실제 에이전트 함수와 같다', async () => {
    const { AGENT_METHODS } = await import('./hwpAgentMethods.js')
    expect([...AGENT_METHODS].sort()).toEqual(Object.keys(createHwpAgent(() => null)).sort())
  })

  it('scripts/hwp-agent.iife.js 가 hwpAgent.js 에서 만든 최신본이다 (아니면 node scripts/build-hwp-agent-iife.mjs)', async () => {
    const { readFileSync } = await import('node:fs')
    const { buildIife, SRC, OUT } = await import('../../scripts/build-hwp-agent-iife.mjs')
    expect(readFileSync(OUT, 'utf8')).toBe(buildIife(readFileSync(SRC, 'utf8')))
  })
})
