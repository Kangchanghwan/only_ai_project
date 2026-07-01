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

    it('매우 긴 비정상 User-Agent도 512자로 잘라 빠르게 처리해야 함 (ReDoS 방지)', () => {
        // "Android " 반복 + "Mobile" 토큰 없음: 절단 없이 정규식을 그대로 돌리면
        // MOBILE_UA의 Android.*Mobile 백트래킹으로 대량 입력에서 매칭이 느려질 수 있음.
        // 512자로 잘라내면 잘린 부분에도 여전히 "Android"만 있고 "Mobile"이 없으므로,
        // 잘려도 안 잘려도 판정 결과 자체는 동일(tablet/Unknown/Android) — 이 테스트는 그 결과가
        // 여전히 정확하면서도 빠르게(수 ms 내) 나오는지를 검증한다.
        const pathologicalUa = 'Android '.repeat(40000); // 약 320,000자

        const start = Date.now();
        const result = parseDeviceInfo(pathologicalUa, 'sock-9');
        const elapsedMs = Date.now() - start;

        expect(result).toEqual({
            socketId: 'sock-9',
            deviceType: 'tablet',
            browser: 'Unknown',
            os: 'Android'
        });
        expect(elapsedMs).toBeLessThan(100);
    });
});
