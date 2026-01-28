import { ref } from 'vue'
import { io } from 'socket.io-client'

/**
 * Socket.IO 서비스
 *
 * Socket.IO 클라이언트 연결 및 이벤트 관리를 담당하는 싱글톤 서비스입니다.
 * Best Practice: 서비스 레이어로 분리하여 비즈니스 로직과 통신 로직을 분리
 */
class SocketService {
  constructor() {
    // 소켓 인스턴스
    this.socket = null

    // 반응형 상태
    this.isConnected = ref(false)
    this.currentRoomNr = ref(null)
    this.usersInRoom = ref(0)
    this.devicesInRoom = ref([])
    this.connectionError = ref(null)

    // 설정
    this.serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

    // 재연결 설정 (Socket.IO Best Practice)
    this.reconnectionConfig = {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000
    }
  }

  /**
   * 서버에 연결하고 자동으로 룸을 생성합니다
   *
   * Socket.IO Best Practice:
   * - transports 우선순위 설정 (websocket 우선, polling 폴백)
   * - 재연결 전략 설정
   * - 타임아웃 처리
   * - 에러 핸들링
   *
   * @returns {Promise<{roomNr: number, users: number}>} 생성된 룸 정보
   */
  connect() {
    // 이미 연결되어 있는 경우
    if (this.socket?.connected) {
      console.warn('[SocketService] 이미 소켓에 연결되어 있습니다')
      return Promise.resolve({
        roomNr: this.currentRoomNr.value,
        users: this.usersInRoom.value
      })
    }

    console.log('[SocketService] 서버 연결 시작:', this.serverUrl)

    return new Promise((resolve, reject) => {
      // Socket.IO 클라이언트 초기화
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'], // WebSocket 우선, 실패 시 polling으로 폴백
        ...this.reconnectionConfig
      })

      // 연결 타임아웃 설정
      const connectionTimeout = setTimeout(() => {
        this.socket?.off('registered', handleRegistered)
        this.connectionError.value = 'Connection timeout'
        reject(new Error('연결 시간 초과'))
      }, this.reconnectionConfig.timeout)

      /**
       * 'registered' 이벤트 핸들러
       * 서버가 자동으로 룸을 생성하고 클라이언트를 등록했을 때 발생
       */
      const handleRegistered = (roomNr) => {
        console.log('[SocketService] 자동 룸 생성 완료:', roomNr)
        clearTimeout(connectionTimeout)

        this.currentRoomNr.value = roomNr
        this.usersInRoom.value = 1
        this.connectionError.value = null

        this.socket.off('registered', handleRegistered)
        resolve({ roomNr, users: 1 })
      }

      // 연결 성공 이벤트
      this.socket.on('connect', () => {
        console.log('[SocketService] 연결 성공, Socket ID:', this.socket.id)
        this.isConnected.value = true
        this.connectionError.value = null
      })

      // 연결 해제 이벤트
      this.socket.on('disconnect', (reason) => {
        console.log('[SocketService] 연결 해제됨, 이유:', reason)
        this.isConnected.value = false

        // 서버가 강제로 끊은 경우 재연결하지 않음
        if (reason === 'io server disconnect') {
          console.warn('[SocketService] 서버에서 연결을 종료했습니다')
        }
      })

      // 연결 에러 이벤트 (Socket.IO Best Practice: 에러 핸들링)
      this.socket.on('connect_error', (error) => {
        console.error('[SocketService] 연결 오류:', error.message)
        this.isConnected.value = false
        this.connectionError.value = error.message

        clearTimeout(connectionTimeout)
        reject(error)
      })

      // 재연결 시도 이벤트
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`[SocketService] 재연결 시도 ${attemptNumber}회`)
      })

      // 재연결 실패 이벤트
      this.socket.on('reconnect_failed', () => {
        console.error('[SocketService] 재연결 실패: 최대 시도 횟수 초과')
        this.connectionError.value = '서버 연결 실패'
      })

      // 자동 룸 생성 이벤트 리스너 등록
      this.socket.on('registered', handleRegistered)

      // 디바이스 목록 업데이트 리스너
      this.socket.on('devices-updated', (devices) => {
        this.devicesInRoom.value = devices
      })
    })
  }

  /**
   * 기존 소켓 인스턴스를 재활용해 연결을 복구합니다.
   * connect()와 달리 새 소켓/룸을 생성하지 않습니다.
   *
   * @returns {Promise<boolean>} 재연결 성공 여부
   */
  reconnect() {
    if (!this.socket) return Promise.resolve(false)
    if (this.socket.connected) return Promise.resolve(true)

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000)
      this.socket.once('connect', () => {
        clearTimeout(timeout)
        this.isConnected.value = true
        resolve(true)
      })
      this.socket.connect()
    })
  }

  /**
   * 기존 룸에 입장합니다
   *
   * Socket.IO Best Practice:
   * - acknowledgement 콜백 대신 Promise 기반 처리
   * - 타임아웃 설정으로 무한 대기 방지
   * - 에러 이벤트 처리
   *
   * @param {number} roomNr - 입장할 룸 번호
   * @returns {Promise<{roomNr: number, users: number}>} 입장한 룸 정보
   */
  joinRoom(roomNr) {
    if (!this.socket?.connected) {
      console.error('[SocketService] 소켓이 연결되지 않았습니다')
      return Promise.reject(new Error('Socket not connected'))
    }

    console.log('[SocketService] 룸 입장 요청:', roomNr)

    return new Promise((resolve, reject) => {
      // 타임아웃 설정 (5초)
      const joinTimeout = setTimeout(() => {
        this.socket.off('subscribed', handleSubscribed)
        this.socket.off('room-not-found', handleRoomNotFound)
        reject(new Error('룸 입장 시간 초과'))
      }, 5000)

      /**
       * 'subscribed' 이벤트 핸들러
       * 룸 입장이 성공했을 때 발생
       */
      const handleSubscribed = (roomNumber, userCount) => {
        console.log('[SocketService] 룸 입장 완료:', roomNumber, '사용자:', userCount)
        clearTimeout(joinTimeout)

        this.currentRoomNr.value = roomNumber
        this.usersInRoom.value = userCount

        // 이벤트 리스너 정리
        this.socket.off('subscribed', handleSubscribed)
        this.socket.off('room-not-found', handleRoomNotFound)

        resolve({ roomNr: roomNumber, users: userCount })
      }

      /**
       * 'room-not-found' 이벤트 핸들러
       * 입장하려는 룸이 존재하지 않을 때 발생
       */
      const handleRoomNotFound = () => {
        console.error('[SocketService] 룸이 존재하지 않습니다:', roomNr)
        clearTimeout(joinTimeout)

        // 이벤트 리스너 정리
        this.socket.off('subscribed', handleSubscribed)
        this.socket.off('room-not-found', handleRoomNotFound)

        reject(new Error('Room does not exist'))
      }

      // 이벤트 리스너 등록
      this.socket.once('subscribed', handleSubscribed)
      this.socket.once('room-not-found', handleRoomNotFound)

      // 룸 입장 요청 전송
      this.socket.emit('join', roomNr)
    })
  }

  /**
   * 메시지를 서버로 전송합니다
   *
   * Socket.IO Best Practice:
   * - 구조화된 메시지 형식 사용
   * - 에러 처리
   *
   * @param {Object} message - 전송할 메시지 객체
   * @param {string} message.type - 메시지 타입 (예: 'file-uploaded')
   * @param {*} message.data - 메시지 데이터
   */
  publishMessage(message) {
    if (!this.socket?.connected) {
      console.error('[SocketService] 소켓이 연결되지 않았습니다')
      throw new Error('Socket not connected')
    }

    console.log('[SocketService] 메시지 전송:', message)
    this.socket.emit('publish', message)
  }

  /**
   * 특정 이벤트에 대한 리스너를 등록합니다
   *
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 이벤트 핸들러 함수
   */
  on(event, callback) {
    if (!this.socket) {
      console.error('[SocketService] 소켓이 초기화되지 않았습니다')
      return
    }

    this.socket.on(event, callback)
  }

  /**
   * 특정 이벤트의 리스너를 제거합니다
   *
   * Vue 3 Best Practice: 컴포넌트 언마운트 시 이벤트 리스너를 제거하여 메모리 누수 방지
   *
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 제거할 이벤트 핸들러 함수
   */
  off(event, callback) {
    if (!this.socket) {
      console.error('[SocketService] 소켓이 초기화되지 않았습니다')
      return
    }

    this.socket.off(event, callback)
  }

  /**
   * 소켓 연결을 해제합니다
   *
   * Socket.IO Best Practice:
   * - 명시적인 연결 해제
   * - 상태 초기화
   * - 리소스 정리
   */
  disconnect() {
    if (this.socket) {
      console.log('[SocketService] 소켓 연결 해제 중')

      // 소켓 연결 해제
      this.socket.disconnect()
      this.socket = null

      // 상태 초기화
      this.isConnected.value = false
      this.currentRoomNr.value = null
      this.usersInRoom.value = 0
      this.devicesInRoom.value = []
      this.connectionError.value = null

      console.log('[SocketService] 소켓 연결 해제 완료')
    }
  }
}

// 싱글톤 인스턴스 생성 및 export
export const socketService = new SocketService()
