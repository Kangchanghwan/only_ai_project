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

  describe('GA 이벤트', () => {
    beforeEach(() => { global.gtag = vi.fn() })

    it('promptInstall은 pwa_install_click(prompt)과 pwa_install_result를 보낸다', async () => {
      const { usePWAInstall } = await import('./usePWAInstall.js')
      const { promptInstall } = usePWAInstall()
      const bip = new Event('beforeinstallprompt')
      bip.preventDefault = vi.fn()
      bip.prompt = vi.fn()
      bip.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(bip)
      await promptInstall()
      expect(window.gtag).toHaveBeenCalledWith('event', 'pwa_install_click', { platform: 'prompt' })
      expect(window.gtag).toHaveBeenCalledWith('event', 'pwa_install_result', { outcome: 'dismissed' })
    })

    it('appinstalled에서 pwa_installed를 보낸다', async () => {
      const { usePWAInstall } = await import('./usePWAInstall.js')
      usePWAInstall()
      window.dispatchEvent(new Event('appinstalled'))
      expect(window.gtag).toHaveBeenCalledWith('event', 'pwa_installed', {})
    })

    it('standalone 실행이면 pwa_launch_standalone을 한 번만 보낸다', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true })
      const { usePWAInstall } = await import('./usePWAInstall.js')
      usePWAInstall(); usePWAInstall()
      const calls = window.gtag.mock.calls.filter((c) => c[1] === 'pwa_launch_standalone')
      expect(calls).toHaveLength(1)
    })

    it('iPadOS 데스크톱 UA(터치 있음)도 iOS로 본다', async () => {
      const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari')
      const tp = vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5)
      const { isIOS } = await import('./usePWAInstall.js')
      expect(isIOS()).toBe(true)
      tp.mockReturnValue(0)
      expect(isIOS()).toBe(false)
      ua.mockRestore(); tp.mockRestore()
    })
  })
})
