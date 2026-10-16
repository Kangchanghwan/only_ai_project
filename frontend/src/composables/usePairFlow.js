import { ref, computed } from 'vue'
import { createPairing } from '../services/pairing.js'
import { identityName, isValidIdentity, sameIdentity } from '../utils/identity.js'

/** 보낸 초대 에러 코드 → 사용자 안내 문구 */
export function inviteErrorText(code, t) {
  switch (code) {
    case 'COOLDOWN': return t('pair.errors.COOLDOWN')
    case 'TOO_MANY': return t('pair.errors.TOO_MANY')
    case 'BLOCKED': return t('pair.errors.BLOCKED')
    case 'TARGET_NOT_FOUND': return t('pair.errors.TARGET_NOT_FOUND')
    case 'ALREADY_PAIRED': return t('pair.errors.ALREADY_PAIRED')
    case 'RATE_LIMITED': return t('pair.errors.RATE_LIMITED')
    case 'TIMEOUT': return t('pair.errors.TIMEOUT')
    default: return t('pair.errors.generic')
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 안내가 필요 없는(내가 직접 끝낸) 종료 사유 */
const SILENT = new Set(['declined-by-me'])

/**
 * 1:1 연결 흐름 오케스트레이터. 세션 상태 기계(services/pairing.js)와 화면 사이를 잇는다.
 * - 보낸/받은 요청, 그림 확인, 완료 처리(방 등록 → onRoomReady), 토스트, GA 이벤트, 탭 제목 알림
 * @param {{
 *   adapter?: object|null, privateRooms: object,
 *   notify: {showInfo: Function, showSuccess: Function, showError: Function},
 *   track?: (name: string, params?: object) => void,
 *   t: (key: string, params?: object) => string,
 *   onRoomReady?: (roomId: string, peer: object) => void|Promise<void>,
 *   leaveRoom?: (roomId: string) => void|Promise<void>
 * }} deps
 */
export function usePairFlow({ adapter, privateRooms, notify, track = () => {}, t, onRoomReady, leaveRoom }) {
  const sessions = ref([])
  /** sessionId → 내가 초대한 대상 socketId */
  const targets = ref({})
  /** ack 전 임시 대기 중인 대상 socketId 집합 */
  const preInvite = ref({})
  const highlightRoomId = ref(null)
  const announcement = ref('')

  const locallyEnded = new Set()
  const handled = new Set()
  const tracked = new Set()
  let highlightTimer = null

  const nameOf = (peer) => (peer && isValidIdentity(peer.identity) ? identityName(peer.identity, t) : '')

  const incoming = computed(() => sessions.value.find((s) => s.state === 'incoming') || null)
  /** 내가 수락(+확인)을 눌렀고 보낸 쪽 확인을 기다리는 받은 요청 (요청 시트 안에서 대기 문구를 보여 준다) */
  const respondedWaiting = computed(
    () => sessions.value.find((s) => s.role === 'responder' && !s.legacy && s.state === 'waiting-peer-confirm') || null
  )
  /** 가운데 그림 확인 시트는 옛 흐름(legacy)에서만 쓴다. v3는 보낸 쪽은 기기 행, 받은 쪽은 요청 시트 안에서 확인한다 */
  const confirming = computed(
    () => sessions.value.find((s) => s.legacy && ['accepted', 'keyed', 'waiting-peer-confirm'].includes(s.state)) || null
  )

  /** socketId → 기기 행 상태 { state: 'pending'|'connecting'|'paired', sessionId?, expiresAt?, roomId? } */
  const pairStates = computed(() => {
    const map = {}
    for (const id of Object.keys(preInvite.value)) map[id] = { state: 'pending', sessionId: null, expiresAt: null }
    for (const s of sessions.value) {
      const target = targets.value[s.sessionId] || s.peer?.socketId
      if (!target) continue
      const initiatorWaiting = s.role === 'initiator' && !s.legacy && s.state === 'waiting-peer-confirm'
      if (s.state === 'inviting' || initiatorWaiting) {
        map[target] = { state: 'pending', sessionId: s.sessionId, expiresAt: s.expiresAt, sas: s.sas, confirmed: !!s.confirmed }
      } else if (['accepted', 'keyed', 'waiting-peer-confirm'].includes(s.state)) {
        map[target] = { state: 'connecting', sessionId: s.sessionId }
      }
    }
    for (const r of privateRooms.rooms) {
      if (r.status !== 'online' || !r.peer?.socketId) continue
      map[r.peer.socketId] = { state: 'paired', roomId: r.roomId }
    }
    return map
  })

  // === 탭 제목 알림 ===
  function syncTitle() {
    if (typeof document === 'undefined') return
    const want = !!incoming.value && document.hidden
    const has = document.title.startsWith('(1) ')
    if (want && !has) document.title = '(1) ' + document.title
    else if (!want && has) document.title = document.title.slice(4)
  }

  function showEnded(s) {
    const reason = s.reason
    if (!reason || SILENT.has(reason)) return
    if (reason === 'mismatch') {
      track('pair_mismatch')
      notify.showError(t('pair.ended.mismatch'))
    } else if (reason === 'declined') {
      notify.showInfo(t('pair.ended.declined'))
    } else if (reason === 'cancelled') {
      if (!locallyEnded.has(s.sessionId)) notify.showInfo(t('pair.ended.cancelled'))
    } else if (reason === 'expired') {
      notify.showInfo(t('pair.ended.expired'))
    } else if (reason === 'peer-left') {
      notify.showInfo(t('pair.ended.peerLeft'))
    } else {
      notify.showError(t('pair.ended.failed'))
    }
  }

  function onSessions(snap) {
    sessions.value = snap
    const toDismiss = []
    for (const s of snap) {
      if (s.state === 'incoming' && !tracked.has(s.sessionId)) {
        tracked.add(s.sessionId)
        track('pair_incoming', { same_network: !!s.sameNetwork })
        announcement.value = t('pair.request.announce', { name: nameOf(s.peer) })
      }
      if (s.state === 'ended' && !handled.has(s.sessionId)) {
        handled.add(s.sessionId)
        showEnded(s)
        const { [s.sessionId]: _gone, ...rest } = targets.value
        targets.value = rest
        toDismiss.push(s.sessionId)
      } else if (s.state === 'done') {
        toDismiss.push(s.sessionId)
      }
    }
    if (!snap.some((s) => s.state === 'incoming')) announcement.value = ''
    syncTitle()
    for (const id of toDismiss) queueMicrotask(() => pairing?.dismiss(id))
  }

  async function handlePaired({ roomId, peer, roomSecret, ticket = null }) {
    // 같은 상대와 이전에 나간 방이 남아 있으면 정리
    for (const r of [...privateRooms.rooms]) {
      const samePeer = !!peer && ((peer.socketId && r.peer?.socketId === peer.socketId) ||
        (isValidIdentity(peer.identity) && isValidIdentity(r.peer?.identity) && sameIdentity(peer.identity, r.peer.identity)))
      if (r.roomId !== roomId && r.status === 'left' && samePeer) {
        privateRooms.removeRoom(r.roomId)
        try { await leaveRoom?.(r.roomId) } catch { /* 이미 정리된 방 */ }
      }
    }
    await privateRooms.addRoom({ roomId, peer, roomSecret, ticket })
    track('pair_done')
    notify.showSuccess(t('pair.connected', { name: nameOf(peer) }))
    if (!prefersReducedMotion()) {
      highlightRoomId.value = roomId
      clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => { highlightRoomId.value = null }, 2400)
    }
    await onRoomReady?.(roomId, peer)
  }

  const pairing = adapter ? createPairing({ socket: adapter, onPaired: (info) => { handlePaired(info).catch((e) => console.error('[pair] 완료 처리 실패:', e?.message || e)) } }) : null
  const unsubscribe = pairing ? pairing.onChange(onSessions) : () => {}

  const onVisibility = () => syncTitle()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  // === 동작 ===
  /** 기기 행의 "1:1" 버튼 */
  async function invite(device) {
    if (!pairing || !device?.socketId) return
    const id = device.socketId
    if (preInvite.value[id] || pairStates.value[id]) return
    preInvite.value = { ...preInvite.value, [id]: true }
    try {
      const res = await pairing.invite(id)
      if (res.ok) {
        targets.value = { ...targets.value, [res.sessionId]: id }
        track('pair_invite')
      } else {
        notify.showError(inviteErrorText(res.code, t))
      }
    } finally {
      const { [id]: _x, ...rest } = preInvite.value
      preInvite.value = rest
    }
  }

  async function cancel(sessionId) {
    if (!pairing || !sessionId) return
    locallyEnded.add(sessionId)
    await pairing.cancel(sessionId)
  }

  /**
   * 받은 요청 응답. block=true면 이번 접속 동안 이 기기 요청을 받지 않는다.
   * same=true는 수락+그림 확인 한 번에, mismatch=true는 "그림이 달라요"(거절 + 불일치 안내)
   */
  async function respond(accept, { block = false, same = false, mismatch = false } = {}) {
    const s = incoming.value
    if (!pairing || !s) return
    // mismatch는 종료 안내(showEnded)에서 pair_mismatch로 기록된다
    if (!mismatch) track(accept ? 'pair_accept' : 'pair_decline', block ? { blocked: true } : {})
    if (accept && same) track('pair_confirm', { same: true })
    const res = await pairing.respond(s.sessionId, accept, { block, same, reason: mismatch ? 'mismatch' : null })
    if (!res.ok) notify.showError(t('pair.ended.failed'))
  }

  /** 보낸 쪽 기기 행의 "같아요" (수락 전에도 가능) */
  async function confirmInvite(sessionId) {
    if (!pairing || !sessionId) return
    track('pair_confirm', { same: true })
    const res = await pairing.confirm(sessionId, true)
    if (!res.ok && res.code !== 'BAD_STATE') notify.showError(t('pair.ended.failed'))
  }

  /** 그림 확인 결과 */
  async function confirm(same) {
    const s = confirming.value
    if (!pairing || !s || s.state !== 'keyed') return
    track('pair_confirm', { same: !!same })
    const res = await pairing.confirm(s.sessionId, !!same)
    if (!res.ok) notify.showError(t('pair.ended.failed'))
  }

  /** 확인 시트 Esc/닫기: 그림이 보이면 "달라요", 아니면 연결 취소 */
  async function cancelConfirming() {
    const s = confirming.value
    if (!s) return
    if (s.state === 'keyed') await confirm(false)
    else await cancel(s.sessionId)
  }

  function destroy() {
    unsubscribe()
    pairing?.destroy()
    clearTimeout(highlightTimer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
      if (document.title.startsWith('(1) ')) document.title = document.title.slice(4)
    }
  }

  return {
    enabled: !!pairing,
    sessions, incoming, respondedWaiting, confirming, pairStates, highlightRoomId, announcement,
    invite, cancel, respond, confirm, confirmInvite, cancelConfirming, destroy
  }
}
