/**
 * 1:1 연결 세션 컨트롤러 (프레임워크 무관). 규격: docs/superpowers/specs/2026-10-15-private-pair-rooms-design.md
 *
 * 상태: inviting(보낸 쪽, 수락 대기) | incoming(받은 쪽, 응답 대기) | accepted(수락됨, 키 교환 중)
 *       | keyed(양쪽 공개키 확보, sas 표시) | waiting-peer-confirm(내가 "같아요" 보냄) | done | ended(reason)
 * 비밀(개인키·kWrap·roomSecret)은 컨트롤러 안에만 두고 스냅샷·로그에 절대 내보내지 않는다.
 */
import { generateEphemeral, deriveSession, newRoomSecret, wrapSecret, unwrapSecret } from '../utils/pairCrypto.js'

export const PAIR_EVENTS = ['pair:incoming', 'pair:accepted', 'pair:signal', 'pair:ended', 'pair:done']

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string' && v.length > 0

/**
 * @param {{
 *   socket: { emit(event: string, payload: object): Promise<object>, on(event: string, fn: Function): void, off(event: string, fn: Function): void },
 *   onPaired?: (info: {roomId: string, peer: object, roomToken: string, roomTokenTtlSec: number, roomSecret: Uint8Array}) => void
 * }} deps
 */
export function createPairing({ socket, onPaired }) {
  /** @type {Map<string, any>} */
  const sessions = new Map()
  const listeners = new Set()

  const snapshot = () =>
    [...sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      role: s.role,
      peer: s.peer,
      sameNetwork: s.sameNetwork,
      state: s.state,
      sas: s.sas ? [...s.sas] : null,
      expiresAt: s.expiresAt ?? null,
      reason: s.reason ?? null
    }))

  const notify = () => {
    const snap = snapshot()
    for (const cb of [...listeners]) {
      try { cb(snap) } catch (e) { console.error('[pairing] listener error:', e?.message || e) }
    }
  }

  const scrub = (s) => { s.priv = null; s.kWrap = null; s.secret = null; s.pendingSecret = null; s.peerPk = null }

  function end(s, reason) {
    if (s.state === 'done' || s.state === 'ended') return
    s.state = 'ended'
    s.reason = reason
    scrub(s)
    notify()
  }

  const make = (sessionId, role, extra = {}) => {
    const s = {
      sessionId, role, peer: null, sameNetwork: null, state: 'idle', sas: null, expiresAt: null, reason: null,
      priv: null, myPk: null, peerPk: null, kWrap: null, secret: null, pendingSecret: null,
      secretSent: false, chain: Promise.resolve(), ...extra
    }
    sessions.set(sessionId, s)
    return s
  }

  const signal = (s, data) => socket.emit('pair:signal', { sessionId: s.sessionId, data })

  /** 세션별로 비동기 작업을 순서대로 처리한다 */
  const enqueue = (s, fn) => {
    s.chain = s.chain.then(fn).catch((e) => {
      console.warn('[pairing] 세션 처리 실패:', e?.message || e)
      if (s.state !== 'ended' && s.state !== 'done') {
        socket.emit('pair:cancel', { sessionId: s.sessionId }).catch(() => {})
        end(s, 'invalid')
      }
    })
    return s.chain
  }

  async function tryDeriveAndAdvance(s) {
    if (s.kWrap || !s.peerPk || !s.priv) return
    const { kWrap, sas } = await deriveSession({ privateKey: s.priv, myPk: s.myPk, peerPk: s.peerPk, sessionId: s.sessionId })
    if (s.state === 'ended' || s.state === 'done') return
    s.kWrap = kWrap
    s.sas = sas
    if (s.state === 'accepted') s.state = 'keyed'
    if (s.role === 'initiator' && !s.secretSent) {
      s.secret = newRoomSecret()
      const w = await wrapSecret(kWrap, s.secret)
      s.secretSent = true
      await signal(s, { t: 'secret', v: 1, ...w })
    }
    if (s.role === 'responder' && s.pendingSecret) {
      const msg = s.pendingSecret
      s.pendingSecret = null
      s.secret = await unwrapSecret(kWrap, msg)
    }
    notify()
  }

  // === 서버 이벤트 ===
  const handlers = {
    'pair:incoming'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.from) || sessions.has(p.sessionId)) return
      const s = make(p.sessionId, 'responder', { peer: p.from, sameNetwork: !!p.sameNetwork, expiresAt: p.expiresAt ?? null })
      s.state = 'incoming'
      notify()
    },

    'pair:accepted'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.peer) || !['initiator', 'responder'].includes(p.role)) return
      let s = sessions.get(p.sessionId)
      if (!s) {
        if (p.role !== 'initiator') return
        s = make(p.sessionId, 'initiator') // invite ack보다 먼저 도착한 경우
      }
      if (s.role !== p.role || (s.state !== 'inviting' && s.state !== 'incoming' && s.state !== 'idle')) return
      s.peer = p.peer
      s.state = 'accepted'
      notify()
      enqueue(s, async () => {
        const eph = await generateEphemeral()
        s.priv = eph.privateKey
        s.myPk = eph.publicRaw
        await signal(s, { t: 'pk', v: 1, pk: eph.publicRaw })
        await tryDeriveAndAdvance(s)
      })
    },

    'pair:signal'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.data)) return
      const s = sessions.get(p.sessionId)
      if (!s || s.state === 'ended' || s.state === 'done') return
      const d = p.data
      if (d.t === 'pk' && d.v === 1 && isStr(d.pk)) {
        if (s.peerPk || (s.state !== 'accepted' && s.state !== 'inviting' && s.state !== 'incoming')) return
        s.peerPk = d.pk
        enqueue(s, () => tryDeriveAndAdvance(s))
      } else if (d.t === 'secret' && d.v === 1 && isStr(d.iv) && isStr(d.ct)) {
        if (s.role !== 'responder' || s.secret || s.pendingSecret) return
        enqueue(s, async () => {
          if (s.kWrap) s.secret = await unwrapSecret(s.kWrap, d)
          else s.pendingSecret = { iv: d.iv, ct: d.ct }
        })
      }
      // 그 밖의 형식은 무시
    },

    'pair:ended'(p) {
      if (!isObj(p) || !isStr(p.sessionId)) return
      const s = sessions.get(p.sessionId)
      if (s) end(s, isStr(p.reason) ? p.reason : 'ended')
    },

    'pair:done'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isStr(p.roomId)) return
      const s = sessions.get(p.sessionId)
      if (!s || s.state !== 'waiting-peer-confirm' || !s.secret) {
        if (s && s.state !== 'ended' && s.state !== 'done') end(s, 'invalid')
        return
      }
      const roomSecret = s.secret
      const peer = isObj(p.peer) ? p.peer : s.peer
      s.peer = peer
      s.state = 'done'
      scrub(s)
      notify()
      try {
        onPaired?.({ roomId: p.roomId, peer, roomToken: p.roomToken, roomTokenTtlSec: p.roomTokenTtlSec, roomSecret })
      } catch (e) {
        console.error('[pairing] onPaired error:', e?.message || e)
      }
    }
  }

  for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn)

  // === 공개 API ===
  return {
    /** @returns {Promise<{ok: boolean, sessionId?: string, code?: string}>} */
    async invite(toSocketId) {
      const ack = await socket.emit('pair:invite', { to: toSocketId })
      if (!ack?.ok || !isStr(ack.sessionId)) return { ok: false, code: ack?.code || 'FAILED' }
      let s = sessions.get(ack.sessionId)
      if (!s) {
        s = make(ack.sessionId, 'initiator')
        s.state = 'inviting'
      }
      s.expiresAt = ack.expiresAt ?? null
      notify()
      return { ok: true, sessionId: ack.sessionId }
    },

    async cancel(sessionId) {
      const s = sessions.get(sessionId)
      if (!s || s.state === 'ended' || s.state === 'done') return
      end(s, 'cancelled')
      await socket.emit('pair:cancel', { sessionId }).catch(() => {})
    },

    /** 받은 쪽 수락/거절 */
    async respond(sessionId, accept, { block = false } = {}) {
      const s = sessions.get(sessionId)
      if (!s || s.role !== 'responder' || s.state !== 'incoming') return { ok: false, code: 'BAD_STATE' }
      const ack = await socket.emit('pair:respond', { sessionId, accept: !!accept, ...(block ? { block: true } : {}) })
      if (!ack?.ok) { end(s, 'failed'); return { ok: false, code: ack?.code || 'FAILED' } }
      if (!accept) end(s, 'declined-by-me')
      return { ok: true }
    },

    /** 그림 확인 결과 */
    async confirm(sessionId, same) {
      const s = sessions.get(sessionId)
      if (!s || s.state !== 'keyed') return { ok: false, code: 'BAD_STATE' }
      if (same && s.role === 'responder' && !s.secret) return { ok: false, code: 'NO_SECRET' }
      if (same) { s.state = 'waiting-peer-confirm'; notify() }
      const ack = await socket.emit('pair:confirm', { sessionId, same: !!same })
      if (!ack?.ok) { end(s, 'failed'); return { ok: false, code: ack?.code || 'FAILED' } }
      if (!same) end(s, 'mismatch')
      return { ok: true }
    },

    /** 끝난 세션을 목록에서 치운다 */
    dismiss(sessionId) {
      const s = sessions.get(sessionId)
      if (s && (s.state === 'ended' || s.state === 'done')) { sessions.delete(sessionId); notify() }
    },

    getSessions: snapshot,

    /** @returns {() => void} 구독 해제 */
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    destroy() {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn)
      for (const s of sessions.values()) scrub(s)
      sessions.clear()
      listeners.clear()
    }
  }
}
