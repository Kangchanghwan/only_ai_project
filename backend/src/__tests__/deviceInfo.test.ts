import { parseDeviceInfo } from '../utils/deviceInfo';

describe('parseDeviceInfo', () => {
    it('iPhone Safari를 모바일/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-1')).toMatchObject({
            socketId: 'sock-1',
            deviceType: 'mobile',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('iPad Safari를 태블릿/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-2')).toMatchObject({
            socketId: 'sock-2',
            deviceType: 'tablet',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('Android 폰 Chrome을 모바일/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-3')).toMatchObject({
            socketId: 'sock-3',
            deviceType: 'mobile',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Android 태블릿 Chrome을 태블릿/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-4')).toMatchObject({
            socketId: 'sock-4',
            deviceType: 'tablet',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Windows Chrome 데스크톱을 데스크톱/Chrome/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-5')).toMatchObject({
            socketId: 'sock-5',
            deviceType: 'desktop',
            browser: 'Chrome',
            os: 'Windows'
        });
    });

    it('Mac Firefox 데스크톱을 데스크톱/Firefox/macOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0';
        expect(parseDeviceInfo(ua, 'sock-6')).toMatchObject({
            socketId: 'sock-6',
            deviceType: 'desktop',
            browser: 'Firefox',
            os: 'macOS'
        });
    });

    it('Windows Edge 데스크톱을 데스크톱/Edge/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
        expect(parseDeviceInfo(ua, 'sock-7')).toMatchObject({
            socketId: 'sock-7',
            deviceType: 'desktop',
            browser: 'Edge',
            os: 'Windows'
        });
    });

    it('User-Agent가 없으면 desktop/Unknown/Unknown을 반환해야 함', () => {
        expect(parseDeviceInfo(undefined, 'sock-8')).toMatchObject({
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

        expect(result).toMatchObject({
            socketId: 'sock-9',
            deviceType: 'tablet',
            browser: 'Unknown',
            os: 'Android'
        });
        expect(elapsedMs).toBeLessThan(100);
    });
});

import { sanitizeModel, sanitizeHints } from '../utils/deviceInfo';

describe('parseDeviceInfo - 기기 라벨/브라우저 확장', () => {
    const parse = (ua: string, hints?: Parameters<typeof parseDeviceInfo>[2]) => parseDeviceInfo(ua, 's', hints);

    it('삼성 인터넷', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
        expect(parse(ua)).toMatchObject({ browser: 'Samsung Internet', deviceLabel: 'galaxy', model: 'SM-S918N', os: 'Android' });
    });

    it('네이버 웨일', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Whale/3.24.223.18 Safari/537.36';
        expect(parse(ua)).toMatchObject({ browser: 'Whale', deviceLabel: 'windows_pc' });
    });

    it('카카오톡 인앱 (iOS)', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.3';
        expect(parse(ua)).toMatchObject({ browser: 'KakaoTalk', deviceLabel: 'iphone', os: 'iOS' });
    });

    it('카카오톡 인앱 (Android)이 Chrome으로 오인되지 않는다', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.4.3';
        expect(parse(ua).browser).toBe('KakaoTalk');
    });

    it('네이버 앱 인앱', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.0.0)';
        expect(parse(ua).browser).toBe('Naver');
    });

    it('Instagram / Facebook 인앱', () => {
        expect(parse('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0').browser).toBe('Instagram');
        expect(parse('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]').browser).toBe('Facebook');
    });

    it('iPadOS Safari(Macintosh UA)는 터치 힌트가 있으면 iPad', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
        expect(parse(ua, { maxTouchPoints: 5 })).toMatchObject({ deviceLabel: 'ipad', deviceType: 'tablet', os: 'iOS' });
        expect(parse(ua)).toMatchObject({ deviceLabel: 'mac', deviceType: 'desktop', os: 'macOS' });
        expect(parse(ua, { maxTouchPoints: 0 }).deviceLabel).toBe('mac');
    });

    it('안드로이드 기종: 힌트가 UA보다 우선, Chrome 축소 UA("K")는 무시', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        expect(parse(ua)).toMatchObject({ deviceLabel: 'android_phone' });
        expect(parse(ua).model).toBeUndefined();
        expect(parse(ua, { model: 'Pixel 8 Pro' })).toMatchObject({ deviceLabel: 'android_phone', model: 'Pixel 8 Pro' });
        expect(parse(ua, { model: 'SM-A546N' })).toMatchObject({ deviceLabel: 'galaxy' });
    });

    it('Android 태블릿 / Chromebook / Linux', () => {
        expect(parse('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36').deviceLabel).toBe('android_tablet');
        expect(parse('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36').deviceLabel).toBe('chromebook');
        expect(parse('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36').deviceLabel).toBe('linux');
    });

    it('Mac / Edge / Opera / Firefox / Safari', () => {
        expect(parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0')).toMatchObject({ browser: 'Opera', deviceLabel: 'mac' });
        expect(parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15').browser).toBe('Safari');
        expect(parse('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 FxiOS/124.0 Mobile/15E148 Safari/605.1.15').browser).toBe('Firefox');
    });
});

describe('힌트 sanitize', () => {
    it('model: 허용 문자만 남기고 40자로 자른다', () => {
        expect(sanitizeModel('Pixel 8 <script>alert(1)</script>')).toBe('Pixel 8 scriptalert1script');
        expect(sanitizeModel('A'.repeat(100))).toHaveLength(40);
        expect(sanitizeModel('SM-G991N')).toBe('SM-G991N');
        expect(sanitizeModel('갤럭시 S24')).toBe('갤럭시 S24');
    });
    it('model: 문자열이 아니거나 비면 undefined', () => {
        expect(sanitizeModel(123)).toBeUndefined();
        expect(sanitizeModel('<>{}')).toBeUndefined();
        expect(sanitizeModel({})).toBeUndefined();
    });
    it('sanitizeHints: 알 수 없는 입력은 빈 힌트, 터치 수는 0..100으로 제한', () => {
        expect(sanitizeHints(null)).toEqual({});
        expect(sanitizeHints('x')).toEqual({});
        expect(sanitizeHints({ model: 'Pixel 7', maxTouchPoints: 9999, evil: 1 })).toEqual({ model: 'Pixel 7', maxTouchPoints: 100 });
        expect(sanitizeHints({ maxTouchPoints: -3 })).toEqual({ maxTouchPoints: 0 });
        expect(sanitizeHints({ maxTouchPoints: NaN })).toEqual({});
    });
});
