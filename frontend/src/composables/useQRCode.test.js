import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR')
  }
}))

describe('useQRCode.generateQRCodeForUrl', () => {
  beforeEach(() => {
    global.gtag = vi.fn()
    vi.clearAllMocks()
  })

  it('주어진 URL로 dataURL을 생성하고 qrCodeDataUrl에 저장한다', async () => {
    const { useQRCode } = await import('./useQRCode')
    const QRCode = (await import('qrcode')).default
    const qr = useQRCode()

    const res = await qr.generateQRCodeForUrl('https://example.com/')

    expect(res.success).toBe(true)
    expect(res.dataUrl).toContain('data:image/png')
    expect(qr.qrCodeDataUrl.value).toContain('data:image/png')
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ errorCorrectionLevel: 'H' })
    )
  })

  it('컴포저블을 만들거나 QR을 그리는 것만으로는 분석 이벤트를 보내지 않는다 (페이지 뷰마다 쌓이던 버그)', async () => {
    window.gtag = vi.fn()
    const { useQRCode } = await import('./useQRCode')
    const qr = useQRCode()
    await qr.generateQRCodeForUrl('https://example.com/')

    expect(window.gtag).not.toHaveBeenCalled()
    expect(global.gtag).not.toHaveBeenCalled()
    delete window.gtag
  })

  it('빈 URL이면 실패를 반환한다', async () => {
    const { useQRCode } = await import('./useQRCode')
    const qr = useQRCode()

    const res = await qr.generateQRCodeForUrl('')

    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('생성 중 예외가 나면 실패를 반환한다', async () => {
    const QRCode = (await import('qrcode')).default
    QRCode.toDataURL.mockRejectedValueOnce(new Error('boom'))
    const { useQRCode } = await import('./useQRCode')
    const qr = useQRCode()

    const res = await qr.generateQRCodeForUrl('https://example.com/')

    expect(res.success).toBe(false)
  })
})
