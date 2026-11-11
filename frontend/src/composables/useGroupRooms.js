import { ref } from 'vue'
import QRCode from 'qrcode'
import { newRoomSecret } from '../utils/pairCrypto.js'
import { buildInviteUrl, sanitizeRoomName } from '../utils/groupInvite.js'
import { isGroupRoomId } from '../utils/groupRoom.js'

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
 *   onAlreadyIn?: (roomId: string) => void
 * }} deps
 */
export function useGroupRooms({
  privateRooms, socket, notify, track = () => {}, t,
  getMyName = () => '', waitRegistered = async () => true,
  getOrigin = () => window.location.origin, onRoomReady, onAlreadyIn
}) {
  /** 초대 시트: { roomId, name, url, qrDataUrl, loading } | null */
  const inviteSheet = ref(null)
  /** 확인 시트: { roomId, name, busy } | null (방 비밀은 반응형 상태에 두지 않는다) */
  const joinSheet = ref(null)
  /** 예전 방(prv-…)에서 초대를 눌렀을 때 안내 시트: { roomId } | null */
  const legacySheet = ref(null)
  const creating = ref(false)

  let pending = null // { roomId, ticket, secret, name }

  const safeTrack = (name, params) => { try { if (params === undefined) track(name); else track(name, params) } catch { /* 측정 실패는 무시 */ } }
  const displayName = (name) => name || t('group.unnamed')

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
    const name = displayName(room.name)
    inviteSheet.value = { roomId, name, url: '', qrDataUrl: '', loading: true }
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
    inviteSheet.value = null
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

  /** 확인 시트의 "들어가기" */
  async function confirmJoin() {
    const p = pending
    if (!p || !joinSheet.value || joinSheet.value.busy) return
    joinSheet.value = { ...joinSheet.value, busy: true }
    try {
      if (!(await waitRegistered())) {
        notify.showError(t('pair.errors.TIMEOUT'))
        finishJoin('invalid')
        return
      }
      if (privateRooms.has(p.roomId)) { // 확인을 기다리는 사이 이미 들어온 경우
        onAlreadyIn?.(p.roomId)
        notify.showInfo(t('group.alreadyIn'))
        finishJoin('already')
        return
      }
      if (privateRooms.rooms.length >= 10) {
        notify.showError(t('group.tooMany'))
        finishJoin('invalid')
        return
      }
      const res = await socket.joinPrivate?.([p.ticket])
      if (!res?.ok) {
        notify.showError(t('group.failed'))
        finishJoin('invalid')
        return
      }
      if ((res.full || []).includes(p.roomId)) {
        notify.showError(t('group.full'))
        finishJoin('full')
        return
      }
      const entry = (res.rooms || []).find((r) => r.roomId === p.roomId)
      if (!entry) {
        notify.showError(t('group.inviteExpired'))
        finishJoin('expired')
        return
      }
      await privateRooms.addRoom({ roomId: p.roomId, peer: null, roomSecret: p.secret, ticket: entry.ticket, name: p.name })
      notify.showSuccess(t('group.joined', { name: displayName(p.name) }))
      finishJoin('joined')
      await onRoomReady?.(p.roomId)
    } catch (e) {
      console.warn('[group] 입장 실패:', e?.message || e)
      notify.showError(t('group.failed'))
      finishJoin('invalid')
    }
  }

  return { inviteSheet, joinSheet, legacySheet, creating, createRoom, openInvite, closeInvite, closeLegacy, createFromLegacy, copyInviteLink, acceptInvite, cancelJoin, confirmJoin, defaultName }
}
