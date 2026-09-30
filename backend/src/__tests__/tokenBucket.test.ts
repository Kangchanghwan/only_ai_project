import { TokenBucket } from '../utils/tokenBucket';

describe('TokenBucket', () => {
  test('버스트 후 차단되고 시간이 지나면 충전된다', () => {
    let now = 0;
    const b = new TokenBucket(3, 1, () => now);
    expect([b.tryConsume(), b.tryConsume(), b.tryConsume(), b.tryConsume()]).toEqual([true, true, true, false]);
    now += 1000;
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false);
  });
});
