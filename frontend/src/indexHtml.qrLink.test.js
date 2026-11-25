import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const hashScript = scripts.find((s) => s.includes('#/qc?'))

afterEach(() => { window.__csQrCode = undefined; window.__csQrNoHash = undefined; history.replaceState(null, '', '/') })

describe('index.html: QR 연결 비밀은 GA보다 먼저 주소에서 지운다', () => {
  it('#/qc? 처리 스크립트가 GA config보다 앞에 있다', () => {
    expect(hashScript).toBeTruthy()
    expect(html.indexOf("location.hash.indexOf('#/qc?')")).toBeLessThan(html.indexOf("gtag('config'"))
  })

  it('#/qc?를 메모리로 옮기고 주소에는 utm만 남긴다', () => {
    history.replaceState(null, '', '/?utm_source=qr&utm_medium=empty_state#/qc?s=a&g=AbCd12')
    new Function(hashScript)()
    expect(window.__csQrCode).toBe('#/qc?s=a&g=AbCd12')
    expect(location.hash).toBe('')
    expect(location.search).toBe('?utm_source=qr&utm_medium=empty_state')
    expect(window.__csQrNoHash).toBeUndefined()
  })

  it('QR로 왔는데 # 뒤가 없으면 표시만 남긴다', () => {
    history.replaceState(null, '', '/?utm_source=qr&utm_medium=empty_state')
    new Function(hashScript)()
    expect(window.__csQrCode).toBeUndefined()
    expect(window.__csQrNoHash).toBe(true)
  })
})
