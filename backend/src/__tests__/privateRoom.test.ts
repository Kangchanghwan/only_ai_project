import { newPrivateRoomId, isPrivateRoomId, hasPrivateRoomPrefix } from '../utils/privateRoom';

describe('privateRoom', () => {
  test('newPrivateRoomId는 prv- + 소문자 hex 24자이고 매번 다르다', () => {
    const a = newPrivateRoomId();
    const b = newPrivateRoomId();
    expect(a).toMatch(/^prv-[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });

  test('isPrivateRoomId는 형식이 정확할 때만 true', () => {
    expect(isPrivateRoomId(newPrivateRoomId())).toBe(true);
    expect(isPrivateRoomId('prv-abc')).toBe(false);
    expect(isPrivateRoomId('prv-' + 'A'.repeat(24))).toBe(false);
    expect(isPrivateRoomId('room-shared')).toBe(false);
    expect(isPrivateRoomId(undefined)).toBe(false);
  });

  test('hasPrivateRoomPrefix는 접두사만 본다', () => {
    expect(hasPrivateRoomPrefix('prv-abc')).toBe(true);
    expect(hasPrivateRoomPrefix('room-shared')).toBe(false);
    expect(hasPrivateRoomPrefix(5)).toBe(false);
  });
});
