import { ref, onUnmounted } from 'vue'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

export function useSocket() {
  const socket = ref(null)
  const isConnected = ref(false)
  const currentRoomNr = ref(null)
  const usersInRoom = ref(0)

  /**
   * Socket.io 서버에 연결하고 자동 생성된 룸 번호를 받음
   */
  function connect() {
    if (socket.value) {
      console.warn('이미 소켓에 연결되어 있습니다')
      return Promise.resolve({ roomNr: currentRoomNr.value, users: usersInRoom.value })
    }

    console.log('Socket.io 서버에 연결 중:', SOCKET_URL)

    return new Promise((resolve, reject) => {
      socket.value = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      })

      const timeout = setTimeout(() => {
        socket.value.off('registered', onRegistered)
        reject(new Error('Connection timeout'))
      }, 10000)

      const onRegistered = (roomNr) => {
        console.log('자동 룸 생성 완료:', roomNr)
        clearTimeout(timeout)
        currentRoomNr.value = roomNr
        usersInRoom.value = 1
        socket.value.off('registered', onRegistered)
        resolve({ roomNr, users: 1 })
      }

      socket.value.on('connect', () => {
        console.log('Socket.io 연결됨:', socket.value.id)
        isConnected.value = true
      })

      socket.value.on('disconnect', () => {
        console.log('Socket.io 연결 해제됨')
        isConnected.value = false
      })

      socket.value.on('connect_error', (error) => {
        console.error('Socket.io 연결 오류:', error)
        isConnected.value = false
        clearTimeout(timeout)
        reject(error)
      })

      // 자동 룸 생성 이벤트 리스너
      socket.value.on('registered', onRegistered)
    })
  }


  /**
   * 기존 룸에 입장
   */
  function joinRoom(roomNr) {
    if (!socket.value) {
      console.error('소켓이 연결되지 않았습니다')
      return Promise.reject(new Error('Socket not connected'))
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.value.off('subscribed', onSubscribed)
        socket.value.off('room-not-found', onRoomNotFound)
        reject(new Error('Join room timeout'))
      }, 5000)

      const onSubscribed = (roomNumber, userCount) => {
        console.log('룸 입장 완료:', roomNumber, '사용자:', userCount)
        clearTimeout(timeout)
        currentRoomNr.value = roomNumber
        usersInRoom.value = userCount
        socket.value.off('subscribed', onSubscribed)
        socket.value.off('room-not-found', onRoomNotFound)
        resolve({ roomNr: roomNumber, users: userCount })
      }

      const onRoomNotFound = () => {
        console.error('룸이 존재하지 않습니다')
        clearTimeout(timeout)
        socket.value.off('subscribed', onSubscribed)
        socket.value.off('room-not-found', onRoomNotFound)
        reject(new Error('Room does not exist'))
      }

      socket.value.on('subscribed', onSubscribed)
      socket.value.on('room-not-found', onRoomNotFound)

      // 기존 룸 입장 요청
      socket.value.emit('join', roomNr)
    })
  }

  /**
   * 메시지 전송 (파일 정보, 텍스트 등)
   */
  function publishMessage(message) {
    if (!socket.value) {
      console.error('소켓이 연결되지 않았습니다')
      return
    }

    console.log('메시지 전송:', message)
    socket.value.emit('publish', message)
  }

  /**
   * 메시지 수신 이벤트 리스너
   */
  function onMessage(callback) {
    if (!socket.value) {
      console.error('소켓이 연결되지 않았습니다')
      return
    }

    socket.value.on('message', callback)
  }

  /**
   * 사용자 퇴장 이벤트 리스너
   */
  function onUserLeft(callback) {
    if (!socket.value) return
    socket.value.on('user-left', (userCount) => {
      usersInRoom.value = userCount
      callback(userCount)
    })
  }

  /**
   * 소켓 연결 해제
   */
  function disconnect() {
    if (socket.value) {
      console.log('소켓 연결 해제 중')
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
      currentRoomNr.value = null
      usersInRoom.value = 0
    }
  }

  /**
   * 컴포넌트 언마운트 시 자동 연결 해제
   */
  onUnmounted(() => {
    disconnect()
  })

  return {
    socket,
    isConnected,
    currentRoomNr,
    usersInRoom,
    connect,
    disconnect,
    joinRoom,
    publishMessage,
    onMessage,
    onUserLeft
  }
}
