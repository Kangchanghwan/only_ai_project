/**
 * QR을 띄우는 쪽(PC): 빈 화면 QR에 담을 회차(비밀·키·지문)를 만들고, QR로 온 연결 요청의 증명을 확인한다.
 * 모두 이 기기 안에서만 만들고 서버에는 아무것도 등록하지 않는다.
 * 방 탭에서 띄우는 QR(roomQrUrl)은 같은 회차에 방 꼬리표 r을 더 담는다 (setRoom으로 방을 고른다).
 * 규칙: 5분마다 새 회차, 지금·직전 회차만 기억, 회차는 만든 지 10분까지 받는다. 탭이 숨겨진 동안은 새로 만들지 않는다.
 */
import { ref, computed, watch, getCurrentInstance, onUnmounted } from 'vue'
import { generateEphemeral } from '../utils/pairCrypto.js'
import { randomBytes } from '../utils/lockCrypto.js'
import { buildQrLink, roomTag, keyFingerprint, qrProof, sameString, newGenId, QR_ROTATE_MS, QR_MAX_AGE_MS } from '../utils/qrLink.js'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState.js'

/**
 * @param {{
 *   getSocketId: () => string|null,
 *   getIdentityKey?: () => string|null,
 *   now?: () => number,
 *   setTimer?: Function, clearTimer?: Function,
 *   isVisible?: () => boolean
 * }} deps
 */
export function useQrHost({
  getSocketId,
  getIdentityKey = () => null,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
} = {}) {
  /** @type {Array<{g: string, x: Uint8Array, f: string, privateKey: CryptoKey, publicRaw: string, createdAt: number}>} 최신이 앞 */
  const gens = []
  const current = ref(null) // { g, x, f } — 화면에 그릴 값 (비밀 키는 넣지 않는다)
  let timer = null
  let making = null

  async function rotate() {
    if (making) return making
    making = (async () => {
      try {
        const eph = await generateEphemeral()
        const gen = { g: newGenId(), x: randomBytes(16), f: await keyFingerprint(eph.publicRaw), privateKey: eph.privateKey, publicRaw: eph.publicRaw, createdAt: now() }
        gens.unshift(gen)
        gens.length = Math.min(gens.length, 2)
        current.value = { g: gen.g, x: gen.x, f: gen.f }
      } catch {
        current.value = null // 만들 수 없으면 고정 QR로 돌아간다
      } finally {
        making = null
      }
    })()
    return making
  }

  function schedule() {
    if (timer) clearTimer(timer)
    timer = setTimer(async () => {
      timer = null
      if (isVisible()) await rotate()
      schedule()
    }, QR_ROTATE_MS)
  }

  /** 시작: 첫 회차를 만들고 5분마다 바꾼다 */
  async function start() {
    if (!gens.length || now() - gens[0].createdAt >= QR_ROTATE_MS) await rotate()
    schedule()
  }

  /** 탭이 다시 보일 때: 지금 회차가 오래됐으면 바로 바꾼다 */
  function onVisible() {
    if (gens.length && now() - gens[0].createdAt >= QR_ROTATE_MS) rotate()
  }

  /** QR에 넣을 주소. 회차가 없거나 소켓이 없으면 지금까지의 고정 주소 */
  const qrUrl = computed(() => {
    const c = current.value
    const s = getSocketId()
    if (!c || !s) return EMPTY_STATE_QR_URL
    return buildQrLink(EMPTY_STATE_QR_URL, { s, k: getIdentityKey(), g: c.g, x: c.x, f: c.f })
  })

  // 방 탭 QR: 지금 회차 + 방 꼬리표. 방이 없거나 만들 수 없으면 null
  const roomId = ref(null)
  const roomQrUrl = ref(null)
  let roomSeq = 0
  async function refreshRoomUrl([c, s, id]) {
    const seq = ++roomSeq
    if (!c || !s || !id) { roomQrUrl.value = null; return }
    try {
      const r = await roomTag(c.x, id)
      if (seq === roomSeq) roomQrUrl.value = buildQrLink(EMPTY_STATE_QR_URL, { s, k: getIdentityKey(), g: c.g, x: c.x, f: c.f, r })
    } catch {
      if (seq === roomSeq) roomQrUrl.value = null
    }
  }
  const stopRoomWatch = watch(() => [current.value, getSocketId(), roomId.value], refreshRoomUrl)
  /** 방 탭 QR에 담을 방 (null이면 끈다) */
  function setRoom(id) { roomId.value = typeof id === 'string' && id ? id : null }

  /**
   * QR 연결 요청의 증명 확인 (pairing의 qrVerify)
   * @returns {Promise<{privateKey: CryptoKey, publicRaw: string} | {error: 'expired'|'invalid'}>}
   */
  async function verify({ g, proof, peerPk }) {
    const gen = gens.find((x) => x.g === g)
    if (!gen || now() - gen.createdAt > QR_MAX_AGE_MS) return { error: 'expired' }
    let expected = ''
    try { expected = await qrProof(gen.x, g, peerPk) } catch { return { error: 'invalid' } }
    if (!sameString(expected, proof)) return { error: 'invalid' }
    return { privateKey: gen.privateKey, publicRaw: gen.publicRaw }
  }

  const onVisibility = () => { if (isVisible()) onVisible() }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  function destroy() {
    if (timer) clearTimer(timer)
    timer = null
    gens.length = 0
    current.value = null
    roomQrUrl.value = null
    stopRoomWatch()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  }
  if (getCurrentInstance()) onUnmounted(destroy)

  return { qrUrl, roomQrUrl, setRoom, current, start, rotate, verify, destroy }
}
