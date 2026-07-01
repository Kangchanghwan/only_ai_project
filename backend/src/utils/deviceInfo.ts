export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
    socketId: string;
    deviceType: DeviceType;
    browser: string;
    os: string;
}

const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i;
const MOBILE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|Mobi/i;

function detectDeviceType(ua: string): DeviceType {
    if (TABLET_UA.test(ua)) return 'tablet';
    if (MOBILE_UA.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua: string): string {
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return 'Unknown';
}

function detectOs(ua: string): string {
    // iOS UA 문자열은 "like Mac OS X"를 포함하므로, macOS보다 먼저 검사해야 함
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
}

/** 소켓 핸드셰이크의 User-Agent를 가볍게 파싱해 기기 정보를 만든다 (외부 의존성 없음) */
export function parseDeviceInfo(userAgent: string | undefined, socketId: string): DeviceInfo {
    if (!userAgent) {
        return { socketId, deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' };
    }
    return {
        socketId,
        deviceType: detectDeviceType(userAgent),
        browser: detectBrowser(userAgent),
        os: detectOs(userAgent)
    };
}
