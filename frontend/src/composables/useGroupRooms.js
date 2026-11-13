import { roomDisplayName } from '../utils/roomDisplayName.js'
import { ref, shallowRef, computed } from 'vue'
import QRCode from 'qrcode'
import { newRoomSecret } from '../utils/pairCrypto.js'
import { buildInviteUrl, sanitizeRoomName } from '../utils/groupInvite.js'
import { isGroupRoomId } from '../utils/groupRoom.js'
import { fromB64u } from '../utils/lockCrypto.js'

/**
 * 그룹 방: 만든 사람이 QR/링크를 보여 주면 다른 기기가 들어오는 비공개 방. 규격: docs/superpowers/specs/2026-11-12-group-rooms-design.md
 * - 초대 링크를 열어도 자동으로 들어가지 않는다. acceptInvite는 확인 시트만 열고, confirmJoin을 눌러야 join을 보낸다.
 * - 방 비밀·입장권·초대 링크는 로그와 분석 이벤트에 남기지 않는다(이벤트에는 결과 종류만).
 * @param {{
 *   privateRooms: object,
 *   socket: {createPrivate?: Function, invitePrivate?: Function, joinPrivate?: Function},
 *   notify: {showInfo: Function, showSuccess: Function, showError: Function},
 *   track?: (name: string, params?: object) => void,
 *   t: (key: string, params?: object) => string,
 *   getMyName?: () => string,
 *   waitRegistered?: () => Promise<boolean>,
 *   getOrigin?: () => string,
 *   onRoomReady?: (roomId: string) => void|Promise<void>,
 *   onAlreadyIn?: (roomId: string) => void,
 *   getCodeSocket?: () => object|null,
 *   isMobile?: boolean,
 *   loadCodeJoin?: () => Promise<{createCodeHost: Function, createCodeJoiner: Function}>
 * }} deps
 */
export function useGroupRooms({
  privateRooms, socket, notify, track = () => {}, t,
  getMyName = () => '', waitRegistered = async () => true,
  getOrigin = () => window.location.origin, onRoomReady, onAlreadyIn,
  getCodeSocket = () => null, isMobile = false,
  // 그림 코드 모듈(과 SPAKE2)은 그림 탭이나 "그림으로 들어가기"를 열 때만 내려받는다
  loadCodeJoin = () => import('../services/codeJoin.js')
}) {
  /** 초대 시트: { roomId, name, url, qrDataUrl, loading } | null */
  const inviteSheet = ref(null)
  /** 확인 시트: { roomId, name, busy } | null (방 비밀은 반응형 상태에 두지 않는다) */
  const joinSheet = ref(null)
  /** 예전 방(prv-…)에서 초대를 눌렀을 때 안내 시트: { roomId } | null */
  const legacySheet = ref(null)
  const creating = ref(false)
  /** "＋ 방" 선택 시트(새 방 만들기 / 그림으로 들어가기) */
  const choiceSheet = ref(false)
  /** 그림으로 들어가기 시트 */
  const enterSheet = ref(false)
  /** 초대 시트 탭: 'picture' | 'qr' | 'link' */
  const inviteTab = ref('qr')
  /** 그림 코드 호스트 컨트롤러(그림 탭이 보이는 동안에만 있다) */
  const codeHost = shallowRef(null)
  const codeJoiner = shallowRef(null)

  let pending = null // { roomId, ticket, secret, name }

  const safeTrack = (name, params) => { try { if (params === undefined) track(name); else track(name, params) } catch { /* 측정 실패는 무시 */ } }
  const displayName = (name) => name || t('group.unnamed')
  const shownName = (roomId, name) => (privateRooms.rooms?.some((r) => r.roomId === roomId) ? roomDisplayName(privateRooms.rooms, roomId, t('group.unnamed')) : displayName(name))

  function defaultName() {
    return sanitizeRoomName(t('group.defaultName', { name: getMyName() || t('pair.unknownDevice') }))
  }

  /** "＋ 방" 버튼 */
  async function createRoom() {
    if (creating.value) return null
    creating.value = true
    try {
      const secret = newRoomSecret()
      const res = await socket.createPrivate?.()
      if (!res?.ok) {
        notify.showError(res?.code === 'TOO_MANY_ROOMS' ? t('group.tooMany') : t('group.failed'))
        return null
      }
      const name = defaultName()
      await privateRooms.addRoom({ roomId: res.roomId, peer: null, roomSecret: secret, ticket: res.ticket, name })
      safeTrack('group_create')
      await onRoomReady?.(res.roomId)
      await openInvite(res.roomId)
      return res.roomId
    } finally {
      creating.value = false
    }
  }

  /** 초대 시트 열기: 열 때마다 새 초대 입장권을 받아 QR을 만든다 */
  async function openInvite(roomId) {
    const room = privateRooms.rooms.find((r) => r.roomId === roomId)
    if (!room) return
    if (!isGroupRoomId(roomId)) {
      // 예전 방식으로 만든 방은 초대할 수 없다: 안내만 보여 준다
      legacySheet.value = { roomId }
      safeTrack('room_legacy_invite')
      return
    }
    const name = shownName(roomId, room.name)
    inviteSheet.value = { roomId, name, url: '', qrDataUrl: '', loading: true }
    // 폰이면 그림, PC면 QR이 기본 탭
    inviteTab.value = isMobile ? 'picture' : 'qr'
    if (inviteTab.value === 'picture') startCode(roomId)
    try {
      const secret = await privateRooms.inviteSecretFor(roomId)
      const res = secret ? await socket.invitePrivate?.(roomId) : null
      if (!secret || !res?.ok) throw new Error('INVITE_FAILED')
      const url = buildInviteUrl(getOrigin(), { roomId, ticket: res.ticket, secret, name: room.name })
      const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#000000', light: '#FFFFFF' } })
      if (inviteSheet.value?.roomId !== roomId) return // 그 사이 닫혔다
      inviteSheet.value = { roomId, name, url, qrDataUrl, loading: false }
      safeTrack('group_invite_open')
    } catch {
      stopCode()
      inviteSheet.value = null
      notify.showError(t('group.failed'))
    }
  }

  function closeLegacy() {
    legacySheet.value = null
  }

  /** 안내 시트의 "새 방 만들기" */
  async function createFromLegacy() {
    legacySheet.value = null
    return createRoom()
  }

  function closeInvite() {
    stopCode()
    inviteSheet.value = null
  }

  // === 그림 코드: 호스트(초대 시트의 그림 탭) ===

  async function startCode(roomId) {
    stopCode()
    const room = privateRooms.rooms.find((r) => r.roomId === roomId)
    const adapter = getCodeSocket()
    if (!room || !adapter) return
    let mod
    try { mod = await loadCodeJoin() } catch { notify.showError(t('code.openFailed')); return }
    // 모듈을 받는 사이 시트가 닫혔거나 탭이 바뀐 경우
    if (inviteSheet.value?.roomId !== roomId || inviteTab.value !== 'picture') return
    const host = mod.createCodeHost({
      socket: adapter,
      roomId,
      roomName: room.name || '',
      getInviteTicket: async () => {
        const res = await socket.invitePrivate?.(roomId)
        if (!res?.ok) throw new Error('INVITE_FAILED')
        return res.ticket
      },
      getRoomSecret: () => privateRooms.inviteSecretFor(roomId),
      // 승인 토스트는 띄우지 않는다: 들어온 기기는 방 이름이 붙은 입장 토스트(App.vue presence)가 알린다
      onApproved: () => {}
    })
    codeHost.value = host
    const ok = await host.start()
    if (!ok && codeHost.value === host) notify.showError(t('code.openFailed'))
  }

  function stopCode() {
    const host = codeHost.value
    codeHost.value = null
    if (host) host.close()
  }

  /** 초대 시트 탭 바꾸기. 그림 탭이 보일 때만 코드를 연다 */
  function selectInviteTab(tab) {
    if (!['picture', 'qr', 'link'].includes(tab) || !inviteSheet.value) return
    inviteTab.value = tab
    if (tab === 'picture') startCode(inviteSheet.value.roomId)
    else stopCode()
  }

  /** 시트 상태(반응형): 그림 탭에 내려 줄 값 */
  const codeState = computed(() => {
    const h = codeHost.value
    if (!h) return null
    return { code: h.code.value, expiresAt: h.expiresAt.value, request: h.pendingRequest.value, requestCount: h.requestCount.value, status: h.status.value }
  })
  const renewCode = () => codeHost.value?.renew()
  const decideCode = (accept) => codeHost.value?.decide(accept)

  // === "＋ 방" 선택 시트 / 그림으로 들어가기 ===
  function openChoice() { choiceSheet.value = true }
  function closeChoice() { choiceSheet.value = false }
  async function createFromChoice() {
    choiceSheet.value = false
    return createRoom()
  }
  async function openEnter() {
    choiceSheet.value = false
    enterSheet.value = true
    const adapter = getCodeSocket()
    if (!adapter) return
    try {
      const mod = await loadCodeJoin()
      if (!enterSheet.value) return
      codeJoiner.value = mod.createCodeJoiner({ socket: adapter })
    } catch { notify.showError(t('code.openFailed')) }
  }
  function closeEnter() {
    const j = codeJoiner.value
    codeJoiner.value = null
    enterSheet.value = false
    j?.cancel()
  }
  const enterState = computed(() => {
    const j = codeJoiner.value
    return { status: j?.status.value ?? 'idle', warn: j?.warn.value ?? false, retryAfterSec: j?.retryAfterSec.value ?? 0 }
  })
  const cancelEnter = () => codeJoiner.value?.cancel()

  /** 그림 4개를 보냈을 때: 승인되면 확인 시트 없이 바로 들어간다(코드를 직접 입력했으므로) */
  async function submitCode(code) {
    const j = codeJoiner.value
    if (!j) return
    const res = await j.join(code)
    if (res.status !== 'joined' || codeJoiner.value !== j) return
    const { secret, ticket, name } = res.payload
    const roomId = typeof ticket === 'string' ? ticket.split('.')[1] : ''
    let secretBytes = null
    try { secretBytes = fromB64u(secret) } catch { /* 아래에서 실패 처리 */ }
    if (!isGroupRoomId(roomId) || !secretBytes || secretBytes.length !== 32) {
      notify.showError(t('group.failed'))
      closeEnter()
      return
    }
    const result = await runJoin({ roomId, ticket, secret: secretBytes, name: sanitizeRoomName(name) })
    closeEnter()
    if (result === 'joined') await onRoomReady?.(roomId)
  }

  async function copyInviteLink() {
    const url = inviteSheet.value?.url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      safeTrack('group_invite_copy')
      notify.showSuccess(t('group.inviteCopied'))
    } catch {
      notify.showError(t('group.failed'))
    }
  }

  /**
   * 초대 링크를 열었을 때. 절대 자동으로 입장하지 않는다.
   * @param {{roomId: string, ticket: string, secret: Uint8Array, name: string}|null} parsed parseInvite 결과(검증 실패면 null)
   */
  async function acceptInvite(parsed) {
    if (!parsed) {
      notify.showError(t('group.inviteInvalid'))
      safeTrack('group_join', { result: 'invalid' })
      return
    }
    // 저장된 방 목록이 아직 복원 중일 수 있다(앱 시작 직후 링크를 연 경우)
    try { await privateRooms.hydrate?.() } catch { /* 복원 실패는 무시: 새 방으로 취급 */ }
    if (privateRooms.has(parsed.roomId)) {
      pending = null
      joinSheet.value = null
      onAlreadyIn?.(parsed.roomId)
      notify.showInfo(t('group.alreadyIn'))
      safeTrack('group_join', { result: 'already' })
      return
    }
    pending = { roomId: parsed.roomId, ticket: parsed.ticket, secret: parsed.secret, name: sanitizeRoomName(parsed.name) }
    joinSheet.value = { roomId: parsed.roomId, name: displayName(pending.name), busy: false }
  }

  function cancelJoin() {
    if (joinSheet.value?.busy) return
    pending = null
    joinSheet.value = null
    safeTrack('group_join', { result: 'cancel' })
  }

  function finishJoin(result) {
    pending = null
    joinSheet.value = null
    safeTrack('group_join', { result })
  }

  /**
   * 입장권으로 방에 들어가 방 목록에 넣는다(링크 입장·그림 코드 입장 공통). 토스트까지 처리하고 결과 종류를 돌려준다.
   * 'joined' | 'already' | 'full' | 'expired' | 'invalid'. onRoomReady는 부른 쪽이 'joined'일 때 호출한다.
   */
  async function runJoin(p) {
    try {
      if (!(await waitRegistered())) {
        notify.showError(t('pair.errors.TIMEOUT'))
        return 'invalid'
      }
      if (privateRooms.has(p.roomId)) { // 확인을 기다리는 사이 이미 들어온 경우
        onAlreadyIn?.(p.roomId)
        notify.showInfo(t('group.alreadyIn'))
        return 'already'
      }
      if (privateRooms.rooms.length >= 10) {
        notify.showError(t('group.tooMany'))
        return 'invalid'
      }
      const res = await socket.joinPrivate?.([p.ticket])
      if (!res?.ok) {
        notify.showError(t('group.failed'))
        return 'invalid'
      }
      if ((res.full || []).includes(p.roomId)) {
        notify.showError(t('group.full'))
        return 'full'
      }
      const entry = (res.rooms || []).find((r) => r.roomId === p.roomId)
      if (!entry) {
        notify.showError(t('group.inviteExpired'))
        return 'expired'
      }
      await privateRooms.addRoom({ roomId: p.roomId, peer: null, roomSecret: p.secret, ticket: entry.ticket, name: p.name })
      notify.showSuccess(t('group.joined', { name: shownName(p.roomId, p.name) }))
      return 'joined'
    } catch (e) {
      console.warn('[group] 입장 실패:', e?.message || e)
      notify.showError(t('group.failed'))
      return 'invalid'
    }
  }

  /** 확인 시트의 "들어가기" */
  async function confirmJoin() {
    const p = pending
    if (!p || !joinSheet.value || joinSheet.value.busy) return
    joinSheet.value = { ...joinSheet.value, busy: true }
    const result = await runJoin(p)
    finishJoin(result)
    if (result === 'joined') await onRoomReady?.(p.roomId)
  }

  return {
    choiceSheet, enterSheet, inviteTab, codeState, enterState, selectInviteTab, renewCode, decideCode,
    openChoice, closeChoice, createFromChoice, openEnter, closeEnter, cancelEnter, submitCode,
    inviteSheet, joinSheet, legacySheet, creating, createRoom, openInvite, closeInvite, closeLegacy, createFromLegacy, copyInviteLink, acceptInvite, cancelJoin, confirmJoin, defaultName }
}
