import { assignIdentity, collectUsed, sanitizeIdentity, ADJ_COUNT, ANIMAL_COUNT, IDENTITY_COMBOS } from '../utils/identity';
import { DeviceInfo } from '../utils/deviceInfo';

const dev = (socketId: string, adj: number, animal: number, suffix?: number): DeviceInfo => ({
    socketId, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', deviceLabel: 'mac', joinedAt: 0,
    identity: { adj, animal, ...(suffix ? { suffix } : {}) },
});

describe('sanitizeIdentity', () => {
    it('유효한 인덱스만 통과시키고 suffix는 버린다', () => {
        expect(sanitizeIdentity({ adj: 3, animal: 5, suffix: 9 })).toEqual({ adj: 3, animal: 5 });
    });
    it.each([null, 'x', {}, { adj: -1, animal: 0 }, { adj: 0, animal: 24 }, { adj: 1.5, animal: 0 }, { adj: '1', animal: 0 }])(
        '잘못된 입력 %j는 null', (raw) => {
            expect(sanitizeIdentity(raw)).toBeNull();
        });
});

describe('assignIdentity', () => {
    it('저장된 조합이 비어 있으면 그대로 재사용한다', () => {
        expect(assignIdentity(new Set(), { adj: 2, animal: 7 })).toEqual({ adj: 2, animal: 7 });
    });

    it('같은 방에서 충돌하면 동물은 유지하고 형용사만 바꾼다', () => {
        const used = collectUsed([[dev('a', 2, 7)]], 'me');
        const got = assignIdentity(used, { adj: 2, animal: 7 });
        expect(got.animal).toBe(7);
        expect(got.adj).not.toBe(2);
        expect(got.suffix).toBeUndefined();
    });

    it('자기 자신이 쓰던 조합은 충돌로 보지 않는다', () => {
        const used = collectUsed([[dev('me', 2, 7)]], 'me');
        expect(assignIdentity(used, { adj: 2, animal: 7 })).toEqual({ adj: 2, animal: 7 });
    });

    it('두 방의 사용 현황을 모두 피한다', () => {
        const used = collectUsed([[dev('a', 0, 0)], [dev('b', 1, 0)]], 'me');
        for (let i = 0; i < 30; i++) {
            const got = assignIdentity(used, { adj: 0, animal: 0 });
            expect(got.animal).toBe(0);
            expect([0, 1]).not.toContain(got.adj);
        }
    });

    it('한 동물의 형용사가 모두 쓰이면 다른 동물로 넘어간다', () => {
        const devices = Array.from({ length: ADJ_COUNT }, (_, i) => dev(`s${i}`, i, 4));
        const got = assignIdentity(collectUsed([devices], 'me'), { adj: 0, animal: 4 });
        expect(got.animal).not.toBe(4);
    });

    it('576조합이 모두 쓰이면 접미 번호를 붙인다', () => {
        const devices: DeviceInfo[] = [];
        for (let a = 0; a < ADJ_COUNT; a++) for (let b = 0; b < ANIMAL_COUNT; b++) devices.push(dev(`s${a}-${b}`, a, b));
        expect(devices).toHaveLength(IDENTITY_COMBOS);
        const first = assignIdentity(collectUsed([devices], 'me'), null);
        expect(first.suffix).toBe(2);
        // 같은 조합에 이미 suffix 2가 있으면 3이 된다
        const used = collectUsed([[...devices, { ...dev('x', first.adj, first.animal, 2) }]], 'me');
        const again = assignIdentity(used, null, { rng: () => first.adj / ADJ_COUNT + 0.0001 });
        expect(again.suffix).toBeGreaterThanOrEqual(2);
    });

    it('avoid 조합은 피한다 (다시 뽑기)', () => {
        for (let i = 0; i < 50; i++) {
            const got = assignIdentity(new Set(), null, { avoid: { adj: 1, animal: 1 } });
            expect(got.adj === 1 && got.animal === 1).toBe(false);
        }
    });
});
