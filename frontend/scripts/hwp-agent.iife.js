/* 자동 생성: node scripts/build-hwp-agent-iife.mjs (원본 src/services/hwpAgent.js, 직접 고치지 않는다) */
;(function () {
/**
 * HWP/HWPX 편집 에이전트 API (대화상자·클릭·키보드 없이 문서를 고친다).
 *
 * rhwp-studio 를 같은 출처 iframe 으로 임베드한 호스트 페이지가 `createHwpAgent(getStudioWindow)` 로 만든다.
 * 편집기는 hwpctrl 플러그인(`plugins: ['hwpctrl']`)을 켠 상태여야 한다. Vue 나 DOM 에 의존하지 않는 순수 모듈이다.
 *
 * 단위 규칙 (사용자 쪽은 항상 pt):
 *   - 읽기: getParaPropertiesAt 의 여백·들여쓰기·문단 간격은 px(96dpi)로 나온다. pt = px × 0.75, 소수 한 자리로 반올림.
 *   - 쓰기: 여백·들여쓰기는 pt × 200, 문단 간격은 pt × 100, 글자 크기는 pt × 100 (rhwp-studio para-shape-dialog.ts 의
 *     ptToRaw2x/ptToRaw, ai/tools/write-tools.ts prepareFormatParagraph 와 같은 값).
 *   - insertTable 의 `align` 은 표 자체의 위치(left|center|right)다. 칸 안 글 정렬은 cellAlign(전체) / colAlign[열](열별, cellAlign 보다 우선) /
 *     header.align(머리 행, 가장 우선) 로 따로 준다. 아무것도 없으면 칸 글은 왼쪽이다.
 *   - 줄 간격은 퍼센트 그대로, 표 열 너비·셀 여백은 mm 로 받아 HWPUNIT(1/7200 인치)으로 바꾼다.
 *
 * 편집 규칙:
 *   - 한 함수 호출 = 한 번의 undo 단계. 여러 호출을 한 단계로 묶으려면 edit(label, a => { ... }) 를 쓴다.
 *   - 인자 검증은 문서를 건드리기 전에 끝낸다. WASM 이 트랩(RuntimeError)을 내면 studio 의 명령 오류 경계가
 *     그 문서 세션을 'blocked' 로 잠가 이후 모든 편집이 실패하므로, 트랩을 부를 입력은 미리 막는 것이 유일한 방어다.
 *   - 문단 번호는 별도 지정이 없으면 구역 0 의 본문 문단 번호다. 모든 함수는 옵션에 { sec } 를 줄 수 있다.
 *   - 문단이 표·개체·구역 정의를 품었으면 그 문단은 지우지 않고 글만 지운다.
 */

const PX_TO_PT = 0.75
const HWP_PER_MM = 7200 / 25.4
const ALIGNS = ['left', 'center', 'right', 'justify', 'distribute']
const COLOR = /^#[0-9a-fA-F]{6}$/
const OBJECT_KINDS = ['table', 'picture', 'shape', 'textbox', 'equation']

/** 에이전트 API 가 던지는 오류. code 로 원인을 구분한다. */
class HwpAgentError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'HwpAgentError'
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}
const fail = (code, message, extra) => { throw new HwpAgentError(code, message, extra) }

const r1 = (n) => Math.round(n * 10) / 10 || 0 // -0 은 0 으로
const pxToPt = (px) => r1((Number(px) || 0) * PX_TO_PT)
const hwpToMm = (h) => r1(h / HWP_PER_MM)
const mmToHwp = (mm) => Math.round(mm * HWP_PER_MM)

const isInt = (n) => Number.isInteger(n)
const finite = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail('INVALID_ARG', `${name}: 숫자여야 합니다 (받은 값: ${v})`); return v }

/** WASM 쓰기 호출의 { ok } 응답을 확인한다. */
function ok(json, what) {
  let res = json
  if (typeof json === 'string') { try { res = JSON.parse(json) } catch { res = { ok: true } } }
  if (res && res.ok === false) fail('WASM_FAILED', `${what} 실패`)
  return res
}
const parse = (s) => (typeof s === 'string' ? JSON.parse(s) : s)

// ───────────────────────── 문서 읽기 도우미 (d = HwpDocument, 모두 동기) ─────────────────────────

function secOf(d, o) {
  const sec = o && o.sec !== undefined ? o.sec : 0
  if (!isInt(sec) || sec < 0 || sec >= d.getSectionCount()) fail('RANGE', `구역 ${sec} 가 범위를 벗어났습니다 (구역 ${d.getSectionCount()}개)`)
  return sec
}
function chkPara(d, sec, i, name = 'i') {
  const n = d.getParagraphCount(sec)
  if (!isInt(i) || i < 0 || i >= n) fail('RANGE', `${name}=${i} 가 문단 범위를 벗어났습니다 (문단 0~${n - 1})`, { count: n })
  return i
}
const paraText = (d, sec, i) => {
  const len = d.getParagraphLength(sec, i)
  return len > 0 ? d.getTextRange(sec, i, 0, len) : ''
}
const noBreak = (text, name) => {
  if (typeof text !== 'string') fail('INVALID_ARG', `${name}: 문자열이어야 합니다`)
  if (/[\r\n]/.test(text)) fail('MULTILINE', `${name}: 줄바꿈을 넣을 수 없습니다. 문단마다 insertParagraphAfter 를 쓰세요`)
  return text
}

/** getControls() 는 구역을 가로지르는 평탄 문단 번호를 쓴다. 구역 sec 의 본문(list 0) 컨트롤만 지역 번호로 바꿔 돌려준다. */
function bodyControls(d, sec) {
  let start = 0
  for (let s = 0; s < sec; s++) start += d.getParagraphCount(s)
  const end = start + d.getParagraphCount(sec)
  const out = []
  for (const c of parse(d.getControls())) {
    if (c.list !== 0 || c.para < start || c.para >= end) continue
    out.push({ para: c.para - start, ctrlIdx: c.controlIndex, ctrlId: c.ctrlId, desc: c.userDesc || '', props: c.props || {} })
  }
  return out
}

/** 컨트롤 종류. gso 는 그림이면 picture, 글상자면 textbox, 그 밖은 shape. */
function kindOf(d, sec, c) {
  switch (c.ctrlId) {
    case 'tbl': return 'table'
    case 'gso': {
      try { d.getPictureProperties(sec, c.para, c.ctrlIdx); return 'picture' } catch { /* 그림이 아님 */ }
      try { if (d.getTextBoxControlIndex(sec, c.para) === c.ctrlIdx) return 'textbox' } catch { /* 글상자 아님 */ }
      return 'shape'
    }
    case 'eqed': return 'equation'
    case 'secd': return 'section'
    case 'cold': return 'column'
    case 'head': return 'header'
    case 'foot': return 'footer'
    default: return c.ctrlId
  }
}

function cellText(d, sec, para, ctrl, cell) {
  const n = d.getCellParagraphCount(sec, para, ctrl, cell)
  const lines = []
  for (let k = 0; k < n; k++) {
    const len = d.getCellParagraphLength(sec, para, ctrl, cell, k)
    lines.push(len > 0 ? d.getTextInCell(sec, para, ctrl, cell, k, 0, len) : '')
  }
  return lines.join('\n')
}

function readTable(d, sec, para, ctrl) {
  const dim = parse(d.getTableDimensions(sec, para, ctrl))
  const cells = Array.from({ length: dim.rowCount }, () => Array(dim.colCount).fill(''))
  for (let k = 0; k < dim.cellCount; k++) {
    const info = parse(d.getCellInfo(sec, para, ctrl, k))
    if (info.row < dim.rowCount && info.col < dim.colCount) cells[info.row][info.col] = cellText(d, sec, para, ctrl, k)
  }
  return { rows: dim.rowCount, cols: dim.colCount, cells }
}

function objectText(d, sec, c, kind) {
  try {
    if (kind === 'table') return readTable(d, sec, c.para, c.ctrlIdx).cells.flat().filter(Boolean).join(' | ')
    if (kind === 'textbox' || kind === 'shape') return cellText(d, sec, c.para, c.ctrlIdx, 0)
  } catch { /* 글이 없는 개체 */ }
  return ''
}

function paraInfo(d, sec, i, ctrlsByPara) {
  const pp = parse(d.getParaPropertiesAt(sec, i))
  const len = d.getParagraphLength(sec, i)
  let cp = null
  if (len > 0) { try { cp = parse(d.getCharPropertiesAt(sec, i, 0)) } catch { /* 글자 모양 없음 */ } }
  let styleName
  try { styleName = parse(d.getStyleAt(sec, i)).name } catch { /* 스타일 없음 */ }
  const info = {
    i,
    text: len > 0 ? d.getTextRange(sec, i, 0, len) : '',
    len,
    left: pxToPt(pp.marginLeft),
    right: pxToPt(pp.marginRight),
    indent: pxToPt(pp.indent),
    align: pp.alignment,
    lineSpacing: pp.lineSpacingType === 'Percent' ? pp.lineSpacing : pxToPt(pp.lineSpacing),
    before: pxToPt(pp.spacingBefore),
    after: pxToPt(pp.spacingAfter),
    size: cp ? (cp.fontSize || 0) / 100 : null,
    bold: cp ? !!cp.bold : null,
    font: cp ? cp.fontFamily : null,
    controls: (ctrlsByPara.get(i) || []).map((c) => ({ kind: kindOf(d, sec, c), ctrlIdx: c.ctrlIdx })),
  }
  if (pp.lineSpacingType !== 'Percent') info.lineSpacingType = pp.lineSpacingType
  if (styleName !== undefined) info.styleName = styleName
  return info
}

function groupByPara(ctrls) {
  const m = new Map()
  for (const c of ctrls) { if (!m.has(c.para)) m.set(c.para, []); m.get(c.para).push(c) }
  return m
}

// ───────────────────────── 읽기 함수 ─────────────────────────

const READS = {
  outline(d, o = {}) {
    const sec = secOf(d, o)
    const n = d.getParagraphCount(sec)
    const from = o.from === undefined ? 0 : o.from
    const to = o.to === undefined ? n - 1 : o.to
    if (!isInt(from) || !isInt(to) || from < 0 || to >= n || from > to) fail('RANGE', `outline 범위 ${from}~${to} 가 올바르지 않습니다 (문단 0~${n - 1})`, { count: n })
    const byPara = groupByPara(bodyControls(d, sec))
    const out = []
    for (let i = from; i <= to; i++) out.push(paraInfo(d, sec, i, byPara))
    return out
  },

  find(d, text, o = {}) {
    if (typeof text !== 'string' || !text) fail('INVALID_ARG', 'find: 찾을 글자가 비었습니다')
    const sec = secOf(d, o)
    return parse(d.searchAllText(text, !!o.caseSensitive, false))
      .filter((h) => h.sec === sec)
      .map((h) => ({ i: h.para, offset: h.charOffset }))
  },

  getTable(d, i, ctrlIdx = 0, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, i)
    const c = bodyControls(d, sec).find((x) => x.para === i && x.ctrlIdx === ctrlIdx)
    if (!c || c.ctrlId !== 'tbl') fail('NOT_A_TABLE', `문단 ${i} 의 컨트롤 ${ctrlIdx} 는 표가 아닙니다`)
    return readTable(d, sec, i, ctrlIdx)
  },

  listObjects(d, o = {}) {
    const sec = secOf(d, o)
    const out = []
    for (const c of bodyControls(d, sec)) {
      const kind = kindOf(d, sec, c)
      if (!OBJECT_KINDS.includes(kind)) continue
      const text = objectText(d, sec, c, kind)
      const obj = { para: c.para, ctrlIdx: c.ctrlIdx, kind, desc: c.desc, text: text.length > 200 ? text.slice(0, 200) + '…' : text }
      if (c.props.Width) obj.widthMm = hwpToMm(c.props.Width)
      if (c.props.Height) obj.heightMm = hwpToMm(c.props.Height)
      out.push(obj)
    }
    return out
  },
}

// ───────────────────────── 쓰기 계획 ─────────────────────────
// 각 plan(d, ...args) 은 문서를 바꾸지 않고 인자를 검증한 뒤, 실제 쓰기를 하는 apply(d, tx) 를 돌려준다.
// apply 는 transaction 안에서만 실행된다.

/** 문단 모양 입력(pt) → applyParaFormat JSON. 단위 근거는 파일 머리 주석. */
function paraProps(s) {
  const p = {}
  if (s.left !== undefined) p.marginLeft = Math.round(finite(s.left, 'left') * 200)
  if (s.right !== undefined) p.marginRight = Math.round(finite(s.right, 'right') * 200)
  if (s.indent !== undefined) p.indent = Math.round(finite(s.indent, 'indent') * 200)
  if (s.before !== undefined) p.spacingBefore = Math.round(finite(s.before, 'before') * 100)
  if (s.after !== undefined) p.spacingAfter = Math.round(finite(s.after, 'after') * 100)
  if (s.align !== undefined) {
    if (!ALIGNS.includes(s.align)) fail('INVALID_ARG', `align: ${ALIGNS.join('|')} 중 하나여야 합니다 (받은 값: ${s.align})`)
    p.alignment = s.align
  }
  if (s.lineSpacing !== undefined) {
    const ls = finite(s.lineSpacing, 'lineSpacing')
    if (ls < 1 || ls > 9999) fail('INVALID_ARG', 'lineSpacing: 퍼센트(1~9999)여야 합니다')
    p.lineSpacing = Math.round(ls)
    p.lineSpacingType = 'Percent'
  }
  return p
}

const PLANS = {
  replaceParagraph(d, i, text, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, i)
    noBreak(text, 'text')
    const cur = paraText(d, sec, i)
    if (o.expect !== undefined && o.expect !== cur) {
      fail('EXPECT_MISMATCH', `문단 ${i} 의 현재 글이 expect 와 다릅니다`, { expected: o.expect, actual: cur })
    }
    return (dd) => {
      // 새 글을 맨 앞에 넣고 옛 글을 뒤에서 지운다: 첫 글자의 글자 모양이 새 글에 그대로 이어진다.
      if (text.length > 0) ok(dd.insertText(sec, i, 0, text), 'insertText')
      if (cur.length > 0) ok(dd.deleteText(sec, i, text.length, cur.length), 'deleteText')
      return { i, oldText: cur, len: text.length }
    }
  },

  insertParagraphAfter(d, i, text, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, i)
    const like = o.like === undefined ? i : o.like
    chkPara(d, sec, like, 'like')
    noBreak(text === undefined ? '' : text, 'text')
    const body = text === undefined ? '' : text
    // 모양 원본은 apply 시점이 아니라 지금 읽어 둔다 (like 가 i 뒤라면 apply 중 번호가 바뀐다)
    const paraShapeId = parse(d.getParaPropertiesAt(sec, like)).paraShapeId
    let charShapeId = null
    if (d.getParagraphLength(sec, like) > 0) {
      try { charShapeId = parse(d.getCharPropertiesAt(sec, like, 0)).charShapeId } catch { /* 글자 모양 없이 */ }
    }
    return (dd) => {
      const res = ok(dd.splitParagraph(sec, i, dd.getLogicalLength(sec, i)), 'splitParagraph')
      const idx = res.paraIdx !== undefined ? res.paraIdx : i + 1
      // 나누기는 이미 i 의 문단 모양을 잇는다. 다른 문단(like)을 따를 때만 모양을 덮어쓰고, 같은 문단이면 실패해도 그대로 둔다.
      const soft = like === i
      const shape = (fn, what) => { try { ok(fn(), what) } catch (e) { if (!soft) throw e } }
      shape(() => dd.setParaShapeId(sec, idx, paraShapeId), 'setParaShapeId')
      if (body) {
        ok(dd.insertText(sec, idx, 0, body), 'insertText')
        if (charShapeId !== null) shape(() => dd.setCharShapeId(sec, idx, 0, body.length, charShapeId), 'setCharShapeId')
      }
      return { i: idx }
    }
  },

  deleteParagraphs(d, from, to, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, from, 'from')
    chkPara(d, sec, to, 'to')
    if (from > to) fail('RANGE', `from(${from}) 이 to(${to}) 보다 큽니다`)
    const plan = []
    let remaining = d.getParagraphCount(sec)
    for (let i = to; i >= from; i--) {
      const held = d.getControlTextPositions(sec, i)
      const hasCtrl = parse(held).length > 0
      const wouldEmpty = remaining <= 1
      if (hasCtrl || wouldEmpty) plan.push({ i, keep: true, ctrls: hasCtrl ? bodyControls(d, sec).filter((c) => c.para === i).map((c) => kindOf(d, sec, c)) : [] })
      else { plan.push({ i, keep: false }); remaining-- }
    }
    return (dd) => {
      const kept = []
      let deleted = 0
      for (const p of plan) { // 뒤에서 앞으로 지우므로 앞 번호가 밀리지 않는다
        if (p.keep) {
          const len = dd.getParagraphLength(sec, p.i)
          if (len > 0) ok(dd.deleteText(sec, p.i, 0, len), 'deleteText')
          kept.push({ i: p.i, controls: p.ctrls, textCleared: len > 0 })
        } else {
          ok(dd.deleteParagraph(sec, p.i), 'deleteParagraph')
          deleted++
        }
      }
      return { deleted, kept: kept.reverse() }
    }
  },

  setParaShape(d, target, shape, o = {}) {
    const sec = secOf(d, o)
    const [from, to] = Array.isArray(target) ? target : [target, target]
    chkPara(d, sec, from, 'from')
    chkPara(d, sec, to, 'to')
    if (from > to) fail('RANGE', `from(${from}) 이 to(${to}) 보다 큽니다`)
    const props = paraProps(shape || {})
    if (Object.keys(props).length === 0) fail('INVALID_ARG', 'setParaShape: left/right/indent/align/lineSpacing/before/after 중 하나 이상이 필요합니다')
    // 빈 문서(createEmpty)에서는 일부 항목만 보내면 줄 간격이 0 으로 되돌아가는 것이 실측되어(160 → 0), 지정하지 않은 줄 간격은 현재 값을 같이 보낸다. 실문서에서는 보존됨.
    const keepLs = new Map()
    if (props.lineSpacing === undefined) {
      for (let i = from; i <= to; i++) {
        const cur = parse(d.getParaPropertiesAt(sec, i))
        if (cur.lineSpacingType === 'Percent') keepLs.set(i, cur.lineSpacing)
      }
    }
    return (dd, tx) => {
      if (tx && to > from) tx.deferPagination()
      for (let i = from; i <= to; i++) {
        const p = keepLs.has(i) ? { ...props, lineSpacing: Math.round(keepLs.get(i)), lineSpacingType: 'Percent' } : props
        ok(dd.applyParaFormat(sec, i, JSON.stringify(p)), 'applyParaFormat')
      }
      return { from, to, count: to - from + 1 }
    }
  },

  setCharShape(d, i, spec, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, i)
    const s = spec || {}
    const len = d.getParagraphLength(sec, i)
    if (len === 0) fail('EMPTY_PARAGRAPH', `문단 ${i} 에는 글이 없어 글자 모양을 바꿀 수 없습니다`)
    const from = s.from === undefined ? 0 : s.from
    const to = s.to === undefined ? len : s.to
    if (!isInt(from) || !isInt(to) || from < 0 || to > len || from >= to) fail('RANGE', `글자 범위 ${from}~${to} 가 올바르지 않습니다 (문단 길이 ${len})`, { len })
    const props = {}
    if (s.size !== undefined) {
      const pt = finite(s.size, 'size')
      if (pt < 1 || pt > 409) fail('INVALID_ARG', 'size: 1~409 pt 여야 합니다')
      props.fontSize = Math.round(pt * 100)
    }
    for (const k of ['bold', 'italic', 'underline']) {
      if (s[k] !== undefined) { if (typeof s[k] !== 'boolean') fail('INVALID_ARG', `${k}: true/false 여야 합니다`); props[k] = s[k] }
    }
    if (s.color !== undefined) {
      if (!COLOR.test(s.color)) fail('INVALID_ARG', 'color: #RRGGBB 형식이어야 합니다')
      props.textColor = s.color
    }
    if (s.font !== undefined && (typeof s.font !== 'string' || !s.font.trim())) fail('INVALID_ARG', 'font: 글꼴 이름이어야 합니다')
    if (Object.keys(props).length === 0 && s.font === undefined) fail('INVALID_ARG', 'setCharShape: size/bold/italic/underline/color/font 중 하나 이상이 필요합니다')
    return (dd) => {
      if (s.font !== undefined) {
        const id = dd.findOrCreateFontId(s.font.trim())
        if (!(id >= 0)) fail('FONT_FAILED', `글꼴 "${s.font}" 을 쓸 수 없습니다`)
        props.fontId = id
      }
      ok(dd.applyCharFormat(sec, i, from, to, JSON.stringify(props)), 'applyCharFormat')
      return { i, from, to }
    }
  },

  insertTable(d, afterPara, spec, o = {}) {
    const sec = secOf(d, o)
    chkPara(d, sec, afterPara, 'afterPara')
    const t = spec || {}
    if (!isInt(t.rows) || !isInt(t.cols) || t.rows < 1 || t.cols < 1 || t.rows > 200 || t.cols > 30) fail('INVALID_ARG', 'rows(1~200), cols(1~30) 는 정수여야 합니다')
    const rows = t.rows
    const cols = t.cols
    const cells = t.cells || []
    if (!Array.isArray(cells) || cells.length > rows) fail('INVALID_ARG', `cells 는 행 배열이어야 하고 ${rows}행을 넘을 수 없습니다`)
    cells.forEach((row, r) => {
      if (!Array.isArray(row) || row.length > cols) fail('INVALID_ARG', `cells[${r}] 는 ${cols}칸 이하의 배열이어야 합니다`)
      row.forEach((v) => noBreak(String(v ?? ''), `cells[${r}]`))
    })
    let widths = null
    if (t.colWidths !== undefined) {
      if (!Array.isArray(t.colWidths) || t.colWidths.length !== cols) fail('INVALID_ARG', `colWidths 는 mm 값 ${cols}개여야 합니다`)
      widths = t.colWidths.map((w, k) => { if (!(finite(w, `colWidths[${k}]`) > 0)) fail('INVALID_ARG', `colWidths[${k}] 는 0 보다 커야 합니다`); return mmToHwp(w) })
    }
    if (t.align !== undefined && !['left', 'center', 'right'].includes(t.align)) fail('INVALID_ARG', 'align: left|center|right (표의 위치)')
    const header = t.header ? (t.header === true ? { bold: true } : t.header) : null
    const CELL_ALIGNS = ['left', 'center', 'right', 'justify']
    const chkAlign = (v, name) => { if (v !== undefined && !CELL_ALIGNS.includes(v)) fail('INVALID_ARG', `${name}: ${CELL_ALIGNS.join('|')}`) }
    chkAlign(t.cellAlign, 'cellAlign')
    chkAlign(header && header.align, 'header.align')
    if (t.colAlign !== undefined) {
      if (!Array.isArray(t.colAlign) || t.colAlign.length !== cols) fail('INVALID_ARG', `colAlign 은 ${cols}개 배열이어야 합니다 (칸을 건드리지 않을 열은 null)`)
      t.colAlign.forEach((a, k) => { if (a !== null) chkAlign(a, `colAlign[${k}]`) })
    }
    let cellSize = null
    if (t.cellSize !== undefined) {
      cellSize = finite(t.cellSize, 'cellSize')
      if (cellSize < 1 || cellSize > 409) fail('INVALID_ARG', 'cellSize: 1~409 pt')
      cellSize = Math.round(cellSize * 100)
    }
    if (header && header.shade !== undefined && !COLOR.test(header.shade)) fail('INVALID_ARG', 'header.shade: #RRGGBB 형식이어야 합니다')
    // 칸 글 정렬: 머리 행은 header.align, 그 밖은 colAlign[열] > cellAlign > left
    const alignOf = (r, c) => (r === 0 && header && header.align) || (t.colAlign && t.colAlign[c]) || t.cellAlign || 'left'
    const pad = t.cellPadding === undefined ? null : mmToHwp(finite(t.cellPadding, 'cellPadding'))
    if (pad !== null && pad < 0) fail('INVALID_ARG', 'cellPadding 은 0 이상이어야 합니다')
    const lineSpacing = t.lineSpacing === undefined ? 130 : finite(t.lineSpacing, 'lineSpacing')

    return (dd, tx) => {
      if (tx) tx.deferPagination()
      // 1) 표를 놓을 빈 문단. 글이 든 문단에는 표를 넣으면 글이 표 뒤로 밀리므로 항상 새 빈 문단에 만든다.
      const split = ok(dd.splitParagraph(sec, afterPara, dd.getLogicalLength(sec, afterPara)), 'splitParagraph')
      const spot = split.paraIdx !== undefined ? split.paraIdx : afterPara + 1
      const sp = parse(dd.getParaPropertiesAt(sec, spot))
      // 개요·번호 모양을 물려받았으면 표 칸과 뒤 문단에 번호가 붙는다. 그때만 바탕글로 되돌린다.
      if (sp.headType && sp.headType !== 'None') ok(dd.applyStyle(sec, spot, 0), 'applyStyle')
      const created = ok(dd.createTable(sec, spot, 0, rows, cols), 'createTable')
      const para = created.paraIdx !== undefined ? created.paraIdx : spot
      const ctrl = created.controlIdx !== undefined ? created.controlIdx : 0
      // 2) 열 너비 (행 우선 번호의 모든 칸)
      if (widths) for (let k = 0; k < rows * cols; k++) ok(dd.setCellProperties(sec, para, ctrl, k, JSON.stringify({ width: widths[k % cols] })), 'setCellProperties')
      // 3) 표 속성: 정렬·여백
      const tprops = {}
      if (t.align) tprops.horzAlign = t.align[0].toUpperCase() + t.align.slice(1)
      if (pad !== null) Object.assign(tprops, { paddingLeft: pad, paddingRight: pad, paddingTop: pad, paddingBottom: pad })
      if (Object.keys(tprops).length) ok(dd.setTableProperties(sec, para, ctrl, JSON.stringify(tprops)), 'setTableProperties')
      // 4) 칸 문단 모양: 표를 만든 문단의 모양(여백·내어쓰기·정렬·줄 간격)이 칸으로 새므로 초기화한다 (실측 결함)
      for (let k = 0; k < rows * cols; k++) {
        const reset = JSON.stringify({ marginLeft: 0, marginRight: 0, indent: 0, spacingBefore: 0, spacingAfter: 0, alignment: alignOf(Math.floor(k / cols), k % cols), lineSpacing: Math.round(lineSpacing), lineSpacingType: 'Percent' })
        ok(dd.applyParaFormatInCell(sec, para, ctrl, k, 0, reset), 'applyParaFormatInCell')
      }
      // 5) 글
      cells.forEach((row, r) => row.forEach((v, c) => {
        const s = String(v ?? '')
        if (s) ok(dd.insertTextInCell(sec, para, ctrl, r * cols + c, 0, 0, s), 'insertTextInCell')
      }))
      // 6) 칸 글자 크기, 머리 행 굵게·배경
      cells.forEach((row, r) => row.forEach((v, c) => {
        const len = String(v ?? '').length
        if (!len) return
        const cp = {}
        if (cellSize !== null) cp.fontSize = cellSize
        if (r === 0 && header && header.bold !== false) cp.bold = true
        if (Object.keys(cp).length) ok(dd.applyCharFormatInCell(sec, para, ctrl, r * cols + c, 0, 0, len, JSON.stringify(cp)), 'applyCharFormatInCell')
      }))
      if (header && header.shade) {
        for (let c = 0; c < cols; c++) ok(dd.setCellProperties(sec, para, ctrl, c, JSON.stringify({ fillType: 'solid', fillColor: header.shade })), 'setCellProperties')
      }
      const tp = parse(dd.getTableProperties(sec, para, ctrl))
      return { para, ctrlIdx: ctrl, rows, cols, widthMm: hwpToMm(tp.tableWidth || 0) }
    }
  },

  deleteObject(d, ref, o = {}) {
    const sec = secOf(d, o)
    if (!ref || typeof ref !== 'object') fail('INVALID_ARG', 'deleteObject: { para, ctrlIdx } 가 필요합니다')
    const { para, ctrlIdx } = ref
    chkPara(d, sec, para, 'para')
    const c = bodyControls(d, sec).find((x) => x.para === para && x.ctrlIdx === ctrlIdx)
    if (!c) fail('NO_OBJECT', `문단 ${para} 에 컨트롤 ${ctrlIdx} 가 없습니다`)
    const kind = kindOf(d, sec, c)
    if (!OBJECT_KINDS.includes(kind)) fail('NOT_DELETABLE', `${kind} 컨트롤은 deleteObject 로 지울 수 없습니다`, { kind })
    return (dd) => {
      if (kind === 'table') ok(dd.deleteTableControl(sec, para, ctrlIdx), 'deleteTableControl')
      else if (kind === 'picture') ok(dd.deletePictureControl(sec, para, ctrlIdx), 'deletePictureControl')
      else if (kind === 'equation') ok(dd.deleteEquationControl(sec, para, ctrlIdx), 'deleteEquationControl')
      else ok(dd.deleteShapeControl(sec, para, ctrlIdx), 'deleteShapeControl')
      let emptyParagraph = false
      try { emptyParagraph = dd.getParagraphLength(sec, para) === 0 && parse(dd.getControlTextPositions(sec, para)).length === 0 } catch { /* 모름 */ }
      return { deleted: { para, ctrlIdx, kind }, emptyParagraph }
    }
  },
}

/** 줄 정리 표 점검에 쓰는 자리표시 문구 ("[ ]", "[○]" 등). */
const PLACEHOLDER = /\[[\s○●◎□■✓✔☑☐]*\]/g

function checkDoc(d, o = {}) {
  const sec = secOf(d, o)
  const pages = d.pageCount()
  let all = ''
  try { all = parse(d.getTextFileUnicode()) } catch { all = '' }
  const chunks = [String(all)]
  for (const c of bodyControls(d, sec)) {
    if (c.ctrlId !== 'tbl') continue
    try { chunks.push(readTable(d, sec, c.para, c.ctrlIdx).cells.flat().join('\n')) } catch { /* 읽을 수 없는 표 */ }
  }
  const placeholders = [...new Set(chunks.join('\n').match(PLACEHOLDER) || [])]
  const reasons = []
  if (o.maxPages !== undefined && pages > o.maxPages) reasons.push(`쪽 수 ${pages} > ${o.maxPages}`)
  if (placeholders.length) reasons.push(`자리표시 ${placeholders.length}종 남음`)
  return { pages, ok: reasons.length === 0, reasons, placeholders, textPreview: String(all).replace(/(\r?\n)+/g, '\n').trim().slice(0, 600) }
}

// ───────────────────────── 편집기 연결 ─────────────────────────

/** iframe 안에 열려 있는 모달 대화상자 제목들 (rhwp-studio ui/dialog.ts 의 .modal-overlay / .dialog-title) */
function modalTitles(win) {
  try {
    return Array.from(win.document.querySelectorAll('.modal-overlay .dialog-title')).map((t) => (t.textContent || '').trim())
  } catch { return [] }
}

const watched = new WeakSet()
/**
 * "문서 복구" 대화상자는 부팅 때 저장되지 않은 복구본이 있으면 studio 가 띄운다 (rhwp-studio main.ts:930
 * offerAutosaveRecoveryIfIdle, embed 프로파일이 아닐 때). 늦게 뜨거나 다시 떠도 놓치지 않도록 폴링 대신
 * MutationObserver 로 지켜보다가 뜨는 즉시 "나중에"를 누른다. 창마다 한 번만 건다.
 */
function watchDialogs(win) {
  if (!win || watched.has(win)) return
  try {
    const Obs = win.MutationObserver
    const root = win.document && (win.document.body || win.document.documentElement)
    if (!Obs || !root) return
    watched.add(win)
    new Obs(() => { dismissRecoveryDialog(win, 0) }).observe(root, { childList: true, subtree: true })
    dismissRecoveryDialog(win, 0)
  } catch { /* 같은 출처가 아니면 감시 없이 */ }
}

/**
 * 작업이 끝나기를 기다리되, 그동안 모달 대화상자가 뜨면 DIALOG_BLOCKED(제목 포함), timeout(기본 10초)을 넘기면
 * 대화상자가 있으면 DIALOG_BLOCKED, 없으면 TIMEOUT 으로 끝낸다. 작업 자체는 취소되지 않는다.
 */
function watchdog(getStudioWindow, factory, { timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false
    let timer = null
    const t0 = Date.now()
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v) }
    const tick = async () => {
      if (done) return
      let titles = []
      try { const win = await getStudioWindow(); titles = win ? modalTitles(win) : [] } catch { /* 창 없음 */ }
      if (done) return
      if (titles.length) return finish(reject, new HwpAgentError('DIALOG_BLOCKED', `대화상자가 떠서 멈췄습니다: ${titles.join(', ')}`, { dialogs: titles }))
      if (Date.now() - t0 > timeout) return finish(reject, new HwpAgentError('TIMEOUT', `${timeout}ms 안에 끝나지 않았습니다`))
      timer = setTimeout(tick, 100)
    }
    timer = setTimeout(tick, 100)
    Promise.resolve().then(factory).then((v) => finish(resolve, v), (e) => finish(reject, e))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isStudioError = (e) => e && (e.name === 'StudioCommandError' || (e.report && typeof e.report.then === 'function'))

/**
 * @param {() => (Window | Promise<Window>)} getStudioWindow  rhwp-studio iframe 의 contentWindow
 */
function createHwpAgent(getStudioWindow) {
  async function ctx() {
    const win = await getStudioWindow()
    if (!win) fail('NO_EDITOR', '편집기가 아직 없습니다')
    watchDialogs(win)
    const entry = win.rhwpStudio && win.rhwpStudio.plugins && win.rhwpStudio.plugins.loaded && win.rhwpStudio.plugins.loaded.get('hwpctrl')
    if (!entry || !entry.facade) fail('NO_PLUGIN', "편집기에 hwpctrl 플러그인이 없습니다 (createStudio 의 plugins: ['hwpctrl'])")
    return { win, facade: entry.facade, surface: entry.surface }
  }

  const errState = (c) => { try { return c.win.rhwpCommandErrors && c.win.rhwpCommandErrors.getState() } catch { return null } }

  /** 편집 명령 오류 경계가 'ready' 인지 확인한다. 복구 중이면 잠깐 기다리고, 잠겼으면 바로 알린다. */
  async function guardReady(c) {
    for (let k = 0; k < 60; k++) {
      const st = errState(c)
      if (!st || st.status === 'ready') return
      if (st.status === 'blocked') fail('EDITOR_BLOCKED', '이전 편집 오류로 편집기가 잠겼습니다. 문서를 다시 열어야 합니다 (cbHwp.open)')
      await sleep(50)
    }
  }

  /** 실패한 트랜잭션 뒤처리: 보고를 기다려 경계를 'ready' 로 돌리고, 원래 오류(없으면 경계 오류)를 돌려준다. */
  async function afterFailure(c, e, captured) {
    if (isStudioError(e)) {
      try { await Promise.race([e.report, sleep(3000)]) } catch { /* 보고 실패는 무시 */ }
      const st = errState(c)
      if (st && st.status === 'blocked') {
        return new HwpAgentError('EDITOR_BLOCKED', '편집 오류로 편집기가 잠겼습니다. 문서를 다시 열어야 합니다 (cbHwp.open). 원인: ' + String((captured && captured.message) || (e.cause && e.cause.message) || e.message), { cause: captured || e.cause || e })
      }
    }
    const orig = captured || e
    if (orig instanceof Error) return orig
    return new HwpAgentError('WASM_ERROR', String(orig))
  }

  /** apply 를 한 트랜잭션(= undo 한 단계)으로 실행한다. */
  async function runTx(c, label, apply, { defer = false } = {}) {
    let captured = null
    let result
    try {
      c.facade.transaction(label, (tx) => {
        if (defer) tx.deferPagination()
        try { result = apply(tx.doc(), tx) } catch (err) { captured = err; throw err }
      })
    } catch (e) {
      throw await afterFailure(c, e, captured)
    }
    return result
  }

  const read = async (fn) => { const c = await ctx(); return c.facade.read(fn) }

  /** 검증은 read 로(문서·오류 경계를 건드리지 않음), 쓰기만 트랜잭션으로. */
  async function mutate(label, plan, opts) {
    const c = await ctx()
    await guardReady(c)
    const apply = c.facade.read(plan)
    return runTx(c, label, apply, opts)
  }

  const agent = {
    outline: (o) => read((d) => READS.outline(d, o)),
    find: (text, o) => read((d) => READS.find(d, text, o)),
    getTable: (i, ctrlIdx, o) => read((d) => READS.getTable(d, i, ctrlIdx, o)),
    listObjects: (o) => read((d) => READS.listObjects(d, o)),
    check: (o) => read((d) => checkDoc(d, o)),

    replaceParagraph: (i, text, o) => mutate('에이전트: 문단 바꾸기', (d) => PLANS.replaceParagraph(d, i, text, o)),
    insertParagraphAfter: (i, text, o) => mutate('에이전트: 문단 넣기', (d) => PLANS.insertParagraphAfter(d, i, text, o)),
    deleteParagraphs: (from, to, o) => mutate('에이전트: 문단 지우기', (d) => PLANS.deleteParagraphs(d, from, to, o), { defer: true }),
    setParaShape: (target, shape, o) => mutate('에이전트: 문단 모양', (d) => PLANS.setParaShape(d, target, shape, o)),
    setCharShape: (i, spec, o) => mutate('에이전트: 글자 모양', (d) => PLANS.setCharShape(d, i, spec, o)),
    insertTable: (afterPara, spec, o) => mutate('에이전트: 표 만들기', (d) => PLANS.insertTable(d, afterPara, spec, o), { defer: true }),
    deleteObject: (ref, o) => mutate('에이전트: 개체 지우기', (d) => PLANS.deleteObject(d, ref, o)),

    /**
     * 여러 편집을 undo 한 단계로 묶는다. fn 은 동기 함수이며 인자 a 는 같은 이름의 동기 함수를 가진다
     * (await 하지 않는다). fn 안에서 던지면 이 묶음 전체가 롤백된다.
     *   await agent.edit('개요 정리', a => { a.replaceParagraph(3, '...'); a.insertTable(...) })
     */
    async edit(label, fn, o = {}) {
      if (typeof fn !== 'function') fail('INVALID_ARG', 'edit: 함수가 필요합니다')
      const c = await ctx()
      await guardReady(c)
      return runTx(c, label || '에이전트: 편집', (d, tx) => {
        const bind = (plan) => (...args) => plan(d, ...args)(d, tx)
        const a = {
          outline: (x) => READS.outline(d, x),
          find: (t, x) => READS.find(d, t, x),
          getTable: (i, k, x) => READS.getTable(d, i, k, x),
          listObjects: (x) => READS.listObjects(d, x),
        }
        for (const name of Object.keys(PLANS)) a[name] = bind(PLANS[name])
        const r = fn(a)
        if (r && typeof r.then === 'function') fail('EDIT_ASYNC', 'edit 의 함수는 동기여야 합니다 (await 를 쓰지 마세요)')
        return r
      }, { defer: o.defer !== false })
    },

    async undo() {
      const c = await ctx()
      await guardReady(c)
      c.surface.undo()
      return true
    },
    async redo() {
      const c = await ctx()
      await guardReady(c)
      c.surface.redo()
      return true
    },

    /** 편집 명령 오류 경계의 상태: { status: 'ready' | 'recovering' | 'blocked' } (알 수 없으면 null) */
    async status() { const c = await ctx(); return errState(c) },

    /** 자동저장 복구 대화상자("문서 복구")를 "나중에"로 닫는 감시를 켜고, 지금 떠 있으면 바로 닫는다. 닫았으면 true. */
    async dismissDialogs(o = {}) {
      const win = await getStudioWindow()
      if (win) watchDialogs(win)
      return dismissRecoveryDialog(win, o.timeout === undefined ? 0 : o.timeout)
    },
    /** 지금 iframe 안에 열려 있는 모달 대화상자의 제목들 */
    async dialogs() {
      const win = await getStudioWindow()
      return win ? modalTitles(win) : []
    },
    /** 외부 작업(예: 문서 열기)에 같은 감시를 씌운다: 대화상자가 뜨면 DIALOG_BLOCKED, 시간이 지나면 TIMEOUT */
    guard: (factory, o) => watchdog(getStudioWindow, factory, o),
  }
  agent.dismissRecovery = agent.dismissDialogs
  // 모든 공개 함수에 감시를 씌운다: 대화상자가 떠서 멈추면 영원히 기다리지 않고 DIALOG_BLOCKED 로 끝낸다.
  for (const name of Object.keys(agent)) {
    if (['dismissDialogs', 'dismissRecovery', 'dialogs', 'guard'].includes(name)) continue
    const fn = agent[name]
    agent[name] = (...args) => watchdog(getStudioWindow, () => fn(...args))
  }
  return agent
}

/**
 * 부팅 때 저장되지 않은 복구본이 있으면 studio 가 모달 "문서 복구"를 띄운다 (rhwp-studio main.ts offerAutosaveRecoveryIfIdle,
 * embed 프로파일이 아닐 때). 프로그램이 닫을 API 는 없어 같은 출처 DOM 에서 "나중에"(원본 문서는 건드리지 않음)를 누른다.
 */
async function dismissRecoveryDialog(win, timeout = 1500) {
  const deadline = Date.now() + timeout
  do {
    try {
      const doc = win && win.document
      const titles = doc ? Array.from(doc.querySelectorAll('.dialog-title')) : []
      const title = titles.find((t) => (t.textContent || '').includes('문서 복구'))
      if (title) {
        const wrap = title.closest('.dialog-wrap') || title.parentElement
        const later = Array.from(wrap.querySelectorAll('.dialog-footer .dialog-btn')).find((b) => (b.textContent || '').trim() === '나중에')
        if (later) { later.click(); return true }
        const close = wrap.querySelector('.dialog-close')
        if (close) { close.click(); return true }
      }
    } catch { /* 같은 출처가 아니면 건너뛴다 */ }
    if (timeout > 0) await sleep(100)
  } while (Date.now() < deadline)
  return false
}

window.__hwpAgentFactory = createHwpAgent
window.__hwpAgentDismissRecovery = dismissRecoveryDialog
})()
