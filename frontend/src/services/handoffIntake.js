/**
 * "폰으로 보내기"로 도착한 파일 받기 (주소에 ?handoff=<id> 가 있을 때만 App.vue 가 이 모듈을 불러온다).
 * 전달함(handoffStore)에서 읽고 → 방 만들기(이미 그룹 방 화면이면 그 방 사용) → 기존 업로드 경로로 올리고
 * → 전달함 항목 삭제 → 주소 정리 → 초대(QR) 시트 열기. 실패하면 한 줄 안내만 띄운다.
 * 파일 이름·내용은 로그와 분석 이벤트에 남기지 않는다.
 */
export async function runHandoff({
  id, store, getCurrentRoomId = () => null, createRoom, upload, openInvite = () => {},
  notifyError, t, clearUrl = () => {}
}) {
  const fail = (key) => { try { notifyError(t(key)) } catch { /* 안내 실패는 무시 */ } return false }
  let entry = null
  try {
    entry = await store.read(id)
  } catch {
    clearUrl()
    return fail('handoff.failed')
  }
  clearUrl()
  if (!entry) return fail('handoff.expired')
  try {
    const file = new File([entry.bytes], entry.name || 'document', { type: entry.type || 'application/octet-stream' })
    let roomId = getCurrentRoomId()
    const existing = !!roomId
    if (!existing) roomId = await createRoom() // 만들면서 초대 시트도 연다
    if (!roomId) return fail('handoff.failed')
    const ok = await upload([file])
    if (!ok) return fail('handoff.failed')
    if (existing) await openInvite(roomId)
    return true
  } catch {
    return fail('handoff.failed')
  } finally {
    store.remove(id).catch(() => {}) // 성공이든 실패든 전달함에는 남기지 않는다
  }
}

/** 주소에서 handoff, from 만 지운다 (다른 쿼리는 그대로) */
export function stripHandoffParams(win = window) {
  const u = new URL(win.location.href)
  u.searchParams.delete('handoff')
  u.searchParams.delete('from')
  win.history.replaceState(win.history.state, '', u.pathname + u.search + u.hash)
}
