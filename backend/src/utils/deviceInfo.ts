export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/** 기기 라벨 키 (프론트 i18n 키와 1:1) */
export type DeviceLabel =
    | 'mac'
    | 'windows_pc'
    | 'iphone'
    | 'ipad'
    | 'android_phone'
    | 'android_tablet'
    | 'galaxy'
    | 'linux'
    | 'chromebook'
    | 'unknown';

/** 이름표에 쓰는 정체성: 형용사/동물 인덱스 + (조합이 모자랄 때만) 접미 번호 */
export interface Identity {
    adj: number;
    animal: number;
    suffix?: number;
}

export interface DeviceInfo {
    socketId: string;
    deviceType: DeviceType;
    browser: string;
    os: string;
    /** 기기 종류 라벨 키 */
    deviceLabel: DeviceLabel;
    /** 안드로이드 기종명 (sanitize됨, 있을 때만) */
    model?: string;
    /** 접속 시각 (epoch ms) */
    joinedAt: number;
    identity?: Identity;
}

/** 클라이언트가 접속 시 보내는 선택적 힌트 (신뢰하지 않고 sanitize한다) */
export interface ClientHints {
    model?: string;
    maxTouchPoints?: number;
}

const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i;
const MOBILE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|Mobi/i;

/** iPadOS 13+ Safari는 Macintosh UA를 보내므로 터치 지점 수 힌트로 iPad를 판별한다 */
function isIpadOsDesktopUa(ua: string, hints?: ClientHints): boolean {
    return /Macintosh/.test(ua) && (hints?.maxTouchPoints ?? 0) > 1;
}

function detectDeviceType(ua: string, ipad: boolean): DeviceType {
    if (ipad) return 'tablet';
    if (TABLET_UA.test(ua)) return 'tablet';
    if (MOBILE_UA.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua: string): string {
    // 인앱 브라우저·파생 브라우저를 Chrome/Safari보다 먼저 검사해야 한다
    if (/KAKAOTALK/i.test(ua)) return 'KakaoTalk';
    if (/NAVER\(/i.test(ua)) return 'Naver';
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook';
    if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
    if (/Whale\//.test(ua)) return 'Whale';
    if (/Edg\/|EdgA\/|EdgiOS\//.test(ua)) return 'Edge';
    if (/OPR\/|OPiOS\/|Opera/.test(ua)) return 'Opera';
    if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
    if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Unknown';
}

function detectOs(ua: string): string {
    // iOS UA 문자열은 "like Mac OS X"를 포함하므로, macOS보다 먼저 검사해야 함
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
}

const MAX_MODEL_LENGTH = 40;

/** 기종명 힌트 정리: 글자·숫자·공백·`. _ - +`만 남기고 40자로 자른다. 비면 undefined */
export function sanitizeModel(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const cleaned = raw
        .slice(0, 200)
        .replace(/[^\p{L}\p{N} ._+-]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_MODEL_LENGTH)
        .trim();
    return cleaned.length > 0 ? cleaned : undefined;
}

/** 힌트 객체 전체를 안전한 형태로 정리한다 (알 수 없는 입력은 빈 힌트) */
export function sanitizeHints(raw: unknown): ClientHints {
    if (!raw || typeof raw !== 'object') return {};
    const { model, maxTouchPoints } = raw as Record<string, unknown>;
    const hints: ClientHints = {};
    const m = sanitizeModel(model);
    if (m) hints.model = m;
    if (typeof maxTouchPoints === 'number' && Number.isFinite(maxTouchPoints)) {
        hints.maxTouchPoints = Math.max(0, Math.min(Math.floor(maxTouchPoints), 100));
    }
    return hints;
}

/** UA의 `Android 10; SM-G991N` 부분에서 기종을 뽑는다. Chrome UA 축소("K")는 무시 */
function modelFromUa(ua: string): string | undefined {
    const m = /Android [\d.]+; ([^;)]+)/.exec(ua);
    const model = sanitizeModel(m?.[1]);
    if (!model || model === 'K' || /^(Android|Mobile|Linux)$/i.test(model)) return undefined;
    return model;
}

function detectDeviceLabel(ua: string, deviceType: DeviceType, os: string, ipad: boolean, model?: string): DeviceLabel {
    if (ipad || /iPad/.test(ua)) return 'ipad';
    if (/iPhone|iPod/.test(ua)) return 'iphone';
    if (os === 'Android') {
        if (deviceType === 'tablet') return 'android_tablet';
        if (model && /^(SM-|Galaxy)/i.test(model)) return 'galaxy';
        return 'android_phone';
    }
    if (os === 'ChromeOS') return 'chromebook';
    if (os === 'macOS') return 'mac';
    if (os === 'Windows') return 'windows_pc';
    if (os === 'Linux') return 'linux';
    return 'unknown';
}

/** 실제 User-Agent는 길어야 수백 자이므로, 비정상적으로 긴 입력에서 정규식이 느려지는 것을 막기 위해 앞부분만 사용한다 */
const MAX_UA_LENGTH = 512;

/** 소켓 핸드셰이크의 User-Agent(+선택 힌트)를 가볍게 파싱해 기기 정보를 만든다 (외부 의존성 없음) */
export function parseDeviceInfo(userAgent: string | undefined, socketId: string, hints?: ClientHints): DeviceInfo {
    const joinedAt = Date.now();
    if (!userAgent) {
        return { socketId, deviceType: 'desktop', browser: 'Unknown', os: 'Unknown', deviceLabel: 'unknown', joinedAt };
    }
    userAgent = userAgent.slice(0, MAX_UA_LENGTH);
    const ipad = isIpadOsDesktopUa(userAgent, hints);
    const os = ipad ? 'iOS' : detectOs(userAgent);
    const deviceType = detectDeviceType(userAgent, ipad);
    const model = os === 'Android' ? hints?.model ?? modelFromUa(userAgent) : undefined;
    const info: DeviceInfo = {
        socketId,
        deviceType,
        browser: detectBrowser(userAgent),
        os,
        deviceLabel: detectDeviceLabel(userAgent, deviceType, os, ipad, model),
        joinedAt,
    };
    if (model) info.model = model;
    return info;
}
