/**
 * 파일 업로더 기록 (서버 메모리). key = `${roomId}/${fileName}` → 보낸 사람 스냅샷.
 * 24시간 뒤 만료되며, 파일 삭제/룸 정리 시 제거한다. 서버 재시작 시 사라지는 것이 정상이며
 * 그 경우 프론트는 보낸 사람 표시를 생략한다.
 */
import type { Identity, DeviceLabel } from './deviceInfo';

/** 서버가 붙이는 보낸 사람 정보 */
export interface Sender {
    socketId: string;
    identity?: Identity;
    deviceLabel: DeviceLabel;
    browser: string;
    model?: string;
}

interface Entry {
    sender: Sender;
    at: number;
}

export const UPLOADER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20000;

const entries = new Map<string, Entry>();

const keyOf = (roomId: string, fileName: string) => `${roomId}/${fileName}`;

export function recordUploader(roomId: string, fileName: string, sender: Sender, now: number = Date.now()): void {
    if (entries.size >= MAX_ENTRIES) sweepExpired(now);
    if (entries.size >= MAX_ENTRIES) {
        // 여전히 가득하면 가장 오래된 것부터 버린다 (Map은 삽입 순서 유지)
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
    }
    entries.delete(keyOf(roomId, fileName));
    entries.set(keyOf(roomId, fileName), { sender, at: now });
}

export function getUploader(roomId: string, fileName: string, now: number = Date.now()): Sender | undefined {
    const key = keyOf(roomId, fileName);
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (now - entry.at > UPLOADER_TTL_MS) {
        entries.delete(key);
        return undefined;
    }
    return entry.sender;
}

export function deleteUploader(roomId: string, fileName: string): void {
    entries.delete(keyOf(roomId, fileName));
}

export function deleteUploadersForRoom(roomId: string): void {
    const prefix = `${roomId}/`;
    for (const key of Array.from(entries.keys())) {
        if (key.startsWith(prefix)) entries.delete(key);
    }
}

export function sweepExpired(now: number = Date.now()): void {
    for (const [key, entry] of entries) {
        if (now - entry.at > UPLOADER_TTL_MS) entries.delete(key);
    }
}

/** 테스트용 */
export function resetUploaders(): void {
    entries.clear();
}

/** 소켓의 기기 정보에서 공개해도 되는 보낸 사람 스냅샷을 만든다 */
export function toSender(device: {
    socketId: string;
    identity?: Identity;
    deviceLabel: DeviceLabel;
    browser: string;
    model?: string;
}): Sender {
    const sender: Sender = {
        socketId: device.socketId,
        deviceLabel: device.deviceLabel,
        browser: device.browser,
    };
    if (device.identity) sender.identity = device.identity;
    if (device.model) sender.model = device.model;
    return sender;
}
