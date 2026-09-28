import { issueRoomToken, issueRoomTokens, verifyRoomToken } from '../utils/roomToken';

describe('roomToken', () => {
  const secret = 'test-secret';
  const now = Date.UTC(2026, 8, 29, 0, 0, 0);

  test('발급한 토큰은 같은 roomId에 대해 valid', () => {
    const token = issueRoomToken('room-abc', now, 3600, secret);
    expect(token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(verifyRoomToken('room-abc', token, now, secret)).toBe('valid');
  });

  test('다른 roomId에 쓰면 invalid (링크로 roomId를 알아도 다른 룸 토큰으로는 못 쓴다)', () => {
    const token = issueRoomToken('room-abc', now, 3600, secret);
    expect(verifyRoomToken('room-other', token, now, secret)).toBe('invalid');
  });

  test('다른 시크릿으로 서명된 토큰은 invalid', () => {
    const token = issueRoomToken('room-abc', now, 3600, 'another-secret');
    expect(verifyRoomToken('room-abc', token, now, secret)).toBe('invalid');
  });

  test('만료 시각을 조작하면 서명이 맞지 않아 invalid', () => {
    const token = issueRoomToken('room-abc', now, 60, secret);
    const [v, exp, sig] = token.split('.');
    const forged = `${v}.${Number(exp) + 86400}.${sig}`;
    expect(verifyRoomToken('room-abc', forged, now, secret)).toBe('invalid');
  });

  test('유효 시간이 지나면 expired', () => {
    const token = issueRoomToken('room-abc', now, 60, secret);
    expect(verifyRoomToken('room-abc', token, now + 59_000, secret)).toBe('valid');
    expect(verifyRoomToken('room-abc', token, now + 60_000, secret)).toBe('expired');
  });

  test('없거나 형식이 틀리면 missing / malformed', () => {
    expect(verifyRoomToken('room-abc', undefined, now, secret)).toBe('missing');
    expect(verifyRoomToken('room-abc', '', now, secret)).toBe('missing');
    expect(verifyRoomToken('room-abc', 'garbage', now, secret)).toBe('malformed');
    expect(verifyRoomToken('room-abc', 'v2.123.abc', now, secret)).toBe('malformed');
    expect(verifyRoomToken('room-abc', 'v1.notanumber.abc', now, secret)).toBe('malformed');
  });

  test('issueRoomTokens는 비어 있지 않은 roomId마다 토큰을 만든다', () => {
    const tokens = issueRoomTokens(['room-shared', undefined, 'room-abc']);
    expect(Object.keys(tokens).sort()).toEqual(['room-abc', 'room-shared']);
    expect(verifyRoomToken('room-abc', tokens['room-abc'])).toBe('valid');
  });
});
