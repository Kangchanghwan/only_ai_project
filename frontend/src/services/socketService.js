import { t } from '../i18n/translate.js'
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { setRoomTokens, setRoomTokenRefresher, clearRoomTokens } from './roomTokenStore'
import { collectClientHints, loadIdentity, saveIdentity, isValidIdentity } from '../utils/identity.js'

/** 이름표 다시 뽑기 쿨다운 (서버와 같은 3초) */
export const REROLL_COOLDOWN_MS = 3000

/** 룸 토큰 재발급 ack 대기 시간 */
const ROOM_TOKEN_REQUEST_TIMEOUT_MS = 5000

/**
 * Socket.IO 서비스
 *
 * Socket.IO 클라이언트 연결 및 이벤트 관리를 담당하는 싱글톤 서비스입니다.
 * 전체 공유 룸(room-shared)과 IP 격리 룸에 동시 자동 입장합니다.
 */
class SocketService {
  constructor() {
    // 소켓 인스턴스
    this.socket = null

    // 반응형 상태
    this.isConnected = ref(false)
    this.isOnline = ref(navigator.onLine)
    this.usersInRoom = ref(0)
    this.ipRoomDevices = ref([])
    this.globalRoomDevices = ref([])
    this.connectionError = ref(null)

    // 내 기기 정체성(서버가 할당) / 내 소켓 ID / 다시 뽑기 가능 시각
    this.myIdentity = ref(null)
    this.mySocketId = ref(null)
    this.rerollAvailableAt = ref(0)

    // 룸 ID 상태 (전체 공유 / IP 격리)
    this.globalRoomId = ref(null)
    this.ipRoomId = ref(null)

    // 재연결 관련 상태
    this._isIntentionalDisconnect = false
    this._wasConnected = false
    this._reconnectTimer = null

    // 콜백
    this._onReconnectedCallbacks = []

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

    // REST API 룸 토큰이 만료 임박하면 소켓으로 재발급받는다
    setRoomTokenRefresher(() => this.requestRoomTokens())
  }

  _setupNetworkListeners() {
    window.addEventListener('online', this._boundHandleOnline)
    window.addEventListener('offline', this._boundHandleOffline)
  }

  _handleOnline() {
    console.log('[SocketService] 네트워크 온라인 감지')
    this.isOnline.value = true
    if (!this.socket?.connected && this._wasConnected) {
      this._attemptReconnect()
    }
  }

  _handleOffline() {
    console.log('[SocketService] 네트워크 오프라인 감지')
    this.isOnline.value = false
  }

  _startReconnectPolling() {
    this._stopReconnectPolling()
    console.log('[SocketService] 재연결 폴링 시작 (30초 간격)')
    this._reconnectTimer = setInterval(() => {
      if (navigator.onLine && !this.socket?.connected && this._wasConnected) {
        console.log('[SocketService] 폴링에서 온라인 감지, 재연결 시도')
        this._attemptReconnect()
      }
    }, 30000)
  }

  _stopReconnectPolling() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  /**
   * 기존 소켓을 정리하고 새로 연결합니다 (항상 같은 룸이므로 단순화)
   */
  async _attemptReconnect() {
    if (!this._wasConnected) return

    console.log('[SocketService] 재연결 시도')

    // 기존 소켓 정리
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    try {
      await this.connect()
      console.log('[SocketService] 재연결 성공')
      this._stopReconnectPolling()
      this._emitReconnected()
    } catch (connectError) {
      console.error('[SocketService] 재연결 실패:', connectError.message)
    }
  }

  /**
   * 재연결 성공 콜백을 등록합니다
   * @param {Function} callback - () => void
   */
  onReconnected(callback) {
    this._onReconnectedCallbacks.push(callback)
  }

  _emitReconnected() {
    for (const cb of this._onReconnectedCallbacks) {
      try { cb() } catch (e) { console.error('[SocketService] onReconnected 콜백 에러:', e) }
    }
  }

  /**
   * 서버에 연결하고 자동으로 공유 룸에 입장합니다
   *
   * @returns {Promise<{globalRoomId: string, ipRoomId: string, users: number}>} 룸 정보
   */
  connect() {
    // 이미 연결되어 있는 경우
    if (this.socket?.connected) {
      console.warn('[SocketService] 이미 소켓에 연결되어 있습니다')
      return Promise.resolve({
        globalRoomId: this.globalRoomId.value,
        ipRoomId: this.ipRoomId.value,
        users: this.usersInRoom.value
      })
    }

    console.log('[SocketService] 서버 연결 시작:', this.serverUrl)

    return new Promise((resolve, reject) => {
      // Socket.IO 클라이언트 초기화
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        // 접속(재접속)마다 저장된 정체성과 기기 힌트를 보낸다. 구버전 백엔드는 auth를 무시한다.
        auth: (cb) => {
          collectClientHints()
            .catch(() => ({}))
            .then((hints) => cb({ identity: loadIdentity(), hints }))
        },
        ...this.reconnectionConfig
      })

      // 연결 타임아웃 설정
      const connectionTimeout = setTimeout(() => {
        this.socket?.off('registered', handleRegistered)
        this.connectionError.value = 'Connection timeout'
        reject(new Error(t('errors.connectTimeout')))
      }, this.reconnectionConfig.timeout)

      /**
       * 'registered' 이벤트 핸들러
       * 서버가 공유 룸에 클라이언트를 등록했을 때 발생
       */
      const handleRegistered = (payload) => {
        console.log('[SocketService] 룸 입장 완료:', payload)
        clearTimeout(connectionTimeout)

        this.globalRoomId.value = payload.globalRoomId
        this.ipRoomId.value = payload.ipRoomId
        this._applyIdentity(payload.identity)
        // REST API용 룸 토큰 (구버전 백엔드는 토큰이 없어 무시된다)
        setRoomTokens(payload)

        this.usersInRoom.value = 1
        this.connectionError.value = null
        this._wasConnected = true

        this.socket.off('registered', handleRegistered)
        resolve({ globalRoomId: payload.globalRoomId, ipRoomId: payload.ipRoomId, users: 1 })
      }

      // 연결 성공 이벤트
      this.socket.on('connect', () => {
        console.log('[SocketService] 연결 성공, Socket ID:', this.socket.id)
        this.mySocketId.value = this.socket.id
        this.isConnected.value = true
        this.connectionError.value = null

        // Socket.IO 자동 재연결 성공 시 처리
        if (this._wasConnected) {
          if (this.socket.recovered) {
            console.log('[SocketService] 연결 복구 완료 (recovery)')
            this._stopReconnectPolling()
            this._emitReconnected()
          } else {
            console.log('[SocketService] 자동 재연결 성공 (recovery 없음)')
            this.socket.once('registered', (payload) => {
              // 복구 없이 새로 등록되면 서버가 토큰을 새로 준다
              setRoomTokens(payload)
              this._applyIdentity(payload.identity)
              this._stopReconnectPolling()
              this._emitReconnected()
            })
          }
        }
      })

      // 연결 해제 이벤트
      this.socket.on('disconnect', (reason) => {
        console.log('[SocketService] 연결 해제됨, 이유:', reason)
        this.isConnected.value = false

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

      // 재연결 실패 이벤트
      this.socket.on('reconnect_failed', () => {
        console.error('[SocketService] 재연결 실패: 최대 시도 횟수 초과')
        this.connectionError.value = t('errors.serverConnectFailed')

        if (this._wasConnected) {
          console.log('[SocketService] 네트워크 복구 대기 시작')
          this._startReconnectPolling()
        }
      })

      // 자동 룸 입장 이벤트 리스너 등록
      this.socket.on('registered', handleRegistered)

      // 다시 뽑기 결과 등 서버가 정체성을 (재)할당했을 때
      this.socket.on('identity', (payload) => this._applyIdentity(payload?.identity))

      // 룸(ip/global)의 접속 기기 목록 갱신 — payload.roomId로 어느 룸인지 분기한다
      this.socket.on('room-users', ({ roomId, devices }) => {
        if (roomId === this.ipRoomId.value) {
          this.ipRoomDevices.value = devices
        } else if (roomId === this.globalRoomId.value) {
          this.globalRoomDevices.value = devices
        }
      })
    })
  }

  /** 서버가 할당한 정체성을 상태에 반영하고 30일간 저장한다 (구버전 백엔드는 identity가 없다) */
  _applyIdentity(identity) {
    if (!isValidIdentity(identity)) return
    this.myIdentity.value = identity
    saveIdentity(identity)
  }

  /** 서버가 중계 메시지에 붙이는 sender와 같은 모양의 내 정보 (내가 보낸 항목 표시용) */
  getSelfSender() {
    const me = [...this.ipRoomDevices.value, ...this.globalRoomDevices.value].find(
      (d) => d.socketId === this.mySocketId.value
    )
    if (!me?.identity) return undefined
    const { socketId, identity, deviceLabel, browser, model } = me
    return { socketId, identity, deviceLabel, browser, ...(model ? { model } : {}) }
  }

  /**
   * 이름표(동물+형용사)를 다시 뽑는다. 서버 쿨다운(3초)을 로컬에서도 미리 적용한다.
   * @returns {Promise<{ok:boolean, identity?:object, error?:string}>}
   */
  rerollIdentity() {
    return new Promise((resolve) => {
      if (!this.socket?.connected || Date.now() < this.rerollAvailableAt.value) {
        resolve({ ok: false, error: 'cooldown' })
        return
      }
      this.rerollAvailableAt.value = Date.now() + REROLL_COOLDOWN_MS
      const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 5000)
      this.socket.emit('identity:reroll', (res) => {
        clearTimeout(timer)
        if (res?.ok) this._applyIdentity(res.identity)
        resolve(res || { ok: false, error: 'unsupported' })
      })
    })
  }

  /**
   * 메시지를 서버로 전송합니다.
   * @param {Object} message - 전송할 메시지
   * @param {'global'|'ip'} target - 공유 대상 룸
   */
  publishMessage(message, target) {
    if (!this.socket?.connected) {
      console.error('[SocketService] 소켓이 연결되지 않았습니다')
      throw new Error('Socket not connected')
    }
    console.log('[SocketService] 메시지 전송:', message, 'target:', target)
    this.socket.emit('publish', message, target)
  }

  /**
   * 소켓으로 룸 토큰 재발급을 요청합니다.
   * @returns {Promise<{roomTokens: Record<string,string>, roomTokenTtlSec: number}>}
   */
  requestRoomTokens() {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'))
        return
      }
      const timer = setTimeout(() => reject(new Error(t('errors.tokenTimeout'))), ROOM_TOKEN_REQUEST_TIMEOUT_MS)
      this.socket.emit('room-tokens', (payload) => {
        clearTimeout(timer)
        resolve(payload)
      })
    })
  }

  on(event, callback) {
    if (!this.socket) {
      console.error('[SocketService] 소켓이 초기화되지 않았습니다')
      return
    }
    this.socket.on(event, callback)
  }

  off(event, callback) {
    if (!this.socket) {
      console.error('[SocketService] 소켓이 초기화되지 않았습니다')
      return
    }
    this.socket.off(event, callback)
  }

  disconnect() {
    this._isIntentionalDisconnect = true
    this._stopReconnectPolling()

    if (this.socket) {
      console.log('[SocketService] 소켓 연결 해제 중 (의도적)')

      this.socket.disconnect()
      this.socket = null

      this.isConnected.value = false
      this.usersInRoom.value = 0
      this.ipRoomDevices.value = []
      this.globalRoomDevices.value = []
      this.mySocketId.value = null
      this.connectionError.value = null
      this.globalRoomId.value = null
      this.ipRoomId.value = null
      this._wasConnected = false
      clearRoomTokens()

      console.log('[SocketService] 소켓 연결 해제 완료')
    }

    this._isIntentionalDisconnect = false
  }

  destroy() {
    this._stopReconnectPolling()
    window.removeEventListener('online', this._boundHandleOnline)
    window.removeEventListener('offline', this._boundHandleOffline)
    this._onReconnectedCallbacks = []
    this.disconnect()
  }
}

// 싱글톤 인스턴스 생성 및 export
export const socketService = new SocketService()
