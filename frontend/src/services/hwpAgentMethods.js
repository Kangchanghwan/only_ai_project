/**
 * 에이전트 공개 함수 이름. 실제 함수는 편집기 쪽(hwp-editor agent/hwpAgent.js)에 있고, 편집기 창구는 같은 목록
 * (hwp-editor agent/hwpAgentMethods.js)의 함수만 받는다. 두 목록은 같아야 한다 (hwpAgentClient.test.js 가 이름 목록을 고정해 둔다).
 */
export const AGENT_METHODS = [
  'outline', 'find', 'getTable', 'listObjects', 'check',
  'replaceParagraph', 'insertParagraphAfter', 'deleteParagraphs', 'setParaShape', 'setCharShape',
  'insertTable', 'deleteObject', 'edit', 'undo', 'redo', 'status', 'dismissRecovery', 'dismissDialogs', 'dialogs', 'guard',
]
