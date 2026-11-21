/**
 * hwpAgent 의 공개 함수 이름. hwpAgent.js(수 KB)를 미리 불러오지 않고도 호스트가 window.cbHwp 에
 * 같은 이름의 지연 로딩 함수를 걸 수 있게 따로 둔다. hwpAgent.test.js 가 실제 객체와 같은지 확인한다.
 */
export const AGENT_METHODS = [
  'outline', 'find', 'getTable', 'listObjects', 'check',
  'replaceParagraph', 'insertParagraphAfter', 'deleteParagraphs', 'setParaShape', 'setCharShape',
  'insertTable', 'deleteObject', 'edit', 'undo', 'redo', 'status', 'dismissRecovery',
]
