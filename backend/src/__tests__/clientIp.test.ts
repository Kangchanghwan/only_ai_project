import { extractClientIp, normalizeIp, deriveIpRoomId } from '../utils/clientIp';

// socket.handshake 형태를 흉내내는 최소 목 객체
const mkHandshake = (headers: Record<string, string | string[]>, address = '10.0.0.1') => ({
  headers,
  address,
});

describe('extractClientIp', () => {
  test('CF-Connecting-IP를 최우선으로 사용한다', () => {
    const hs = mkHandshake({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.2',
    });
    expect(extractClientIp(hs)).toBe('203.0.113.7');
  });

  test('CF 헤더가 없으면 X-Forwarded-For의 첫 IP를 사용한다', () => {
    const hs = mkHandshake({ 'x-forwarded-for': '198.51.100.1, 10.0.0.2' });
    expect(extractClientIp(hs)).toBe('198.51.100.1');
  });

  test('두 헤더가 모두 없으면 handshake.address로 폴백한다', () => {
    const hs = mkHandshake({}, '192.0.2.55');
    expect(extractClientIp(hs)).toBe('192.0.2.55');
  });

  test('아무것도 없으면 null을 반환한다', () => {
    const hs = mkHandshake({}, '');
    expect(extractClientIp(hs)).toBeNull();
  });
});

describe('normalizeIp', () => {
  test('IPv4는 전체 주소를 그대로 쓴다', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
  });

  test('IPv6는 /64 프리픽스로 정규화한다', () => {
    // 같은 /64 → 같은 정규화 결과
    expect(normalizeIp('2001:db8:abcd:0012:0000:0000:0000:0001'))
      .toBe(normalizeIp('2001:db8:abcd:0012:ffff:ffff:ffff:ffff'));
    // 다른 /64 → 다른 결과
    expect(normalizeIp('2001:db8:abcd:0012::1'))
      .not.toBe(normalizeIp('2001:db8:abcd:0099::1'));
  });

  test('IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4로 취급한다', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  test('비압축 zero-padded IPv6와 ::압축 IPv6가 같은 /64면 같게 정규화된다', () => {
    expect(normalizeIp('2001:0db8:0000:0012:0000:0000:0000:0001'))
      .toBe(normalizeIp('2001:db8:0:12::1'));
  });

  test('IPv6 zone id(%eth0)는 제거하고 정규화한다', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe(normalizeIp('fe80::1'));
  });
});

describe('deriveIpRoomId', () => {
  const secret = 'test-secret';

  test('같은 IP → 같은 룸 ID', () => {
    expect(deriveIpRoomId('203.0.113.7', secret))
      .toBe(deriveIpRoomId('203.0.113.7', secret));
  });

  test('다른 IP → 다른 룸 ID', () => {
    expect(deriveIpRoomId('203.0.113.7', secret))
      .not.toBe(deriveIpRoomId('203.0.113.8', secret));
  });

  test('room- 접두사 + 12자 hex 형식', () => {
    expect(deriveIpRoomId('203.0.113.7', secret)).toMatch(/^room-[0-9a-f]{12}$/);
  });

  test('같은 /64 IPv6는 같은 룸 ID로 묶인다', () => {
    expect(deriveIpRoomId('2001:db8:abcd:0012::1', secret))
      .toBe(deriveIpRoomId('2001:db8:abcd:0012::abcd', secret));
  });

  test('표기만 다른 같은 /64 IPv6는 같은 룸 ID로 묶인다', () => {
    expect(deriveIpRoomId('2001:0db8:0000:0012:0000:0000:0000:0001', secret))
      .toBe(deriveIpRoomId('2001:db8:0:12::1', secret));
  });
});
