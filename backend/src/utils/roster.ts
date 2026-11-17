import type { DeviceInfo } from './deviceInfo';
import { ADJ_COUNT, ANIMAL_COUNT } from './identity';

/** 전체 공유 방 기준 인원이 넘으면 최근 접속 기기만 보낸다 (env로 조정, 테스트용) */
export const getRosterFullMax = (): number => {
    const n = Number.parseInt(process.env.ROSTER_FULL_MAX ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : 50;
};
export const ROSTER_RECENT = 20;
export const FIND_LIMIT_PER_MIN = 10;
export const FIND_WINDOW_MS = 60_000;

export const SHARED_ROOM = 'room-shared';

export interface RosterSnapshot {
    roomId: string;
    rev: number;
    total: number;
    truncated: boolean;
    devices: DeviceInfo[];
}

// === 방별 순번 ===
const revs = new Map<string, number>();
export const currentRev = (roomId: string): number => revs.get(roomId) ?? 0;
export const bumpRev = (roomId: string): number => {
    const next = currentRev(roomId) + 1;
    revs.set(roomId, next);
    return next;
};
export const dropRev = (roomId: string): void => { revs.delete(roomId); };
export const resetRevs = (): void => { revs.clear(); };

/** 방 전체 명단에서 요청 기기에 맞는 스냅샷을 만든다 */
export const buildSnapshot = (roomId: string, devices: DeviceInfo[], selfSocketId?: string): RosterSnapshot => {
    const total = devices.length;
    const rev = currentRev(roomId);
    if (roomId !== SHARED_ROOM || total <= getRosterFullMax()) {
        return { roomId, rev, total, truncated: false, devices };
    }
    const recent = [...devices].sort((a, b) => b.joinedAt - a.joinedAt).slice(0, ROSTER_RECENT);
    if (selfSocketId && !recent.some((d) => d.socketId === selfSocketId)) {
        const me = devices.find((d) => d.socketId === selfSocketId);
        if (me) recent.push(me);
    }
    return { roomId, rev, total, truncated: true, devices: recent };
};

// === 이름으로 찾기 ===
export interface FindQuery { adj: number; animal: number; suffix?: number }

export const parseFindQuery = (raw: unknown): FindQuery | null => {
    if (!raw || typeof raw !== 'object') return null;
    const { adj, animal, suffix } = raw as Record<string, unknown>;
    const idx = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max;
    if (!idx(adj, ADJ_COUNT) || !idx(animal, ANIMAL_COUNT)) return null;
    if (suffix !== undefined && suffix !== null) {
        if (typeof suffix !== 'number' || !Number.isInteger(suffix) || suffix < 2 || suffix > 999) return null;
        return { adj: adj as number, animal: animal as number, suffix };
    }
    return { adj: adj as number, animal: animal as number };
};

export const findDevice = (devices: DeviceInfo[], q: FindQuery, selfSocketId: string): DeviceInfo | undefined =>
    devices.find((d) =>
        d.socketId !== selfSocketId &&
        d.identity?.adj === q.adj &&
        d.identity?.animal === q.animal &&
        (d.identity?.suffix ?? undefined) === q.suffix
    );

/** 최근 windowMs 안 limit회까지 허용하는 슬라이딩 윈도우 */
export const allowFind = (hits: number[], now: number = Date.now()): boolean => {
    while (hits.length && now - hits[0] >= FIND_WINDOW_MS) hits.shift();
    if (hits.length >= FIND_LIMIT_PER_MIN) return false;
    hits.push(now);
    return true;
};
