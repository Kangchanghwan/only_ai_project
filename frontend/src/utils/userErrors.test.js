import { describe, it, expect, vi, beforeEach } from 'vitest'

const track = vi.fn()
vi.mock('./analytics.js', () => ({ trackEvent: (...a) => track(...a) }))
import { reportError } from './userErrors.js'

describe('reportError: 원인은 화면이 아니라 측정·개발자 도구로', () => {
  beforeEach(() => { track.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('묶음·상태 코드·내부 code만 보낸다 (메시지·파일 이름은 보내지 않음)', () => {
    reportError('upload', Object.assign(new Error('저장소 업로드 실패: 403 secret.pdf'), { status: 403, code: 'X' }))
    expect(track).toHaveBeenCalledWith('error_shown', { kind: 'upload', status: 403, code: 'X' })
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret.pdf')
  })

  it('상태·코드가 없으면 0과 빈 문자열', () => {
    reportError('connect', new Error('x'))
    expect(track).toHaveBeenCalledWith('error_shown', { kind: 'connect', status: 0, code: '' })
    reportError('download', undefined)
    expect(track).toHaveBeenLastCalledWith('error_shown', { kind: 'download', status: 0, code: '' })
  })
})
