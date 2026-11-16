import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'locales')
const KEYS = ['chipOn', 'chipOff', 'confirmLockedSend', 'barDesc', 'barDescShort', 'offConfirm', 'offConfirmYes', 'reloadOff', 'reloadRelock', 'tag']
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('잠금 UI 번역 키', () => {
  it('21개 언어 파일이 있다', () => {
    expect(files).toHaveLength(21)
  })
  it.each(files)('%s에 잠금 UI 문구 10개가 비어 있지 않은 문자열로 있다', (f) => {
    const lock = JSON.parse(readFileSync(join(dir, f), 'utf8')).lock
    for (const k of KEYS) {
      expect(typeof lock?.[k], `${f} lock.${k}`).toBe('string')
      expect(lock[k].trim().length, `${f} lock.${k}`).toBeGreaterThan(0)
    }
  })
})
