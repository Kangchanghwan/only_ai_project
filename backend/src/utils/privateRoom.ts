import { randomBytes } from 'crypto';

/** 1:1 비공개 방 ID 접두사 */
export const PRIVATE_ROOM_PREFIX = 'prv-';

const PRIVATE_ROOM_RE = /^prv-[0-9a-f]{24}$/;

/** 새 비공개 방 ID: `prv-` + 소문자 hex 24자 (12바이트 무작위) */
export const newPrivateRoomId = (): string => `${PRIVATE_ROOM_PREFIX}${randomBytes(12).toString('hex')}`;

/** 비공개 방 ID 형식인지 */
export const isPrivateRoomId = (value: unknown): value is string =>
    typeof value === 'string' && PRIVATE_ROOM_RE.test(value);

/** 일반(비잠금) 업로드가 막아야 하는 roomId인지 — 접두사만 보고 판단해 우회 표기를 허용하지 않는다 */
export const hasPrivateRoomPrefix = (value: unknown): boolean =>
    typeof value === 'string' && value.startsWith(PRIVATE_ROOM_PREFIX);
