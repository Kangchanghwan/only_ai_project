import type { Identity, DeviceInfo } from './deviceInfo';

/** 형용사/동물 각 24개 → 576 조합. 프론트의 인덱스 순서와 반드시 같아야 한다 */
export const ADJ_COUNT = 24;
export const ANIMAL_COUNT = 24;
export const IDENTITY_COMBOS = ADJ_COUNT * ANIMAL_COUNT;

/** 다시 뽑기 쿨다운 (소켓당) */
export const REROLL_COOLDOWN_MS = 3000;

const isIndex = (v: unknown, max: number): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max;

/** 클라이언트가 저장해 둔 {adj, animal}을 검증한다. 형식이 틀리면 null (suffix는 신뢰하지 않음) */
export function sanitizeIdentity(raw: unknown): Identity | null {
    if (!raw || typeof raw !== 'object') return null;
    const { adj, animal } = raw as Record<string, unknown>;
    if (!isIndex(adj, ADJ_COUNT) || !isIndex(animal, ANIMAL_COUNT)) return null;
    return { adj, animal };
}

const comboKey = (adj: number, animal: number, suffix?: number): string => `${adj}:${animal}:${suffix ?? 0}`;

/** 같은 방들에서 이미 쓰는 조합 키 집합 (자기 자신 제외) */
export function collectUsed(devicesPerRoom: DeviceInfo[][], selfSocketId: string): Set<string> {
    const used = new Set<string>();
    for (const devices of devicesPerRoom) {
        for (const d of devices) {
            if (d.socketId === selfSocketId || !d.identity) continue;
            used.add(comboKey(d.identity.adj, d.identity.animal, d.identity.suffix));
        }
    }
    return used;
}

type Rng = () => number;
const randInt = (n: number, rng: Rng) => Math.min(n - 1, Math.floor(rng() * n));

/** 접미 번호 없이 쓸 수 있는 조합이 하나라도 남았는지 */
const baseFree = (adj: number, animal: number, used: Set<string>) => !used.has(comboKey(adj, animal));

/**
 * 정체성을 할당한다.
 * 1) 선호 조합(저장된 값)이 비어 있으면 그대로
 * 2) 충돌하면 동물은 유지하고 형용사만 바꿈
 * 3) 그것도 안 되면 아무 빈 조합
 * 4) 576개가 모두 사용 중이면 접미 번호(2, 3, ...)를 붙임
 *
 * `avoid`가 주어지면 그 조합은 피한다 (다시 뽑기용).
 */
export function assignIdentity(
    used: Set<string>,
    preferred: Identity | null,
    opts: { avoid?: Identity; rng?: Rng } = {}
): Identity {
    const rng = opts.rng ?? Math.random;
    const avoid = opts.avoid;
    const isAvoided = (adj: number, animal: number) => !!avoid && avoid.adj === adj && avoid.animal === animal;
    const ok = (adj: number, animal: number) => baseFree(adj, animal, used) && !isAvoided(adj, animal);

    if (preferred && ok(preferred.adj, preferred.animal)) {
        return { adj: preferred.adj, animal: preferred.animal };
    }

    if (preferred) {
        const start = randInt(ADJ_COUNT, rng);
        for (let i = 0; i < ADJ_COUNT; i++) {
            const adj = (start + i) % ADJ_COUNT;
            if (ok(adj, preferred.animal)) return { adj, animal: preferred.animal };
        }
    }

    const startA = randInt(IDENTITY_COMBOS, rng);
    for (let i = 0; i < IDENTITY_COMBOS; i++) {
        const idx = (startA + i) % IDENTITY_COMBOS;
        const adj = Math.floor(idx / ANIMAL_COUNT);
        const animal = idx % ANIMAL_COUNT;
        if (ok(adj, animal)) return { adj, animal };
    }

    // 모든 기본 조합이 사용 중: 접미 번호로 구분한다
    const adj = randInt(ADJ_COUNT, rng);
    const animal = randInt(ANIMAL_COUNT, rng);
    for (let suffix = 2; ; suffix++) {
        if (!used.has(comboKey(adj, animal, suffix))) return { adj, animal, suffix };
    }
}
