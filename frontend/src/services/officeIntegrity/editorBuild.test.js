import { describe, it, expect, vi } from 'vitest'
import { editorBuildStatus, editorBuildNotice, checkEditorBuild, EDITOR_BUILD_NOTICE, TESTED_EDITOR_BUILDS } from './editorBuild.js'

const LIVE = {
  schema: 1,
  revision: 'cf4e9a7f10fd8581740f453c33c01900e94dbfdf',
  contentSha256: 'de4da58c078faf979e1fd6d1bb83fbf7daba463311021d948e4aa0641692e321',
  csBuild: '944cf8d2650616d811c56143fa518ee2a38b4fe7',
}
const OTHER = 'a'.repeat(40)
const okRes = (body) => ({ ok: true, json: async () => body })

describe('editor build check', () => {
  it('knows the deployed build', () => {
    expect(TESTED_EDITOR_BUILDS.length).toBeGreaterThan(0)
    expect(editorBuildStatus(LIVE)).toBe('tested')
    expect(editorBuildStatus({ ...LIVE, revision: LIVE.revision.toUpperCase() })).toBe('tested')
  })
  it('needs both revision and csBuild to match', () => {
    expect(editorBuildStatus({ ...LIVE, revision: OTHER })).toBe('untested')
    expect(editorBuildStatus({ ...LIVE, csBuild: OTHER })).toBe('untested')
  })
  it('treats missing or malformed identity as unknown', () => {
    expect(editorBuildStatus(null)).toBe('unknown')
    expect(editorBuildStatus('x')).toBe('unknown')
    expect(editorBuildStatus({ ...LIVE, schema: 2 })).toBe('unknown')
    expect(editorBuildStatus({ ...LIVE, csBuild: undefined })).toBe('unknown')
    expect(editorBuildStatus({ ...LIVE, revision: 'abc' })).toBe('unknown')
  })
  it('shows the notice only for an untested build', () => {
    expect(editorBuildNotice('untested')).toBe(EDITOR_BUILD_NOTICE)
    expect(editorBuildNotice('tested')).toBe('')
    expect(editorBuildNotice('unknown')).toBe('')
  })
  it('fetches build-identity.json from the editor origin', async () => {
    const fetchImpl = vi.fn(async () => okRes(LIVE))
    const r = await checkEditorBuild('https://office.clipboardapp.org', { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledWith('https://office.clipboardapp.org/build-identity.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
    expect(r).toMatchObject({ status: 'tested', notice: '' })
  })
  it('reports a changed build with the notice', async () => {
    const r = await checkEditorBuild('https://x.example', { fetchImpl: async () => okRes({ ...LIVE, revision: OTHER }) })
    expect(r).toMatchObject({ status: 'untested', notice: EDITOR_BUILD_NOTICE })
  })
  it('falls back to unknown on network, CORS or HTTP errors', async () => {
    for (const fetchImpl of [async () => { throw new TypeError('Failed to fetch') }, async () => ({ ok: false, json: async () => LIVE }), async () => ({ ok: true, json: async () => { throw new SyntaxError('bad') } })]) {
      expect(await checkEditorBuild('https://x.example', { fetchImpl })).toMatchObject({ status: 'unknown', notice: '' })
    }
  })
  it('gives up after the timeout', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))))
    expect(await checkEditorBuild('https://x.example', { fetchImpl, timeout: 10 })).toMatchObject({ status: 'unknown' })
  })
})
