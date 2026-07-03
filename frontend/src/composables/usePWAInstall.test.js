import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('usePWAInstall', () => {
  beforeEach(() => {
    vi.resetModules()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  })

  it('초기 상태에서는 canInstall과 isInstalled 모두 false다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, isInstalled } = usePWAInstall()
    expect(canInstall.value).toBe(false)
    expect(isInstalled.value).toBe(false)
  })

  it('display-mode: standalone이면 isInstalled가 true로 초기화된다', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { isInstalled } = usePWAInstall()
    expect(isInstalled.value).toBe(true)
  })

  it('beforeinstallprompt 이벤트를 받으면 canInstall이 true가 되고 기본 동작이 막힌다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall } = usePWAInstall()

    const event = new Event('beforeinstallprompt')
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(canInstall.value).toBe(true)
  })

  it('appinstalled 이벤트를 받으면 isInstalled가 true, canInstall이 false가 된다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, isInstalled } = usePWAInstall()

    const bip = new Event('beforeinstallprompt')
    bip.preventDefault = vi.fn()
    window.dispatchEvent(bip)
    expect(canInstall.value).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))

    expect(isInstalled.value).toBe(true)
    expect(canInstall.value).toBe(false)
  })

  it('promptInstall은 캡처된 이벤트의 prompt()를 호출하고 canInstall을 false로 리셋한다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, promptInstall } = usePWAInstall()

    const promptFn = vi.fn()
    const bip = new Event('beforeinstallprompt')
    bip.preventDefault = vi.fn()
    bip.prompt = promptFn
    bip.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(bip)
    expect(canInstall.value).toBe(true)

    await promptInstall()

    expect(promptFn).toHaveBeenCalled()
    expect(canInstall.value).toBe(false)
  })

  it('캡처된 이벤트가 없으면 promptInstall은 아무 것도 하지 않는다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { promptInstall } = usePWAInstall()
    await expect(promptInstall()).resolves.toBeUndefined()
  })
})
