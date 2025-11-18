import { readonly } from 'vue'
import { socketService } from '../services/socketService.js'

/**
 * @composable useSocket
 * @description `socketService`와 상호작용하여 Socket.IO 연결 상태 및 이벤트를 관리하는 컴포저블.
 *              Vue 컴포넌트에서 실시간 통신 기능을 쉽게 사용할 수 있도록 반응형 상태와 메서드를 제공합니다.
 *
 * Vue 3 Best Practice:
 * - readonly()를 사용하여 외부에서 상태를 직접 수정하지 못하도록 보호
 * - 서비스 레이어와의 명확한 책임 분리
 * - 이벤트 리스너는 컴포넌트에서 직접 관리
 */
export function useSocket() {
  /**
   * 서버로부터 메시지를 수신할 때 호출될 콜백 함수를 등록합니다.
   *
   * 주의: 컴포넌트 언마운트 시 `socketService.off('message', callback)`으로
   *       이벤트 리스너를 해제해야 합니다.
   *
   * @param {Function} callback - 메시지 수신 시 실행될 콜백 함수.
   */
  function onMessage(callback) {
    socketService.on('message', callback)
  }

  /**
   * 룸에서 사용자가 퇴장할 때 호출될 콜백 함수를 등록합니다.
   * `socketService`의 `usersInRoom` 반응형 참조를 자동으로 업데이트합니다.
   *
   * 주의: 컴포넌트 언마운트 시 반환된 cleanup 함수를 호출하여
   *       이벤트 리스너를 해제해야 합니다.
   *
   * @param {Function} callback - 사용자 퇴장 시 실행될 콜백 함수. (현재 사용자 수를 인자로 받음)
   * @returns {Function} cleanup - 이벤트 리스너를 해제하는 함수
   */
  function onUserLeft(callback) {
    const handler = (userCount) => {
      socketService.usersInRoom.value = userCount // 서비스의 상태를 직접 업데이트
      callback(userCount)
    }
    socketService.on('user-left', handler)

    // cleanup 함수를 반환하여 컴포넌트에서 직접 관리하도록 함
    return () => {
      socketService.off('user-left', handler)
    }
  }

  // 컴포넌트 언마운트 시 소켓 연결 해제는 App.vue에서 전역적으로 관리합니다.

  return {
    /**
     * @property {import('vue').Readonly<boolean>} isConnected
     * 소켓 연결 상태 (읽기 전용).
     */
    isConnected: readonly(socketService.isConnected),
    /**
     * @property {import('vue').Readonly<number|null>} currentRoomNr
     * 현재 연결된 룸 번호 (읽기 전용).
     */
    currentRoomNr: readonly(socketService.currentRoomNr),
    /**
     * @property {import('vue').Readonly<number>} usersInRoom
     * 현재 룸에 있는 사용자 수 (읽기 전용).
     */
    usersInRoom: readonly(socketService.usersInRoom),

    /**
     * Socket.IO 서버에 연결을 시도합니다.
     * @returns {Promise<{roomNr: number, users: number}>}
     */
    connect: socketService.connect.bind(socketService),
    /**
     * 현재 소켓 연결을 해제합니다.
     */
    disconnect: socketService.disconnect.bind(socketService),
    /**
     * 특정 룸에 입장합니다.
     * @param {number} roomNr - 입장할 룸 번호.
     * @returns {Promise<{roomNr: number, users: number}>}
     */
    joinRoom: socketService.joinRoom.bind(socketService),
    /**
     * 서버로 메시지를 발행합니다.
     * @param {object} message - 전송할 메시지 객체.
     */
    publishMessage: socketService.publishMessage.bind(socketService),

    onMessage,
    onUserLeft,
  }
}
