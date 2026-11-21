/**
 * 실제 편집기로 에이전트 API 를 시험하는 콘솔용 스니펫 (번들에 들어가지 않는다).
 *
 * 사용 (/tools/hwp/ 페이지 콘솔, window.cbHwp 가 있어야 한다):
 *   1) 배포 전이면 scripts/hwp-agent.iife.js 내용을 먼저 붙여 넣는다 (window.__hwpAgentFactory 가 생긴다).
 *   2) const bytes = new Uint8Array(...)   // 시험할 .hwpx 바이트
 *   3) 이 파일 전체를 붙여 넣는다. 마지막 식이 Promise 를 돌려주니 await 하거나 .then(console.log) 한다.
 *      const report = await (이 스니펫)   → JSON 으로 직렬화되는 보고서
 *
 * 각 단계는 { step, ok, ms, ...결과 또는 error:{code,message} } 로 기록되고, 한 단계가 실패해도 다음으로 간다.
 * 마지막 compare 단계는 내보낸 HWPX 를 다시 열어 글과 쪽 수가 편집 직후와 같은지 본다.
 */
(async () => {
  if (typeof bytes === 'undefined') throw new Error('먼저 const bytes = new Uint8Array(...) 로 .hwpx 바이트를 정하세요')
  const H = window.cbHwp
  if (!H) throw new Error('window.cbHwp 가 없습니다 (/tools/hwp/ 페이지에서 실행)')
  let A = H
  if (typeof H.outline !== 'function') {
    if (typeof window.__hwpAgentFactory !== 'function') throw new Error('cbHwp 에 에이전트 함수가 없습니다. scripts/hwp-agent.iife.js 를 먼저 붙여 넣으세요')
    A = window.__hwpAgentFactory(() => document.querySelector('iframe').contentWindow)
  }

  const report = { steps: [], summary: {} }
  const norm = (t) => String(t).replace(/\r\n/g, '\n').replace(/\s+$/g, '')
  const run = async (step, fn) => {
    const t0 = performance.now()
    const rec = { step }
    try { Object.assign(rec, { ok: true }, { result: await fn() }) } catch (e) { Object.assign(rec, { ok: false, error: { code: e && e.code, message: String((e && e.message) || e) } }) }
    rec.ms = Math.round(performance.now() - t0)
    report.steps.push(rec)
    return rec
  }
  const text = async () => norm(await H.call('GetTextFile', ['UNICODE', '']))

  // 1) 열기
  const opened = await run('open', async () => await H.open(bytes.slice(0), 'e2e.hwpx'))
  if (!opened.ok) return report
  report.summary.pagesBefore = await H.pageCount()

  // 2) 개요
  const ol = await run('outline', async () => {
    const o = await A.outline()
    return { count: o.length, sample: o.filter((p) => p.text).slice(0, 5).map((p) => ({ i: p.i, text: p.text.slice(0, 30), left: p.left, size: p.size, bold: p.bold, align: p.align })) }
  })
  const paras = await A.outline().catch(() => [])
  const title = paras.find((p) => p.text.trim() && p.controls.length === 0)
  if (!title) { report.summary.error = '글이 든 문단을 찾지 못했습니다'; return report }

  // 3) 제목 바꾸기 (expect 맞는 경우와 틀린 경우)
  await run('replaceParagraph.expectMismatch', async () => {
    try { await A.replaceParagraph(title.i, 'x', { expect: title.text + '#' }); return { thrown: false } } catch (e) { return { thrown: true, code: e.code } }
  })
  await run('replaceParagraph', () => A.replaceParagraph(title.i, '에이전트 시험 제목', { expect: title.text }))

  // 4) 문단 셋 넣기
  let at = title.i
  for (let k = 1; k <= 3; k++) {
    const r = await run('insertParagraphAfter#' + k, () => A.insertParagraphAfter(at, `에이전트가 넣은 문단 ${k}`, { like: title.i }))
    if (r.ok) at = r.result.i
  }

  // 5) 모양: 단위 왕복(pt)이 맞는지 outline 으로 되읽는다
  const shape = { left: 20, right: 3, indent: -10, before: 4, after: 2, lineSpacing: 150, align: 'center' }
  await run('setParaShape.roundtrip', async () => {
    await A.setParaShape([title.i + 1, title.i + 2], shape)
    const back = (await A.outline({ from: title.i + 1, to: title.i + 1 }))[0]
    const got = { left: back.left, right: back.right, indent: back.indent, before: back.before, after: back.after, lineSpacing: back.lineSpacing, align: back.align }
    return { expected: shape, got, equal: JSON.stringify(got) === JSON.stringify(shape) }
  })
  await run('setCharShape', async () => {
    await A.setCharShape(title.i + 1, { size: 14, bold: true, color: '#1F4E79' })
    const back = (await A.outline({ from: title.i + 1, to: title.i + 1 }))[0]
    return { size: back.size, bold: back.bold }
  })

  // 6) 표 4x4
  const cells = [['구분', '항목', '내용', '비고'], ['1', 'A', '가', ''], ['2', 'B', '나', ''], ['3', 'C', '다', '']]
  const tbl = await run('insertTable', () => A.insertTable(at, { rows: 4, cols: 4, colWidths: [20, 30, 70, 30], cells, header: { bold: true, align: 'center' }, align: 'center' }))
  if (tbl.ok) {
    await run('getTable', async () => {
      const t = await A.getTable(tbl.result.para, tbl.result.ctrlIdx)
      return { rows: t.rows, cols: t.cols, same: JSON.stringify(t.cells) === JSON.stringify(cells) }
    })
    // 칸 문단 여백이 본문 문단 모양을 물려받지 않았는지: 본문이 left 20pt 인 문단 뒤에 만든 표라도 칸 글은 0 이어야 한다
    report.summary.tableCellsMatch = report.steps[report.steps.length - 1].ok && report.steps[report.steps.length - 1].result.same
  }

  // 7) 개체 나열과 삭제 (작성방법 상자)
  const objs = await run('listObjects', async () => (await A.listObjects()).map((o) => ({ para: o.para, ctrlIdx: o.ctrlIdx, kind: o.kind, text: (o.text || '').slice(0, 40) })))
  const guide = objs.ok && objs.result.find((o) => o.text.includes('작성방법'))
  if (guide) await run('deleteObject(작성방법)', () => A.deleteObject({ para: guide.para, ctrlIdx: guide.ctrlIdx }))
  else report.steps.push({ step: 'deleteObject(작성방법)', ok: true, skipped: '작성방법 개체 없음' })

  // 8) edit 묶음 + undo 한 번으로 모두 되돌려지는지
  await run('edit+undo', async () => {
    const before = (await A.outline()).length
    await A.edit('묶음 시험', (a) => { const p = a.insertParagraphAfter(title.i, '묶음 1'); a.insertParagraphAfter(p.i, '묶음 2') })
    const mid = (await A.outline()).length
    await A.undo()
    const after = (await A.outline()).length
    return { before, mid, after, oneStep: mid === before + 2 && after === before }
  })

  // 9) 점검
  await run('check', () => A.check({ maxPages: 2 }))
  await run('status', () => A.status())

  // 10) 내보내기 → 다시 열기 → 비교
  const t1 = await text()
  const pages1 = await H.pageCount()
  const exp = await run('exportHwpx', async () => { const b = await H.exportHwpx(); report.summary.exportBytes = b.length; report._bytes = b; return { bytes: b.length } })
  if (exp.ok) {
    await run('reopen+compare', async () => {
      await H.open(report._bytes, 'e2e-reopen.hwpx')
      const t2 = await text()
      const pages2 = await H.pageCount()
      return { pages1, pages2, samePages: pages1 === pages2, sameText: t1 === t2, lenBefore: t1.length, lenAfter: t2.length }
    })
  }
  delete report._bytes
  report.summary.failedSteps = report.steps.filter((s) => !s.ok).map((s) => s.step)
  report.summary.titleParagraph = title.i
  report.summary.pagesAfter = pages1
  return JSON.parse(JSON.stringify(report))
})()
