// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** public/sw.js를 가짜 self에 올려 push·notificationclick·message 리스너를 얻는다 */
function loadSw({ language = 'en-US', windows = [] } = {}) {
  const src = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf-8')
  const listeners = {}
  const shown = []
  const opened = []
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    clients: {
      claim: () => Promise.resolve(),
      get: async () => null,
      matchAll: async () => windows,
      openWindow: async (url) => { opened.push(url) },
    },
    skipWaiting: () => {},
    navigator: { language },
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }) } },
  }
  new Function('self', src)(self)
  return { self, listeners, shown, opened }
}

/** event.waitUntil에 넘긴 promise를 모아 끝까지 기다린다 */
function makeEvent(extra = {}) {
  const waits = []
  return { event: { waitUntil: (p) => waits.push(p), ...extra }, done: () => Promise.all(waits) }
}

const pushEvent = (obj, raw) => ({ data: { json: () => { if (raw !== undefined) throw new Error('bad json'); return obj } } })

describe('서비스워커 도착 알림', () => {
  it('push: 페이로드로 알림을 항상 보여 준다 (renotify, 아이콘, target)', async () => {
    const { listeners, shown } = loadSw()
    const { event, done } = makeEvent(pushEvent({ v: 1, title: 'Clipboard Share', body: '새 파일 2개가 도착했어요', tag: 'cs-arrival', target: 'ip' }))
    listeners.push(event)
    await done()
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Clipboard Share')
    expect(shown[0].opts).toEqual({ body: '새 파일 2개가 도착했어요', tag: 'cs-arrival', renotify: true, icon: '/icon-192.png', data: { target: 'ip' } })
  })

  it('push: JSON이 깨져도, 데이터가 없어도 일반 문구로 알림을 보인다', async () => {
    for (const evt of [pushEvent(null, 'broken'), { data: null }, {}]) {
      const { listeners, shown } = loadSw()
      const { event, done } = makeEvent(evt)
      listeners.push(event)
      await done()
      expect(shown).toHaveLength(1)
      expect(shown[0].title).toBe('Clipboard Share')
      expect(shown[0].opts.body).toBe('Something new arrived')
      expect(shown[0].opts.tag).toBe('cs-arrival')
      expect(shown[0].opts.data.target).toBeNull()
    }
  })

  it('push: 한국어 기기는 한국어 일반 문구', async () => {
    const { listeners, shown } = loadSw({ language: 'ko-KR' })
    const { event, done } = makeEvent({ data: null })
    listeners.push(event)
    await done()
    expect(shown[0].opts.body).toBe('새 항목이 도착했어요')
  })

  it('push: 이상한 값(타입 오류, 너무 긴 문자열, 알 수 없는 target)이 와도 알림은 보이고 값은 걸러진다', async () => {
    const { listeners, shown } = loadSw()
    const { event, done } = makeEvent(pushEvent({ title: 5, body: 'x'.repeat(500), tag: {}, target: 'https://evil.example' }))
    listeners.push(event)
    await done()
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Clipboard Share')
    expect(shown[0].opts.body).toBe('Something new arrived')
    expect(shown[0].opts.data.target).toBeNull()
  })

  it('notificationclick: 그룹 방 ID(prv-g-…)도 target으로 전달한다', async () => {
    const calls = []
    const win = { focus: async () => {}, postMessage: (m) => calls.push(m) }
    const { listeners } = loadSw({ windows: [win] })
    const group = 'prv-g-0123456789abcdef01234567'
    const { event, done } = makeEvent({ notification: { close: () => {}, data: { target: group } } })
    listeners.notificationclick(event)
    await done()
    expect(calls).toEqual([{ type: 'PUSH_OPEN', target: group }])
  })

  it('notificationclick: 열린 창이 있으면 focus하고 PUSH_OPEN을 보낸다', async () => {
    const calls = []
    const win = { focus: async () => { calls.push('focus') }, postMessage: (m) => calls.push(m) }
    const { listeners, opened } = loadSw({ windows: [win] })
    let closed = false
    const { event, done } = makeEvent({ notification: { close: () => { closed = true }, data: { target: 'prv-0123456789abcdef01234567' } } })
    listeners.notificationclick(event)
    await done()
    expect(closed).toBe(true)
    expect(calls).toEqual(['focus', { type: 'PUSH_OPEN', target: 'prv-0123456789abcdef01234567' }])
    expect(opened).toHaveLength(0)
  })

  it('notificationclick: 열린 창이 없으면 창을 열고(방 ID 없는 주소) target은 GET_PUSH_TARGET으로 한 번만 돌려준다', async () => {
    const { listeners, opened } = loadSw({ windows: [] })
    const { event, done } = makeEvent({ notification: { close: () => {}, data: { target: 'ip' } } })
    listeners.notificationclick(event)
    await done()
    expect(opened).toEqual(['/?utm_source=push&utm_medium=notification'])
    expect(opened[0]).not.toMatch(/prv-|room/)

    const replies = []
    const port = { postMessage: (m) => replies.push(m) }
    listeners.message({ data: { type: 'GET_PUSH_TARGET' }, ports: [port] })
    listeners.message({ data: { type: 'GET_PUSH_TARGET' }, ports: [port] })
    expect(replies).toEqual([{ type: 'PUSH_TARGET', target: 'ip' }, { type: 'PUSH_TARGET', target: null }])
  })

  it('notificationclick: data가 없어도 죽지 않는다', async () => {
    const { listeners, opened } = loadSw()
    const { event, done } = makeEvent({ notification: { close: () => {} } })
    listeners.notificationclick(event)
    await done()
    expect(opened).toHaveLength(1)
  })

  it('GET_SHARE_DATA 처리는 그대로 동작한다', () => {
    const { listeners } = loadSw()
    const replies = []
    listeners.message({ data: { type: 'GET_SHARE_DATA' }, ports: [{ postMessage: (m) => replies.push(m) }] })
    expect(replies).toEqual([{ type: 'SHARE_DATA', data: null }])
  })
})
