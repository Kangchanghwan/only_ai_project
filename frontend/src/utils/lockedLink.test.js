import { describe, it, expect } from 'vitest'
import { buildLockedLink, parseLockedLink } from './lockedLink.js'
import { parseRoute } from './router.js'

const v = 'A'.repeat(42) + 'Q'
const k = 'b_-' + 'c'.repeat(40)
const id = '0123456789abcdef0123456789abcdef'

describe('lockedLink', () => {
  it('만든 링크를 그대로 읽는다 (모든 값은 # 뒤에 있다)', () => {
    const url = buildLockedLink('https://www.clipboardapp.org', { roomId: 'room-2ecd26527838', id, verifier: v, key: k })
    const u = new URL(url)
    expect(u.pathname).toBe('/')
    expect(u.search).toBe('')
    expect(parseLockedLink(u.hash)).toEqual({ roomId: 'room-2ecd26527838', id, verifier: v, key: k })
    expect(url.length).toBeLessThan(220)
  })

  it('형식이 틀리면 null', () => {
    expect(parseLockedLink('#/lk?r=room-1&i=xyz&v=' + v + '&k=' + k)).toBeNull()
    expect(parseLockedLink('#/lk?r=room-1&i=' + id + '&v=short&k=' + k)).toBeNull()
    expect(parseLockedLink('#/lk?r=../x&i=' + id + '&v=' + v + '&k=' + k)).toBeNull()
    expect(parseLockedLink('#/download?r=1')).toBeNull()
  })

  it('라우터: 잠긴 파일 링크는 locked, 깨진 링크는 locked-invalid', () => {
    expect(parseRoute(`#/lk?r=room-shared&i=${id}&v=${v}&k=${k}`)).toMatchObject({ type: 'locked', roomId: 'room-shared', id })
    expect(parseRoute('#/lk?r=room-shared')).toEqual({ type: 'locked-invalid' })
    expect(parseRoute('')).toEqual({ type: 'home' })
  })
})
