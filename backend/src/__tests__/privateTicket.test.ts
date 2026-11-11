import { issueTicket, verifyTicket, getPrivateInviteTtlSec } from '../utils/privateTicket';
import { newPrivateRoomId, newGroupRoomId } from '../utils/privateRoom';

describe('privateTicket', () => {
  const room = newPrivateRoomId();
  const now = 1_800_000_000;

  test('발급 후 검증 성공, 30일 만료', () => {
    const t = issueTicket(room, now);
    expect(t.startsWith(`pv1.${room}.`)).toBe(true);
    const v = verifyTicket(t, now + 10);
    expect(v).toEqual({ ok: true, roomId: room, exp: now + 30 * 24 * 3600 });
  });
  test('만료', () => {
    const t = issueTicket(room, now);
    expect(verifyTicket(t, now + 30 * 24 * 3600)).toEqual({ ok: false, reason: 'expired' });
  });
  test('변조(만료 연장, 서명, 다른 방)', () => {
    const [p, r, e, sig] = issueTicket(room, now).split('.');
    expect(verifyTicket([p, r, String(Number(e) + 99999), sig].join('.'), now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyTicket([p, r, e, sig.slice(0, -2) + 'AA'].join('.'), now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyTicket([p, newPrivateRoomId(), e, sig].join('.'), now)).toEqual({ ok: false, reason: 'invalid' });
  });
  test('잘못된 접두사·형식', () => {
    const t = issueTicket(room, now);
    expect(verifyTicket(t.replace('pv1', 'pv2'), now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyTicket('x', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyTicket(123 as any, now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyTicket(`pv1.room-shared.${now + 5}.abc`, now)).toEqual({ ok: false, reason: 'malformed' });
  });

  test('그룹 방 입장권: ttl 지정, 만료 후 expired, 형식은 같다', () => {
    const g = newGroupRoomId();
    const t = issueTicket(g, now, 600);
    expect(t.startsWith(`pv1.${g}.`)).toBe(true);
    expect(verifyTicket(t, now + 599)).toEqual({ ok: true, roomId: g, exp: now + 600 });
    expect(verifyTicket(t, now + 600)).toEqual({ ok: false, reason: 'expired' });
    expect(t.length).toBeLessThanOrEqual(200);
  });

  test('초대 입장권 기본 만료 600초, env PRIVATE_INVITE_TTL_SEC로 조정', () => {
    const prev = process.env.PRIVATE_INVITE_TTL_SEC;
    delete process.env.PRIVATE_INVITE_TTL_SEC;
    expect(getPrivateInviteTtlSec()).toBe(600);
    process.env.PRIVATE_INVITE_TTL_SEC = '30';
    expect(getPrivateInviteTtlSec()).toBe(30);
    process.env.PRIVATE_INVITE_TTL_SEC = 'abc';
    expect(getPrivateInviteTtlSec()).toBe(600);
    if (prev === undefined) delete process.env.PRIVATE_INVITE_TTL_SEC; else process.env.PRIVATE_INVITE_TTL_SEC = prev;
  });
});
