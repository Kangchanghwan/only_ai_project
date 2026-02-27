import { readonly } from 'vue'
import { socketService } from '../services/socketService.js'

/**
 * @composable useSocket
 * @description Socket.IO 연결 상태 및 이벤트를 관리하는 컴포저블.
 *              단일 공유 룸(room-shared)에 자동 입장합니다.
 */
export function useSocket() {
  function onMessage(callback) {
    socketService.on('message', callback)
    return () => {
      socketService.off('message', callback)
    }
  }

  function onUserLeft(callback) {
    const handler = (userCount) => {
      socketService.usersInRoom.value = userCount
      callback(userCount)
    }
    socketService.on('user-left', handler)
    return () => {
      socketService.off('user-left', handler)
    }
  }

  /**
   * 재연결 성공 시 콜백을 등록합니다
   * @param {Function} callback - () => void
   */
  function onReconnected(callback) {
    socketService.onReconnected(callback)
  }

  return {
    isConnected: readonly(socketService.isConnected),
    isOnline: readonly(socketService.isOnline),
    usersInRoom: readonly(socketService.usersInRoom),

    connect: socketService.connect.bind(socketService),
    disconnect: socketService.disconnect.bind(socketService),
    destroy: socketService.destroy.bind(socketService),
    publishMessage: socketService.publishMessage.bind(socketService),

    onMessage,
    onUserLeft,
    onReconnected,
  }
}
