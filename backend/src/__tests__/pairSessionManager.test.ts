import {
  PairSessionManager,
  INVITE_TTL_MS,
  CONFIRM_TTL_MS,
  DECLINE_COOLDOWN_MS,
  MAX_PENDING_INVITES,
} from '../managers/PairSessionManager';

describe('PairSessionManager', () => {
  let t: number;
  let m: PairSessionManager;
  const ok = { targetConnected: true, alreadyPaired: false };
  beforeEach(() => {
    t = 1_000_000;
    m = new PairSessionManager(() => t);
  });

  const invite = (a: string, b: string, ctx = ok) => {
    const r = m.invite(a, b, ctx);
    if (!r.ok) throw new Error(r.code);
    return r.session;
  };

  test('세션 id는 16B hex, 초기 상태는 invited, 만료 60초', () => {
    const s = invite('A', 'B');
    expect(s.id).toMatch(/^[0-9a-f]{32}$/);
    expect(s.state).toBe('invited');
    expect(s.expiresAt).toBe(t + INVITE_TTL_MS);
  });

  test('SELF / TARGET_NOT_FOUND / ALREADY_PAIRED', () => {
    expect(m.invite('A', 'A', ok)).toEqual({ ok: false, code: 'SELF' });
    expect(m.invite('A', 'B', { targetConnected: false, alreadyPaired: false })).toEqual({ ok: false, code: 'TARGET_NOT_FOUND' });
    expect(m.invite('A', 'B', { targetConnected: true, alreadyPaired: true })).toEqual({ ok: false, code: 'ALREADY_PAIRED' });
  });

  test('동시 요청 상한 3개, 같은 상대 중복 요청은 막는다', () => {
    for (let i = 0; i < MAX_PENDING_INVITES; i++) invite('A', `T${i}`);
    expect(m.invite('A', 'T9', ok)).toEqual({ ok: false, code: 'TOO_MANY' });
    expect(m.invite('A', 'T0', ok)).toEqual({ ok: false, code: 'TOO_MANY' });
    // 다른 요청자는 영향 없음
    expect(m.invite('Z', 'T9', ok).ok).toBe(true);
  });

  test('수락 후 확인 만료 2분, 요청 만료 60초', () => {
    const s = invite('A', 'B');
    const acc = m.respond(s.id, 'B', true)!;
    expect(acc.state).toBe('accepted');
    expect(acc.expiresAt).toBe(t + CONFIRM_TTL_MS);
    const s2 = invite('A', 'C');
    t += INVITE_TTL_MS - 1;
    expect(m.expireDue()).toEqual([]);
    t += 1;
    expect(m.expireDue().map((x) => x.id)).toEqual([s2.id]);
    t += CONFIRM_TTL_MS;
    expect(m.expireDue().map((x) => x.id)).toEqual([s.id]);
    expect(m.size()).toBe(0);
  });

  test('거절 후 30초 쿨다운(요청자-대상 쌍 기준)', () => {
    const s = invite('A', 'B');
    expect(m.respond(s.id, 'B', false)).not.toBeNull();
    expect(m.get(s.id)).toBeUndefined();
    expect(m.invite('A', 'B', ok)).toEqual({ ok: false, code: 'COOLDOWN' });
    expect(m.invite('A', 'C', ok).ok).toBe(true);
    expect(m.invite('C', 'B', ok).ok).toBe(true);
    t += DECLINE_COOLDOWN_MS;
    expect(m.invite('A', 'B', ok).ok).toBe(true);
  });

  test('block=true로 거절하면 이후 초대는 BLOCKED, 대상이 나가면 해제', () => {
    const s = invite('A', 'B');
    m.respond(s.id, 'B', false, true);
    t += DECLINE_COOLDOWN_MS * 10;
    expect(m.invite('A', 'B', ok)).toEqual({ ok: false, code: 'BLOCKED' });
    m.removeBySocket('B');
    expect(m.invite('A', 'B', ok).ok).toBe(true);
  });

  test('응답은 대상 본인만, invited 상태에서만', () => {
    const s = invite('A', 'B');
    expect(m.respond(s.id, 'A', true)).toBeNull();
    expect(m.respond('nope', 'B', true)).toBeNull();
    m.respond(s.id, 'B', true);
    expect(m.respond(s.id, 'B', true)).toBeNull();
  });

  test('confirm: 둘 다 true면 done, 하나라도 false면 mismatch, 비멤버·invited는 invalid', () => {
    const s = invite('A', 'B');
    expect(m.confirm(s.id, 'A', true).status).toBe('invalid'); // 아직 invited
    m.respond(s.id, 'B', true);
    expect(m.confirm(s.id, 'X', true).status).toBe('invalid');
    expect(m.confirm(s.id, 'A', true).status).toBe('waiting');
    expect(m.confirm(s.id, 'B', true).status).toBe('done');
    expect(m.get(s.id)).toBeUndefined();

    const s2 = invite('A', 'C');
    m.respond(s2.id, 'C', true);
    m.confirm(s2.id, 'A', true);
    expect(m.confirm(s2.id, 'C', false).status).toBe('mismatch');
    expect(m.get(s2.id)).toBeUndefined();
  });

  test('cancel은 멤버만, removeBySocket은 그 소켓의 세션을 모두 제거', () => {
    const s = invite('A', 'B');
    expect(m.cancel(s.id, 'X')).toBeNull();
    expect(m.cancel(s.id, 'B')?.id).toBe(s.id);
    const s1 = invite('A', 'C');
    const s2 = invite('D', 'A');
    expect(m.removeBySocket('A').map((x) => x.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(m.size()).toBe(0);
  });
});
