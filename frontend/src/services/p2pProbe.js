/**
 * P2P 연결 사전 점검(probe)
 *
 * 같은 공인 IP 룸의 기기끼리 WebRTC 직접 연결이 되는지 측정해 GA4로만 보낸다.
 * - 사용자 화면 변화 없음, 파일 전송 없음(1MB 더미 데이터만 DataChannel로), 실패해도 앱에 영향 없음
 * - 새로 룸에 들어온 기기가 initiator, 기존 기기는 offer가 오면 응답만 한다
 * - 시그널링은 소켓 이벤트 `p2p:signal` (백엔드가 같은 IP 룸에만 중계)
 * - 킬스위치: VITE_P2P_PROBE_ENABLED === 'false' 이면 완전 비활성
 * - 모든 예외는 삼키고 console.warn만 남긴다
 */
import { watch } from 'vue'
import { trackEvent } from '../utils/analytics'
import { mbpsBucket } from '../utils/mbpsBucket'

export const ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]
export const CONNECT_TIMEOUT_MS = 8000
export const PROBE_VERSION = 2
export const MIN_TRANSFER_TIMEOUT_MS = 8000
export const MAX_TRANSFER_TIMEOUT_MS = 30000
export const MIN_ASSUMED_MBPS = 1.5
/** 크기에 비례한 전송 타임아웃: max(8초, bytes / 1.5Mbit/s), 상한 30초 */
export function transferTimeoutFor(bytes) {
  const ms = (bytes * 8) / (MIN_ASSUMED_MBPS * 1e6) * 1000
  return Math.min(MAX_TRANSFER_TIMEOUT_MS, Math.max(MIN_TRANSFER_TIMEOUT_MS, Math.round(ms)))
}
export const RESPONDER_TIMEOUT_MS = 15000
export const CHUNK_BYTES = 16 * 1024
export const PROBE_BYTES_LAN = 8 * 1024 * 1024
export const PROBE_BYTES_NAT = 2 * 1024 * 1024
/** 결과별 측정 크기 */
export function probeBytesFor(result) {
  return result === 'direct_lan' ? PROBE_BYTES_LAN : PROBE_BYTES_NAT
}
/** 청크 i: 첫 4바이트에 i(Uint32 LE), 나머지는 (i*31+j)&0xff */
export function fillChunk(buf, i) {
  const u8 = new Uint8Array(buf)
  for (let j = 4; j < u8.length; j++) u8[j] = (i * 31 + j) & 0xff
  new DataView(buf).setUint32(0, i, true)
  return buf
}
export function readChunkIndex(data) {
  try {
    if (!data || data.byteLength < 4) return -1
    return new DataView(data).getUint32(0, true)
  } catch { return -1 }
}
export const SESSION_FLAG = 'p2p_probe_done'
const BUFFER_HIGH = 256 * 1024
const BUFFER_LOW = 64 * 1024

/** 킬스위치: 'false' 문자열일 때만 끈다 (기본 on) */
export function isProbeEnabled(envValue = import.meta.env?.VITE_P2P_PROBE_ENABLED) {
  return envValue !== 'false'
}

/** 선택된 candidate pair의 타입 → 결과 판정 */
export function classifyCandidateTypes(localType, remoteType) {
  const valid = ['host', 'srflx', 'prflx', 'relay']
  if (!valid.includes(localType) || !valid.includes(remoteType)) return 'failed'
  if (localType === 'relay' || remoteType === 'relay') return 'failed' // TURN을 쓰지 않으므로 나오면 이상 상태
  if (localType === 'srflx' || remoteType === 'srflx') return 'direct_nat'
  return 'direct_lan' // host/prflx 조합
}

export function isMobileUa(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /iPhone|iPad|iPod|Android|Mobi/i.test(ua || '')
}

/** getStats() 결과에서 선택된 candidate pair의 local/remote candidateType 추출 */
export async function readSelectedPairTypes(pc) {
  const report = await pc.getStats()
  const all = []
  report.forEach((v) => all.push(v))
  const byId = new Map(all.map((v) => [v.id, v]))
  let pair = null
  const transport = all.find((v) => v.type === 'transport' && v.selectedCandidatePairId)
  if (transport) pair = byId.get(transport.selectedCandidatePairId)
  if (!pair) {
    pair = all.find((v) => v.type === 'candidate-pair' && v.state === 'succeeded' && (v.selected || v.nominated))
  }
  if (!pair) return { localType: null, remoteType: null }
  return {
    localType: byId.get(pair.localCandidateId)?.candidateType ?? null,
    remoteType: byId.get(pair.remoteCandidateId)?.candidateType ?? null,
  }
}

function getSessionStorage() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null }
}

/**
 * @param {object} deps 테스트용 주입 (모두 선택)
 */
export function createP2pProbe(deps = {}) {
  const {
    env = import.meta.env?.VITE_P2P_PROBE_ENABLED,
    track = trackEvent,
    getRtc = () => (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null),
    storage = getSessionStorage(),
    doc = typeof document !== 'undefined' ? document : null,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    transferTimeoutMs,
  } = deps

  const enabled = isProbeEnabled(env)
  let memoryFlag = false
  let evaluated = false // 첫 room-users 관찰로 initiator 여부를 이미 판정했는지
  let eligible = false
  let pendingVisible = false
  let svc = null
  let attachedSocket = null
  let stopWatch = null
  const responders = new Map() // peerId -> { close }
  let activeInitiator = null

  const warn = (...a) => { try { console.warn('[p2pProbe]', ...a) } catch { /* noop */ } }

  const alreadyDone = () => {
    if (memoryFlag) return true
    try { return storage?.getItem(SESSION_FLAG) === '1' } catch { return false }
  }
  const markDone = () => {
    memoryFlag = true
    try { storage?.setItem(SESSION_FLAG, '1') } catch { /* noop */ }
  }

  const send = (to, data) => {
    try { svc?.socket?.emit('p2p:signal', { to, data }) } catch (e) { warn('signal send', e) }
  }

  /** ICE 후보를 remote description 설정 전에는 쌓아두었다가 적용 */
  function makeIceQueue(pc) {
    let ready = false
    const queue = []
    return {
      async add(cand) {
        if (!cand) return
        if (!ready) { queue.push(cand); return }
        try { await pc.addIceCandidate(cand) } catch (e) { warn('addIceCandidate', e) }
      },
      async flush() {
        ready = true
        while (queue.length) {
          try { await pc.addIceCandidate(queue.shift()) } catch (e) { warn('addIceCandidate', e) }
        }
      },
    }
  }

  const safeClose = (pc, dc) => {
    try { dc?.close() } catch { /* noop */ }
    try { pc?.close() } catch { /* noop */ }
  }

  // ---------- initiator ----------
  async function runInitiator(peerId, peerCount) {
    markDone()
    const report = (params) => {
      try {
        const clean = {}
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) clean[k] = v
        track('p2p_probe', clean)
      } catch (e) { warn('track', e) }
    }
    const base = {
      peer_count: peerCount,
      effective_type: (typeof navigator !== 'undefined' && navigator.connection?.effectiveType) || undefined,
      is_mobile: isMobileUa(),
    }
    const Rtc = getRtc()
    if (!Rtc) {
      report({ ...base, result: 'unsupported' })
      return
    }

    let pc = null
    let dc = null
    let reported = false
    let gotAnswer = false
    const timers = []
    const t0 = now()
    let finish
    const done = new Promise((res) => { finish = res })

    const complete = (extra) => {
      if (reported) return
      reported = true
      timers.forEach(clearTimeout)
      report({ ...base, got_answer: gotAnswer, ...extra })
      safeClose(pc, dc)
      activeInitiator = null
      finish()
    }
    activeInitiator = { close: () => complete({ result: 'failed' }) }

    const onSignal = async ({ from, data }) => {
      if (from !== peerId || !data || reported) return
      try {
        if (data.t === 'answer') {
          gotAnswer = true
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
          await ice.flush()
        } else if (data.t === 'ice') {
          await ice.add(data.c)
        }
      } catch (e) { warn('signal handling', e) }
    }

    let ice
    try {
      pc = new Rtc({ iceServers: ICE_SERVERS })
      ice = makeIceQueue(pc)
      svc.socket.on('p2p:signal', onSignal)
      const offSignal = () => { try { svc.socket?.off('p2p:signal', onSignal) } catch { /* noop */ } }

      dc = pc.createDataChannel('probe', { ordered: true })
      dc.binaryType = 'arraybuffer'
      dc.bufferedAmountLowThreshold = BUFFER_LOW

      pc.onicecandidate = (e) => {
        if (e.candidate) send(peerId, { t: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate })
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && !connected) complete({ result: 'failed' })
      }

      let connected = false
      let ackResolve
      const acked = new Promise((res) => { ackResolve = res })
      dc.onmessage = (e) => { if (typeof e.data === 'string' && (e.data === 'ack' || e.data.startsWith('ack:'))) ackResolve(e.data) }
      let transferState = null // 전송 중 close 감지용
      dc.onclose = () => { if (transferState === 'sending') transferState = 'closed'; ackResolve('closed') }
      const prevStateChange = pc.onconnectionstatechange
      pc.onconnectionstatechange = () => {
        prevStateChange?.()
        if (transferState === 'sending' && ['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          transferState = 'closed'; ackResolve('closed')
        }
      }

      dc.onopen = async () => {
        if (reported) return
        connected = true
        timers.forEach(clearTimeout)
        timers.length = 0
        const connectMs = Math.round(now() - t0)
        let result = 'failed'
        let localType = null
        let remoteType = null
        try {
          ;({ localType, remoteType } = await readSelectedPairTypes(pc))
          result = classifyCandidateTypes(localType, remoteType)
        } catch (err) { warn('getStats', err) }

        const extra = { result, connect_ms: connectMs, local_type: localType ?? 'none', remote_type: remoteType ?? 'none' }
        if (result === 'failed') { complete(extra); return }

        // 처리량 측정: 결정적 패턴 데이터를 보내고 응답측 ack(바이트 수·순서 검증 결과)까지의 시간
        const probeBytes = probeBytesFor(result)
        const chunkCount = Math.ceil(probeBytes / CHUNK_BYTES)
        const sentBytes = chunkCount * CHUNK_BYTES
        const withT = { ...extra, probe_v: PROBE_VERSION, probe_bytes: sentBytes }
        const tmo = transferTimeoutMs ?? transferTimeoutFor(sentBytes)
        timers.push(setTimeout(() => complete({ ...withT, transfer: 'stalled' }), tmo))
        try {
          transferState = 'sending'
          const ts = now()
          dc.send('start')
          for (let i = 0; i < chunkCount; i++) {
            if (reported) return
            if (transferState === 'closed') { complete({ ...withT, transfer: 'closed' }); return }
            if (dc.bufferedAmount > BUFFER_HIGH) {
              await new Promise((res) => {
                const h = () => { dc.removeEventListener?.('bufferedamountlow', h); res() }
                if (dc.addEventListener) dc.addEventListener('bufferedamountlow', h)
                else dc.onbufferedamountlow = h
              })
            }
            dc.send(fillChunk(new ArrayBuffer(CHUNK_BYTES), i))
          }
          dc.send('end')
          const ackMsg = await acked
          const te = now()
          if (ackMsg === 'closed') { complete({ ...withT, transfer: 'closed' }); return }
          let transfer
          if (ackMsg === 'ack') {
            transfer = 'complete_legacy' // 구버전 응답측: 바이트 검증 불가
          } else {
            const [, got, flag] = String(ackMsg).split(':')
            transfer = Number(got) === sentBytes && flag === 'ok' ? 'complete' : 'mismatch'
          }
          if (transfer === 'mismatch') { complete({ ...withT, transfer }); return }
          const sec = Math.max((te - ts) / 1000, 0.001)
          const mbit = (sentBytes * 8) / 1e6 / sec
          const mbps = Math.round(mbit * 10) / 10
          complete({
            ...withT,
            transfer,
            throughput_mbps: mbps,
            ...(transfer === 'complete' ? { mbps_bucket: mbpsBucket(mbps) } : {}),
          })
        } catch (err) {
          warn('transfer', err)
          complete({ ...withT, transfer: 'error' })
        }
      }

      timers.push(setTimeout(() => complete({ result: 'failed' }), connectTimeoutMs))

      // 종료 시 리스너 해제
      done.then(offSignal)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send(peerId, { t: 'offer', sdp: offer.sdp })
    } catch (e) {
      warn('initiator', e)
      complete({ result: 'failed' })
    }
    await done
  }

  // ---------- responder ----------
  async function handleOffer(from, data) {
    const Rtc = getRtc()
    if (!Rtc || responders.has(from) || responders.size >= 2) return
    let pc = null
    let dc = null
    let timer = null
    const close = () => {
      clearTimeout(timer)
      safeClose(pc, dc)
      responders.delete(from)
    }
    try {
      pc = new Rtc({ iceServers: ICE_SERVERS })
      responders.set(from, { close, ice: null })
      const ice = makeIceQueue(pc)
      responders.get(from).ice = ice
      timer = setTimeout(close, RESPONDER_TIMEOUT_MS)
      pc.onicecandidate = (e) => {
        if (e.candidate) send(from, { t: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate })
      }
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) close()
      }
      pc.ondatachannel = (e) => {
        dc = e.channel
        dc.binaryType = 'arraybuffer'
        let recvBytes = 0
        let expectIdx = 0
        let orderOk = true
        dc.onmessage = (m) => {
          // 수신 데이터는 저장하지 않고 바이트 수·순서만 센 뒤 버린다. 끝 신호에 ack:<바이트>:<ok|bad>로 응답
          const d = m.data
          if (typeof d === 'string') {
            if (d === 'start') { recvBytes = 0; expectIdx = 0; orderOk = true }
            else if (d === 'end') {
              try { dc.send(`ack:${recvBytes}:${orderOk ? 'ok' : 'bad'}`) } catch (err) { warn('ack', err) }
              setTimeout(close, 500)
            }
            return
          }
          const len = d?.byteLength ?? 0
          recvBytes += len
          if (readChunkIndex(d) !== expectIdx) orderOk = false
          expectIdx++
        }
        dc.onclose = close
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
      await ice.flush()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send(from, { t: 'answer', sdp: answer.sdp })
    } catch (e) {
      warn('responder', e)
      close()
    }
  }

  const onSignalAny = ({ from, data } = {}) => {
    try {
      if (!enabled || typeof from !== 'string' || !data) return
      if (data.t === 'offer' && typeof data.sdp === 'string') {
        handleOffer(from, data)
      } else if (data.t === 'ice') {
        responders.get(from)?.ice?.add(data.c)
      }
    } catch (e) { warn('onSignal', e) }
  }

  // ---------- 룸 관찰 ----------
  /** room-users(ip 룸) 목록 관찰. 첫 관찰 때 다른 기기가 이미 있으면 내가 새로 들어온 쪽이다. */
  function onDevices(devices) {
    try {
      if (!enabled || !svc || !Array.isArray(devices)) return
      const myId = svc.socket?.id
      if (!myId || !devices.some((d) => d.socketId === myId)) return
      const peers = devices.filter((d) => d.socketId !== myId)
      if (!evaluated) {
        evaluated = true
        eligible = peers.length > 0 && !alreadyDone()
      }
      if (!eligible) return
      if (peers.length === 0) return // 기다리다 상대가 사라졌으면 포기하지 않고 다음 관찰을 기다림
      if (doc && doc.visibilityState === 'hidden') {
        if (!pendingVisible) {
          pendingVisible = true
          const h = () => {
            if (doc.visibilityState !== 'visible') return
            doc.removeEventListener('visibilitychange', h)
            pendingVisible = false
            onDevices(svc?.ipRoomDevices?.value ?? [])
          }
          doc.addEventListener('visibilitychange', h)
        }
        return
      }
      eligible = false
      if (alreadyDone()) return
      const peer = peers[0]
      runInitiator(peer.socketId, peers.length).catch((e) => warn('runInitiator', e))
    } catch (e) { warn('onDevices', e) }
  }

  function attachSocket() {
    try {
      const s = svc?.socket
      if (!s || s === attachedSocket) return
      attachedSocket = s
      s.on('p2p:signal', onSignalAny)
    } catch (e) { warn('attach', e) }
  }

  /** socketService(싱글톤)에 연결. 여러 번 호출해도 한 번만 동작한다. */
  function start(socketService) {
    try {
      if (!enabled || svc) return
      svc = socketService
      attachSocket()
      stopWatch = [
        watch(() => svc.isConnected.value, () => attachSocket()),
        watch(() => svc.ipRoomDevices.value, (d) => { attachSocket(); onDevices(d) }, { deep: false }),
      ]
      onDevices(svc.ipRoomDevices.value)
    } catch (e) { warn('start', e) }
  }

  function stop() {
    try {
      stopWatch?.forEach((s) => s())
      stopWatch = null
      attachedSocket?.off?.('p2p:signal', onSignalAny)
      attachedSocket = null
      responders.forEach((r) => r.close())
      activeInitiator?.close()
      svc = null
    } catch (e) { warn('stop', e) }
  }

  return { start, stop, onDevices, isEnabled: () => enabled }
}

let singleton = null
/** App에서 호출하는 진입점. 어떤 경우에도 예외를 던지지 않는다. */
export function startP2pProbe(socketService) {
  try {
    if (!singleton) singleton = createP2pProbe()
    singleton.start(socketService)
  } catch (e) {
    console.warn('[p2pProbe] start failed', e)
  }
}
