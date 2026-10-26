import { t } from '../i18n/translate.js'
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { setRoomTokens, setRoomTokenRefresher, clearRoomTokens } from './roomTokenStore'
import { collectClientHints, loadIdentity, saveIdentity, isValidIdentity } from '../utils/identity.js'

/** 이름표 다시 뽑기 쿨다운 (서버와 같은 3초) */
export const REROLL_COOLDOWN_MS = 3000

/** pair/private ack 대기 시간 */
const PAIR_ACK_TIMEOUT_MS = 5000

/** 1:1 연결 서버 이벤트 */
const PAIR_EVENTS = ['pair:incoming', 'pair:accepted', 'pair:signal', 'pair:ended', 'pair:done']

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
    /** 1:1 비공개 방별 접속 기기 { [roomId]: DeviceInfo[] } */
    this.privateRoomDevices = ref({})
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

    // 1:1 연결 이벤트 리스너 (소켓이 다시 만들어져도 유지)
    this._pairListeners = new Map()

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

      this._attachPairListeners()

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
        } else if (typeof roomId === 'string' && roomId.startsWith('prv-') && Array.isArray(devices)) {
          this.privateRoomDevices.value = { ...this.privateRoomDevices.value, [roomId]: devices }
        }
      })
    })
  }

  /** 등록해 둔 pair 리스너와 pair:done 토큰 병합을 현재 소켓에 붙인다 */
  _attachPairListeners() {
    if (!this.socket) return
    this.socket.on('pair:done', (payload) => this._mergePairToken(payload))
    for (const [event, set] of this._pairListeners) {
      for (const fn of set) this.socket.on(event, fn)
    }
  }

  /** pair:done의 룸 토큰을 기존 ip/global 토큰을 지우지 않고 합친다 */
  _mergePairToken(payload) {
    if (!payload?.roomId || !payload.roomToken) return
    setRoomTokens({ roomTokens: { [payload.roomId]: payload.roomToken }, roomTokenTtlSec: payload.roomTokenTtlSec })
  }

  /**
   * pair 이벤트 리스너 등록 (pair:incoming|accepted|signal|ended|done). 소켓 연결 전에도 등록할 수 있다.
   * @returns {() => void} 해제 함수
   */
  onPair(event, callback) {
    if (!PAIR_EVENTS.includes(event)) throw new Error('unknown pair event: ' + event)
    if (!this._pairListeners.has(event)) this._pairListeners.set(event, new Set())
    this._pairListeners.get(event).add(callback)
    this.socket?.on(event, callback)
    return () => this.offPair(event, callback)
  }

  offPair(event, callback) {
    this._pairListeners.get(event)?.delete(callback)
    this.socket?.off(event, callback)
  }

  /**
   * ack가 있는 이벤트를 보낸다. 5초 안에 응답이 없거나 연결이 없으면 {ok:false, code:'TIMEOUT'}.
   * @returns {Promise<object>}
   */
  emitWithAck(event, payload) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, code: 'TIMEOUT' })
        return
      }
      const timer = setTimeout(() => resolve({ ok: false, code: 'TIMEOUT' }), PAIR_ACK_TIMEOUT_MS)
      this.socket.emit(event, payload, (res) => {
        clearTimeout(timer)
        resolve(res && typeof res === 'object' ? res : { ok: false, code: 'BAD_ACK' })
      })
    })
  }

  /** pair:invite|respond|signal|confirm|cancel 전송 (pairing.js의 socket 어댑터 emit) */
  pairEmit(event, payload) {
    return this.emitWithAck(event, payload)
  }

  /** 1:1 연결 끊기 */
  leavePrivate(roomId) {
    return this.emitWithAck('private:leave', { roomId })
  }

  /**
   * 저장된 입장권으로 1:1 방에 다시 들어간다 (최대 10개씩). 등록(registered)/재연결 뒤에 부른다.
   * 성공하면 방 토큰을 합치고 방별 접속 기기를 반영한다.
   * @param {string[]} tickets
   * @returns {Promise<{ok: boolean, rooms?: Array, invalid?: string[], code?: string}>}
   */
  async joinPrivate(tickets) {
    const list = (Array.isArray(tickets) ? tickets : []).filter((x) => typeof x === 'string' && x)
    if (list.length === 0) return { ok: true, rooms: [], invalid: [] }
    const rooms = []
    const invalid = []
    for (let i = 0; i < list.length; i += 10) {
      const res = await this.emitWithAck('private:join', { tickets: list.slice(i, i + 10) })
      if (!res?.ok) return rooms.length || invalid.length ? { ok: true, rooms, invalid } : { ok: false, code: res?.code || 'FAILED' }
      for (const r of Array.isArray(res.rooms) ? res.rooms : []) {
        if (!r || typeof r.roomId !== 'string') continue
        rooms.push(r)
        this._mergePairToken(r)
        if (Array.isArray(r.devices)) {
          this.privateRoomDevices.value = { ...this.privateRoomDevices.value, [r.roomId]: r.devices }
        }
      }
      for (const t of Array.isArray(res.invalid) ? res.invalid : []) invalid.push(t)
    }
    return { ok: true, rooms, invalid }
  }

  /** pairing.js에 주입할 소켓 어댑터 */
  getPairAdapter() {
    return {
      emit: (event, payload) => this.pairEmit(event, payload),
      on: (event, fn) => this.onPair(event, fn),
      off: (event, fn) => this.offPair(event, fn)
    }
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
   * @param {'global'|'ip'|string} target - 공유 대상 룸 ('prv-' 로 시작하는 비공개 roomId 허용)
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
   * 메시지를 보내고 서버 응답(ack)을 기다린다. 텍스트 보관 결과(만료 시각, 보관 안 한 이유,
   * 밀려난 내 보관분)와 속도 제한(code: RATE_LIMITED)을 알 수 있다.
   * 5초 안에 응답이 없으면 {success: true, timeout: true} (보낸 것으로 본다).
   * @returns {Promise<{success: boolean, code?: string, expiresAt?: number, evicted?: string[], notStored?: string, timeout?: boolean}>}
   */
  publishWithAck(message, target) {
    if (!this.socket?.connected) {
      console.error('[SocketService] 소켓이 연결되지 않았습니다')
      return Promise.reject(new Error('Socket not connected'))
    }
    return new Promise((resolve) => {
      this.socket.timeout(PAIR_ACK_TIMEOUT_MS).emit('publish', message, target, (timeoutErr, error, response) => {
        if (timeoutErr) return resolve({ success: true, timeout: true })
        if (error) return resolve({ success: false, code: 'PUBLISH_ERROR' })
        resolve(response && typeof response === 'object' ? response : { success: true })
      })
    })
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
      this.privateRoomDevices.value = {}
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
