// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { useQrHost } from './useQrHost.js'
import { parseQrLink, roomTag, QR_ROTATE_MS } from '../utils/qrLink.js'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

function mk({ visible = true, socket = 'B' } = {}) {
  let clock = 0
  let timer = null
  const v = { visible }
  const host = useQrHost({ getSocketId: () => socket, now: () => clock, setTimer: (fn) => { timer = fn; return 1 }, clearTimer: () => { timer = null }, isVisible: () => v.visible })
  return { host, v, advance: (ms) => { clock += ms }, fire: () => timer?.() }
}
const gOf = (host) => parseQrLink('#' + host.qrUrl.value.split('#')[1])?.g

describe('useQrHost', () => {
  it('시작 전·소켓이 없으면 고정 주소', async () => {
    expect(mk().host.qrUrl.value).toBe(EMPTY_STATE_QR_URL)
    const { host } = mk({ socket: null })
    await host.start()
    expect(host.qrUrl.value).toBe(EMPTY_STATE_QR_URL)
  })

  it('5분마다 회차가 바뀌고 직전 회차만 남는다', async () => {
    const { host, advance, fire } = mk()
    await host.start()
    const g1 = gOf(host)
    advance(QR_ROTATE_MS); await fire()
    const g2 = gOf(host)
    advance(QR_ROTATE_MS); await fire()
    expect(gOf(host)).not.toBe(g2)
    expect(g2).not.toBe(g1)
    expect(await host.verify({ g: g1, proof: 'x', peerPk: 'y' })).toEqual({ error: 'expired' })
    expect(await host.verify({ g: g2, proof: 'AAAAAAAAAAAAAAAAAAAAAA', peerPk: 'AAAA' })).toEqual({ error: 'invalid' })
  })

  it('탭이 숨겨진 동안은 새로 만들지 않는다', async () => {
    const { host, v, advance, fire } = mk()
    await host.start()
    const g1 = gOf(host)
    v.visible = false
    advance(QR_ROTATE_MS); await fire()
    expect(gOf(host)).toBe(g1)
  })

  it('방 탭 QR: 지금 회차에 방 꼬리표를 붙이고, 방을 끄면 null', async () => {
    const { host, advance, fire } = mk()
    await host.start()
    expect(host.roomQrUrl.value).toBeNull()
    host.setRoom('prv-0123456789abcdef01234567')
    await vi.waitFor(() => expect(host.roomQrUrl.value).toBeTruthy())
    const p = parseQrLink('#' + host.roomQrUrl.value.split('#')[1])
    expect(p.g).toBe(gOf(host))
    expect(p.r).toBe(await roomTag(p.x, 'prv-0123456789abcdef01234567'))
    advance(QR_ROTATE_MS); await fire()
    await vi.waitFor(() => expect(parseQrLink('#' + host.roomQrUrl.value.split('#')[1]).g).toBe(gOf(host)))
    host.setRoom(null)
    await vi.waitFor(() => expect(host.roomQrUrl.value).toBeNull())
  })
})
