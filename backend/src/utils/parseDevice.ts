import { UAParser } from 'ua-parser-js';
import { DeviceInfo } from '../types';

/**
 * User-Agent 문자열을 파싱하여 디바이스 정보를 추출합니다.
 * @param userAgent - User-Agent 헤더 문자열
 * @param socketId - 소켓 ID
 * @returns DeviceInfo 객체
 */
export function parseDevice(userAgent: string | undefined, socketId: string): DeviceInfo {
    const parser = new UAParser(userAgent || '');
    const result = parser.getResult();

    return {
        socketId,
        deviceType: result.device.type || 'desktop',
        os: result.os.name ? `${result.os.name} ${result.os.version || ''}`.trim() : 'Unknown',
        browser: result.browser.name ? `${result.browser.name} ${result.browser.version || ''}`.trim() : 'Unknown',
        joinedAt: new Date(),
    };
}
