import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetTitleBadge, setTitleBadge } from './useTitleBadge'
import { useArrivalBadge, NOTIFY_PREF_KEY } from './useArrivalBadge'

vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../utils/analytics'

let hidden = false
let focused = true
const OTHER = { socketId: 'other', identity: { adj: 0, animal: 0 } }

function setAway(v) { hidden = v; focused = !v }
function returnToTab() {
  hidden = false; focused = true
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
}

describe('useArrivalBadge', () => {
  let badge
  beforeEach(() => {
    hidden = false; focused = true
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
    document.title = 'Clipboard'
    localStorage.clear()
    resetTitleBadge()
    document.title = 'Clipboard'
    vi.mocked(trackEvent).mockClear()
    delete globalThis.Notification
  })
  afterEach(() => { badge?.destroy(); resetTitleBadge(); vi.restoreAllMocks(); delete globalThis.Notification })

  it('보이는 상태에서는 세지 않는다', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
    expect(badge.count.value).toBe(0)
    expect(document.title).toBe('Clipboard')
  })

  it('숨김 상태에서만 세고 제목에 (n) 접두사', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setAway(true)
    badge.onArrival({ kind: 'text', sender: OTHER })
    expect(badge.count.value).toBe(1)
    expect(document.title).toBe('(1) Clipboard')
  })

  it('포커스만 없어도 숨김으로 본다', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    focused = false
    badge.onArrival({ kind: 'text', sender: OTHER })
    expect(badge.count.value).toBe(1)
  })

  it('내 기기가 올린 것은 제외', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setAway(true)
    badge.onArrival({ kind: 'file', count: 1, sender: { socketId: 'me' } })
    expect(badge.count.value).toBe(0)
  })

  it('여러 파일은 개수만큼', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setAway(true)
    badge.onArrival({ kind: 'file', count: 3, sender: OTHER })
    expect(badge.count.value).toBe(3)
    expect(document.title).toBe('(3) Clipboard')
  })

  it('돌아오면 0으로 초기화되고 제목이 복원된다', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setAway(true)
    badge.onArrival({ kind: 'file', count: 2, sender: OTHER })
    returnToTab()
    expect(badge.count.value).toBe(0)
    expect(document.title).toBe('Clipboard')
    expect(trackEvent).toHaveBeenCalledWith('arrival_seen', expect.objectContaining({ count: 2 }))
  })

  it('1:1 요청 1 + 도착 2 → (3) 하나만, 중복 없음', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setTitleBadge('pair', 1)
    expect(document.title).toBe('(1) Clipboard')
    setAway(true)
    badge.onArrival({ kind: 'file', count: 2, sender: OTHER })
    expect(document.title).toBe('(3) Clipboard')
    badge.onArrival({ kind: 'text', sender: OTHER })
    expect(document.title).toBe('(4) Clipboard')
    setTitleBadge('pair', 0)
    expect(document.title).toBe('(3) Clipboard')
  })

  it('arrival_hidden은 세션당 20회까지만 보낸다', () => {
    badge = useArrivalBadge({ getMySocketId: () => 'me' })
    setAway(true)
    for (let i = 0; i < 25; i++) badge.onArrival({ kind: 'text', sender: OTHER })
    expect(vi.mocked(trackEvent).mock.calls.filter((c) => c[0] === 'arrival_hidden')).toHaveLength(20)
  })

  describe('브라우저 알림', () => {
    function mockNotification(permission) {
      const created = []
      const N = vi.fn(function (title, opts) { created.push({ title, opts }); this.close = vi.fn() })
      N.permission = permission
      N.requestPermission = vi.fn(async () => { N.permission = permission === 'default' ? 'denied' : permission; return N.permission })
      globalThis.Notification = N
      return { N, created }
    }

    it('권한을 처음부터 묻지 않고, 돌아왔을 때 안내를 1회만 보인다', () => {
      const { N } = mockNotification('default')
      badge = useArrivalBadge({ getMySocketId: () => 'me' })
      expect(N.requestPermission).not.toHaveBeenCalled()
      setAway(true)
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      expect(badge.promptVisible.value).toBe(false)
      returnToTab()
      expect(badge.promptVisible.value).toBe(true)
      badge.dismissPrompt()
      expect(badge.promptVisible.value).toBe(false)
      setAway(true)
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      returnToTab()
      expect(badge.promptVisible.value).toBe(false)
      expect(N.requestPermission).not.toHaveBeenCalled()
    })

    it('거절 기록이 있으면 다시 안 띄운다', () => {
      mockNotification('default')
      localStorage.setItem(NOTIFY_PREF_KEY, 'dismissed')
      badge = useArrivalBadge({ getMySocketId: () => 'me' })
      setAway(true)
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      returnToTab()
      expect(badge.promptVisible.value).toBe(false)
    })

    it('알림 켜기 → 권한 거부면 기록한다', async () => {
      mockNotification('default')
      badge = useArrivalBadge({ getMySocketId: () => 'me' })
      setAway(true)
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      returnToTab()
      await badge.enableNotifications()
      expect(localStorage.getItem(NOTIFY_PREF_KEY)).toBe('denied')
      expect(trackEvent).toHaveBeenCalledWith('notify_permission', { result: 'denied' })
    })

    it('모바일에서는 안내·알림 없음', () => {
      const { created } = mockNotification('granted')
      badge = useArrivalBadge({ getMySocketId: () => 'me', isMobile: true })
      setAway(true)
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      expect(created).toHaveLength(0)
    })

    it('granted면 숨김 상태 도착 시 알림 생성, 파일 이름·텍스트는 본문에 없다', () => {
      const { created } = mockNotification('granted')
      badge = useArrivalBadge({ getMySocketId: () => 'me' })
      setAway(true)
      badge.onArrival({ kind: 'file', count: 2, sender: { ...OTHER, model: 'Pixel' }, fileName: 'secret.pdf' })
      badge.onArrival({ kind: 'text', sender: OTHER, content: '비밀번호1234' })
      expect(created).toHaveLength(2)
      expect(created[0].title).toBe('Clipboard Share')
      expect(created[0].opts).toMatchObject({ tag: 'cs-arrival', icon: '/icon-192.png' })
      for (const c of created) {
        expect(c.opts.body).not.toContain('secret.pdf')
        expect(c.opts.body).not.toContain('비밀번호1234')
      }
      expect(created[0].opts.body).toContain('2')
    })

    it('보이는 상태에서는 알림을 만들지 않는다', () => {
      const { created } = mockNotification('granted')
      badge = useArrivalBadge({ getMySocketId: () => 'me' })
      badge.onArrival({ kind: 'file', count: 1, sender: OTHER })
      expect(created).toHaveLength(0)
    })
  })
})
