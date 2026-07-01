import { parseDeviceInfo } from '../utils/deviceInfo';

describe('parseDeviceInfo', () => {
    it('iPhone Safari를 모바일/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-1')).toEqual({
            socketId: 'sock-1',
            deviceType: 'mobile',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('iPad Safari를 태블릿/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-2')).toEqual({
            socketId: 'sock-2',
            deviceType: 'tablet',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('Android 폰 Chrome을 모바일/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-3')).toEqual({
            socketId: 'sock-3',
            deviceType: 'mobile',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Android 태블릿 Chrome을 태블릿/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-4')).toEqual({
            socketId: 'sock-4',
            deviceType: 'tablet',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Windows Chrome 데스크톱을 데스크톱/Chrome/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-5')).toEqual({
            socketId: 'sock-5',
            deviceType: 'desktop',
            browser: 'Chrome',
            os: 'Windows'
        });
    });

    it('Mac Firefox 데스크톱을 데스크톱/Firefox/macOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0';
        expect(parseDeviceInfo(ua, 'sock-6')).toEqual({
            socketId: 'sock-6',
            deviceType: 'desktop',
            browser: 'Firefox',
            os: 'macOS'
        });
    });

    it('Windows Edge 데스크톱을 데스크톱/Edge/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
        expect(parseDeviceInfo(ua, 'sock-7')).toEqual({
            socketId: 'sock-7',
            deviceType: 'desktop',
            browser: 'Edge',
            os: 'Windows'
        });
    });

    it('User-Agent가 없으면 desktop/Unknown/Unknown을 반환해야 함', () => {
        expect(parseDeviceInfo(undefined, 'sock-8')).toEqual({
            socketId: 'sock-8',
            deviceType: 'desktop',
            browser: 'Unknown',
            os: 'Unknown'
        });
    });
});
