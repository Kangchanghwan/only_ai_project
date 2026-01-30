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
    this.isOnline = ref(navigator.onLine)
    this.currentRoomNr = ref(null)
    this.usersInRoom = ref(0)
    this.connectionError = ref(null)

    // 재연결 관련 상태
    this._lastRoomNr = null
    this._isIntentionalDisconnect = false
    this._reconnectTimer = null
    this._reconnectFailed = false

    // 콜백
    this._onReconnectedCallbacks = []
    this._onRoomRejoinFailedCallbacks = []

    // 설정
    this.serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

    // 재연결 설정 (Socket.IO Best Practice)
    this.reconnectionConfig = {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    }

    // 네트워크 이벤트 리스너 등록
    this._boundHandleOnline = () => this._handleOnline()
    this._boundHandleOffline = () => this._handleOffline()
    this._setupNetworkListeners()
  }

  /**
   * 브라우저 네트워크 상태 이벤트 리스너를 등록합니다
   */
  _setupNetworkListeners() {
    window.addEventListener('online', this._boundHandleOnline)
    window.addEventListener('offline', this._boundHandleOffline)
  }

  /**
   * 브라우저가 온라인 상태로 전환되었을 때 호출됩니다
   */
  _handleOnline() {
    console.log('[SocketService] 네트워크 온라인 감지')
    this.isOnline.value = true
    if (!this.socket?.connected && this._lastRoomNr) {
      this._attemptReconnect()
    }
  }

  /**
   * 브라우저가 오프라인 상태로 전환되었을 때 호출됩니다
   */
  _handleOffline() {
    console.log('[SocketService] 네트워크 오프라인 감지')
    this.isOnline.value = false
  }

  /**
   * 재연결 폴링 타이머를 시작합니다 (30초 간격)
   * 일부 브라우저에서 online 이벤트가 신뢰되지 않을 수 있어 백업으로 사용
   */
  _startReconnectPolling() {
    this._stopReconnectPolling()
    console.log('[SocketService] 재연결 폴링 시작 (30초 간격)')
    this._reconnectTimer = setInterval(() => {
      if (navigator.onLine && !this.socket?.connected && this._lastRoomNr) {
        console.log('[SocketService] 폴링에서 온라인 감지, 재연결 시도')
        this._attemptReconnect()
      }
    }, 30000)
  }

  /**
   * 재연결 폴링 타이머를 중지합니다
   */
  _stopReconnectPolling() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  /**
   * 이전 룸에 재입장을 시도합니다 (자동 재연결 후 recovery 없이 호출)
   */
  async _rejoinPreviousRoom(roomNr) {
    try {
      await this.joinRoom(parseInt(roomNr))
      console.log('[SocketService] 이전 룸 재입장 성공:', roomNr)
      this._lastRoomNr = null
      this._reconnectFailed = false
      this._stopReconnectPolling()
      this._emitReconnected(roomNr)
    } catch (err) {
      console.warn('[SocketService] 이전 룸 재입장 실패, 새 룸 유지:', this.currentRoomNr.value)
      this._lastRoomNr = null
      this._reconnectFailed = false
      this._stopReconnectPolling()
      this._emitRoomRejoinFailed(roomNr, this.currentRoomNr.value)
    }
  }

  /**
   * 기존 소켓을 정리하고 새로 연결한 뒤 이전 룸에 재입장을 시도합니다
   */
  async _attemptReconnect() {
    if (!this._lastRoomNr) return

    const roomToRejoin = this._lastRoomNr
    // connect() 내부의 connect 핸들러가 이중으로 joinRoom하지 않도록 미리 제거
    this._lastRoomNr = null
    console.log('[SocketService] 재연결 시도, 목표 룸:', roomToRejoin)

    // 기존 소켓 정리
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    try {
      // 새 소켓 연결
      await this.connect()

      // 이전 룸에 재입장 시도
      try {
        await this.joinRoom(parseInt(roomToRejoin))
        console.log('[SocketService] 룸 재입장 성공:', roomToRejoin)
        this._reconnectFailed = false
        this._stopReconnectPolling()
        this._emitReconnected(roomToRejoin)
      } catch (joinError) {
        console.warn('[SocketService] 이전 룸 재입장 실패, 새 룸으로 진입:', this.currentRoomNr.value)
        this._reconnectFailed = false
        this._stopReconnectPolling()
        this._emitRoomRejoinFailed(roomToRejoin, this.currentRoomNr.value)
      }
    } catch (connectError) {
      console.error('[SocketService] 재연결 실패:', connectError.message)
      // 연결 실패 시 _lastRoomNr 복원하여 다음 시도에서 재사용
      this._lastRoomNr = roomToRejoin
    }
  }

  /**
   * 재연결 성공 콜백을 등록합니다
   * @param {Function} callback - (rejoinedRoomNr) => void
   */
  onReconnected(callback) {
    this._onReconnectedCallbacks.push(callback)
  }

  /**
   * 룸 재입장 실패 콜백을 등록합니다
   * @param {Function} callback - (oldRoomNr, newRoomNr) => void
   */
  onRoomRejoinFailed(callback) {
    this._onRoomRejoinFailedCallbacks.push(callback)
  }

  _emitReconnected(roomNr) {
    for (const cb of this._onReconnectedCallbacks) {
      try { cb(roomNr) } catch (e) { console.error('[SocketService] onReconnected 콜백 에러:', e) }
    }
  }

  _emitRoomRejoinFailed(oldRoomNr, newRoomNr) {
    for (const cb of this._onRoomRejoinFailedCallbacks) {
      try { cb(oldRoomNr, newRoomNr) } catch (e) { console.error('[SocketService] onRoomRejoinFailed 콜백 에러:', e) }
    }
  }

  /**
   * 서버에 연결하고 자동으로 룸을 생성합니다
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
        transports: ['websocket', 'polling'],
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

        // Socket.IO 자동 재연결 성공 시 처리
        if (this._lastRoomNr) {
          if (this.socket.recovered) {
            // 경우 A: connectionStateRecovery 성공 — 서버가 이전 룸 복원 완료
            console.log('[SocketService] 연결 복구 완료 (recovery), 룸:', this._lastRoomNr)
            const recoveredRoom = this._lastRoomNr
            this._lastRoomNr = null
            this._reconnectFailed = false
            this._stopReconnectPolling()
            this._emitReconnected(recoveredRoom)
          } else {
            // 경우 B: recovery 없이 자동 재연결 — registered 후 이전 룸 재입장 필요
            console.log('[SocketService] 자동 재연결 성공 (recovery 없음), 이전 룸 재입장 시도')
            const roomToRejoin = this._lastRoomNr
            this.socket.once('registered', () => {
              this._rejoinPreviousRoom(roomToRejoin)
            })
          }
        }
      })

      // 연결 해제 이벤트
      this.socket.on('disconnect', (reason) => {
        console.log('[SocketService] 연결 해제됨, 이유:', reason)
        this.isConnected.value = false

        // 의도적 disconnect가 아닌 경우 현재 룸 번호를 보존
        if (!this._isIntentionalDisconnect && this.currentRoomNr.value) {
          this._lastRoomNr = this.currentRoomNr.value.toString()
          console.log('[SocketService] 네트워크 끊김 — 룸 번호 보존:', this._lastRoomNr)
        }

        if (reason === 'io server disconnect') {
          console.warn('[SocketService] 서버에서 연결을 종료했습니다')
        }
      })

      // 연결 에러 이벤트
      this.socket.on('connect_error', (error) => {
        console.error('[SocketService] 연결 오류:', error.message)
        this.isConnected.value = false
        this.connectionError.value = error.message

        clearTimeout(connectionTimeout)
        reject(error)
      })

      // 재연결 시도 이벤트
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`[SocketService] 재연결 시도 ${attemptNumber}/${this.reconnectionConfig.reconnectionAttempts}`)
      })

      // 재연결 실패 이벤트 — 내장 재연결이 모두 실패한 후 네트워크 복구 대기
      this.socket.on('reconnect_failed', () => {
        console.error('[SocketService] 재연결 실패: 최대 시도 횟수 초과')
        this.connectionError.value = '서버 연결 실패'
        this._reconnectFailed = true

        // online 이벤트 대기 + 폴링 시작
        if (this._lastRoomNr) {
          console.log('[SocketService] 네트워크 복구 대기 시작')
          this._startReconnectPolling()
        }
      })

      // 자동 룸 생성 이벤트 리스너 등록
      this.socket.on('registered', handleRegistered)
    })
  }

  /**
   * 기존 룸에 입장합니다
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

      const handleSubscribed = (roomNumber, userCount) => {
        console.log('[SocketService] 룸 입장 완료:', roomNumber, '사용자:', userCount)
        clearTimeout(joinTimeout)

        this.currentRoomNr.value = roomNumber
        this.usersInRoom.value = userCount

        this.socket.off('subscribed', handleSubscribed)
        this.socket.off('room-not-found', handleRoomNotFound)

        resolve({ roomNr: roomNumber, users: userCount })
      }

      const handleRoomNotFound = () => {
        console.error('[SocketService] 룸이 존재하지 않습니다:', roomNr)
        clearTimeout(joinTimeout)

        this.socket.off('subscribed', handleSubscribed)
        this.socket.off('room-not-found', handleRoomNotFound)

        reject(new Error('Room does not exist'))
      }

      this.socket.once('subscribed', handleSubscribed)
      this.socket.once('room-not-found', handleRoomNotFound)

      this.socket.emit('join', roomNr)
    })
  }

  /**
   * 메시지를 서버로 전송합니다
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
   * 의도적으로 소켓 연결을 해제합니다
   * 재연결 대상에서 제외됩니다 (_lastRoomNr을 보존하지 않음)
   */
  disconnect() {
    this._isIntentionalDisconnect = true
    this._stopReconnectPolling()

    if (this.socket) {
      console.log('[SocketService] 소켓 연결 해제 중 (의도적)')

      this.socket.disconnect()
      this.socket = null

      this.isConnected.value = false
      this.currentRoomNr.value = null
      this.usersInRoom.value = 0
      this.connectionError.value = null
      this._lastRoomNr = null

      console.log('[SocketService] 소켓 연결 해제 완료')
    }

    this._isIntentionalDisconnect = false
  }

  /**
   * 모든 리소스를 정리합니다 (네트워크 리스너, 타이머, 콜백)
   */
  destroy() {
    this._stopReconnectPolling()
    window.removeEventListener('online', this._boundHandleOnline)
    window.removeEventListener('offline', this._boundHandleOffline)
    this._onReconnectedCallbacks = []
    this._onRoomRejoinFailedCallbacks = []
    this.disconnect()
  }
}

// 싱글톤 인스턴스 생성 및 export
export const socketService = new SocketService()
