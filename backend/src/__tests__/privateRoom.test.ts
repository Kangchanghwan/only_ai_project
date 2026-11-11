import { newPrivateRoomId, newGroupRoomId, isGroupRoomId, isPrivateRoomId, hasPrivateRoomPrefix } from '../utils/privateRoom';

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

  test('그룹 방 ID: prv-g- + hex 24자, 1:1 형식과 구분된다', () => {
    const g = newGroupRoomId();
    expect(g).toMatch(/^prv-g-[0-9a-f]{24}$/);
    expect(newGroupRoomId()).not.toBe(g);
    expect(isGroupRoomId(g)).toBe(true);
    expect(isPrivateRoomId(g)).toBe(true);
    expect(hasPrivateRoomPrefix(g)).toBe(true);
    // 1:1 방은 그룹이 아니다
    expect(isGroupRoomId(newPrivateRoomId())).toBe(false);
    expect(isPrivateRoomId(newPrivateRoomId())).toBe(true);
  });

  test('그룹 방 ID 잘못된 형식은 거부', () => {
    expect(isGroupRoomId('prv-g-abc')).toBe(false);
    expect(isGroupRoomId('prv-g-' + 'A'.repeat(24))).toBe(false);
    expect(isGroupRoomId('prv-g-' + 'a'.repeat(25))).toBe(false);
    expect(isGroupRoomId('prv-g-' + 'a'.repeat(24) + '/x')).toBe(false);
    expect(isGroupRoomId('prv-x-' + 'a'.repeat(24))).toBe(false);
    expect(isPrivateRoomId('prv-g-g-' + 'a'.repeat(24))).toBe(false);
    expect(isGroupRoomId(undefined)).toBe(false);
  });
});
