import { buildSnapshot, resetRevs, bumpRev, currentRev, parseFindQuery, findDevice, allowFind, ROSTER_RECENT } from '../utils/roster';
import type { DeviceInfo } from '../utils/deviceInfo';

const dev = (i: number, extra: Partial<DeviceInfo> = {}): DeviceInfo => ({
  socketId: `s${i}`, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', deviceLabel: 'mac', joinedAt: i, ...extra,
} as DeviceInfo);
const many = (n: number) => Array.from({ length: n }, (_, i) => dev(i));

describe('roster 순수 함수', () => {
  beforeEach(() => resetRevs());

  test('50대 이하 전체 공유 방은 전체·truncated false', () => {
    const s = buildSnapshot('room-shared', many(50), 's0');
    expect(s).toMatchObject({ total: 50, truncated: false });
    expect(s.devices).toHaveLength(50);
  });
  test('51대면 최근 20대 + 빠진 자기 기기', () => {
    const s = buildSnapshot('room-shared', many(51), 's0');
    expect(s.truncated).toBe(true);
    expect(s.total).toBe(51);
    expect(s.devices).toHaveLength(ROSTER_RECENT + 1);
    expect(s.devices[0].socketId).toBe('s50');
    expect(s.devices[s.devices.length - 1].socketId).toBe('s0');
  });
  test('자기 기기가 최근 20대 안이면 중복 없이 20대', () => {
    expect(buildSnapshot('room-shared', many(51), 's50').devices).toHaveLength(20);
  });
  test('ip 방은 51대라도 전체', () => {
    const s = buildSnapshot('room-ip-x', many(51), 's0');
    expect(s.truncated).toBe(false);
    expect(s.devices).toHaveLength(51);
  });
  test('rev는 방별로 1씩 증가', () => {
    expect(bumpRev('a')).toBe(1);
    expect(bumpRev('a')).toBe(2);
    expect(bumpRev('b')).toBe(1);
    expect(currentRev('a')).toBe(2);
  });
  test('parseFindQuery 검증', () => {
    expect(parseFindQuery({ adj: 0, animal: 23 })).toEqual({ adj: 0, animal: 23 });
    expect(parseFindQuery({ adj: 1, animal: 1, suffix: 2 })).toEqual({ adj: 1, animal: 1, suffix: 2 });
    for (const bad of [null, {}, { adj: 24, animal: 0 }, { adj: 0, animal: -1 }, { adj: 0.5, animal: 0 }, { adj: 0, animal: 0, suffix: 1 }, { adj: 0, animal: 0, suffix: 1000 }]) {
      expect(parseFindQuery(bad)).toBeNull();
    }
  });
  test('findDevice: 일치·자기 제외·번호 구분', () => {
    const list = [dev(1, { identity: { adj: 1, animal: 2 } }), dev(2, { identity: { adj: 1, animal: 2, suffix: 3 } })];
    expect(findDevice(list, { adj: 1, animal: 2 }, 'x')?.socketId).toBe('s1');
    expect(findDevice(list, { adj: 1, animal: 2, suffix: 3 }, 'x')?.socketId).toBe('s2');
    expect(findDevice(list, { adj: 1, animal: 2 }, 's1')).toBeUndefined();
  });
  test('allowFind: 11번째는 거절, 60초 뒤 허용', () => {
    const hits: number[] = [];
    for (let i = 0; i < 10; i++) expect(allowFind(hits, 1000)).toBe(true);
    expect(allowFind(hits, 1000)).toBe(false);
    expect(allowFind(hits, 61_000)).toBe(true);
  });
});
