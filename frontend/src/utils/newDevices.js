/**
 * @file newDevices.js
 * @description 같은 네트워크 방에 새로 들어온 기기만 골라낸다 (새 기기 토스트용).
 *              - 내 접속 직후 처음 받는 목록(초기 목록)은 토스트 대상이 아니다.
 *              - 한 번이라도 본 소켓 ID는 다시 나타나도 새 기기가 아니다 (연결 복구/깜빡임 제외).
 *              - 내 소켓은 제외한다.
 */
export function createNewDeviceTracker() {
  const seen = new Set()
  let initial = true

  return {
    /** 내가 (재)접속해 새 초기 목록을 기다리는 상태로 되돌린다. 본 소켓 기록은 유지한다 */
    markInitial() {
      initial = true
    },
    /**
     * @param {Array<{socketId:string}>} devices - 현재 방 기기 목록
     * @param {string|null} mySocketId
     * @returns {Array} 토스트로 알릴 새 기기들
     */
    update(devices, mySocketId) {
      const fresh = []
      for (const device of devices || []) {
        if (!device?.socketId) continue
        if (!seen.has(device.socketId)) {
          seen.add(device.socketId)
          if (!initial && device.socketId !== mySocketId) fresh.push(device)
        }
      }
      // 내 소켓이 목록에 들어온 뒤에야 초기 목록을 받은 것으로 본다
      if (initial && (devices || []).some((d) => d?.socketId === mySocketId)) initial = false
      return fresh
    },
    reset() {
      seen.clear()
      initial = true
    }
  }
}
