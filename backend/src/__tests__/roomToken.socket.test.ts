import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { verifyRoomToken } from '../utils/roomToken';

type RegisteredWithTokens = {
  globalRoomId: string;
  ipRoomId: string;
  roomTokens: Record<string, string>;
  roomTokenTtlSec: number;
};

describe('Socket.IO - 룸 토큰 발급', () => {
  let serverPort: number;
  const clients: ReturnType<typeof ioClient>[] = [];

  beforeAll((done) => {
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  afterEach((done) => {
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    setTimeout(done, 50);
  });

  test('registered에 두 룸(전체·IP)의 유효한 토큰과 유효 시간이 실린다', (done) => {
    const client = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
    clients.push(client);

    client.on('registered', (payload: RegisteredWithTokens) => {
      expect(payload.roomTokenTtlSec).toBeGreaterThan(0);
      expect(Object.keys(payload.roomTokens).sort()).toEqual([payload.globalRoomId, payload.ipRoomId].sort());
      expect(verifyRoomToken(payload.globalRoomId, payload.roomTokens[payload.globalRoomId])).toBe('valid');
      expect(verifyRoomToken(payload.ipRoomId, payload.roomTokens[payload.ipRoomId])).toBe('valid');
      // IP 룸 토큰을 전체 룸에 쓸 수는 없다
      expect(verifyRoomToken(payload.globalRoomId, payload.roomTokens[payload.ipRoomId])).toBe('invalid');
      done();
    });
  });

  test('room-tokens 요청에 ack로 새 토큰을 돌려준다', (done) => {
    const client = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
    clients.push(client);

    client.on('registered', (registered: RegisteredWithTokens) => {
      client.emit('room-tokens', (payload: Omit<RegisteredWithTokens, 'globalRoomId' | 'ipRoomId'>) => {
        expect(verifyRoomToken(registered.ipRoomId, payload.roomTokens[registered.ipRoomId])).toBe('valid');
        expect(verifyRoomToken(registered.globalRoomId, payload.roomTokens[registered.globalRoomId])).toBe('valid');
        expect(payload.roomTokenTtlSec).toBe(registered.roomTokenTtlSec);
        done();
      });
    });
  });
});
