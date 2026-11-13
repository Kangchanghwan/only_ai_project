/**
 * @file roomPresence.js
 * @description 방(같은 네트워크·내 비공개 방)마다 기기가 들어오고 나가는 것을 골라낸다 (입장·퇴장 토스트용).
 *
 * - 기기는 소켓이 아니라 동물 이름표(identity)로 센다. 폰이 잠깐 끊겼다 새 소켓으로 다시 붙어도 같은 기기다.
 * - 방마다 처음 받는 목록(내가 들어간 직후, 재접속 직후)은 알리지 않는다. 내 소켓이 목록에 보이면 그때부터 센다.
 * - 나는 빼고 센다 (같은 브라우저의 다른 탭도 이름표가 같아 빠진다).
 * - 나감은 바로 알리지 않고 graceMs 기다린다. 그 안에 다시 들어오면 둘 다 알리지 않는다(화면 꺼짐·와이파이 전환).
 */

/** 이름표로 만든 기기 키. 이름표가 없으면 소켓 ID */
export function presenceKey(device) {
  const id = device?.identity
  if (id && Number.isInteger(id.adj) && Number.isInteger(id.animal)) return `${id.adj}-${id.animal}-${id.suffix ?? 0}`
  return device?.socketId ? `s:${device.socketId}` : null
}

/**
 * @param {object} opts
 * @param {(roomKey:string, device:object)=>void} opts.onJoin
 * @param {(roomKey:string, device:object)=>void} opts.onLeave
 * @param {number} [opts.graceMs=20000]
 * @param {Function} [opts.setTimer] 테스트용
 * @param {Function} [opts.clearTimer] 테스트용
 */
export function createRoomPresence({ onJoin, onLeave, graceMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  /** roomKey → { ready: boolean, present: Map<key, device> } */
  const rooms = new Map()
  /** `${roomKey}|${key}` → { timer, device } */
  const pendingLeaves = new Map()

  function cancelPending(roomKey, key) {
    const id = `${roomKey}|${key}`
    const p = pendingLeaves.get(id)
    if (!p) return false
    clearTimer(p.timer)
    pendingLeaves.delete(id)
    return true
  }

  function cancelRoomPending(roomKey) {
    for (const [id, p] of pendingLeaves) {
      if (id.startsWith(`${roomKey}|`)) {
        clearTimer(p.timer)
        pendingLeaves.delete(id)
      }
    }
  }

  return {
    /**
     * @param {string} roomKey 'ip' 또는 비공개 방 ID
     * @param {Array<{socketId:string, identity?:object}>} devices 지금 그 방의 기기 목록
     * @param {{ mySocketId?: string|null, myKey?: string|null }} me
     */
    update(roomKey, devices, { mySocketId = null, myKey = null } = {}) {
      const list = Array.isArray(devices) ? devices : []
      const next = new Map()
      for (const d of list) {
        if (!d || d.socketId === mySocketId) continue
        const key = presenceKey(d)
        if (!key || key === myKey) continue
        if (!next.has(key)) next.set(key, d)
      }
      let state = rooms.get(roomKey)
      if (!state) {
        state = { ready: false, present: new Map() }
        rooms.set(roomKey, state)
      }
      if (!state.ready) {
        // 처음 목록: 기준으로만 삼는다. 내 소켓이 보여야 이 방에 들어간 뒤의 목록이다
        state.present = next
        if (mySocketId && list.some((d) => d?.socketId === mySocketId)) state.ready = true
        return
      }
      for (const [key, d] of next) {
        if (state.present.has(key)) continue
        // 잠깐 끊겼다 돌아온 기기: 나감도 들어옴도 알리지 않는다
        if (cancelPending(roomKey, key)) continue
        onJoin(roomKey, d)
      }
      for (const [key, d] of state.present) {
        if (next.has(key)) continue
        const id = `${roomKey}|${key}`
        if (pendingLeaves.has(id)) continue
        const timer = setTimer(() => {
          pendingLeaves.delete(id)
          onLeave(roomKey, d)
        }, graceMs)
        pendingLeaves.set(id, { timer, device: d })
      }
      state.present = next
    },

    /** 내가 재접속해 목록을 새로 받는 상태로. 기다리던 나감 알림은 버린다 */
    markInitial() {
      for (const [roomKey, state] of rooms) {
        state.ready = false
        cancelRoomPending(roomKey)
      }
    },

    /** 내가 나간 방은 잊는다 */
    forget(roomKey) {
      cancelRoomPending(roomKey)
      rooms.delete(roomKey)
    },

    /** 테스트·정리용 */
    dispose() {
      for (const p of pendingLeaves.values()) clearTimer(p.timer)
      pendingLeaves.clear()
      rooms.clear()
    },
  }
}
