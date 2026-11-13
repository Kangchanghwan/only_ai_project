import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MultiDownloadSheet from './MultiDownloadSheet.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const MB = 1024 * 1024

const items = [
  { key: 0, type: 'zip', files: [{ name: 'a' }, { name: 'b' }], size: 3 * MB, index: 0, zipCount: 1, state: 'running', percent: 40 },
  { key: 1, type: 'file', file: { name: 'movie.mp4' }, size: 1200 * MB, state: 'idle', percent: 0 },
  { key: 2, type: 'file', file: { name: 'x.bin' }, size: null, state: 'started', percent: 0 },
]

describe('MultiDownloadSheet', () => {
  it('sheet가 없으면 그리지 않는다', () => {
    const w = mount(MultiDownloadSheet, { ...opts, props: { sheet: null } })
    expect(q('multi-download-sheet')).toBeNull()
    w.unmount()
  })

  it('ZIP 묶음·큰 파일 줄, 상태별 문구와 버튼, 누르면 run, 닫기', async () => {
    const w = mount(MultiDownloadSheet, { ...opts, props: { sheet: { items } } })
    expect(document.body.querySelector('#multi-download-title').textContent).toBe('여러 파일 받기')
    const row0 = q('multi-download-item-0')
    expect(row0.textContent).toContain('ZIP · 파일 2개')
    expect(row0.textContent).toContain('40% 받는 중')
    expect(q('multi-download-run-0').disabled).toBe(true)
    expect(q('multi-download-item-1').textContent).toContain('movie.mp4')
    expect(q('multi-download-item-1').textContent).toContain('1.2 GB')
    expect(q('multi-download-run-1').textContent.trim()).toBe('받기')
    expect(q('multi-download-item-2').textContent).toContain('받기 시작함')
    expect(q('multi-download-run-2').textContent.trim()).toBe('다시 받기')
    q('multi-download-run-1').click()
    expect(w.emitted('run')[0][0].key).toBe(1)
    q('multi-download-close').click()
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})
