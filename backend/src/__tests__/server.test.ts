import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ManagerOptions } from 'socket.io-client/build/cjs/manager';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SocketOptions } from 'socket.io-client/build/cjs/socket';

/**
 * 테스트 환경에 남아있는 구버전 @types/socket.io-client(v1) 스텁이
 * 실제 socket.io-client v4 번들 타입(ConnectOpts 등)을 가려서 extraHeaders가
 * 안 보이는 문제를 우회하기 위해, 실제 v4 타입 파일을 직접 참조한다.
 */
type TestConnectOpts = Partial<ManagerOptions & SocketOptions>;

/** ioClient 호출 시 구버전 타입 스텁(ConnectOpts)을 우회하기 위한 래퍼 */
const connect = (url: string, opts: TestConnectOpts): ReturnType<typeof ioClient> =>
    (ioClient as (url: string, opts: TestConnectOpts) => ReturnType<typeof ioClient>)(url, opts);

describe('Socket.IO Server - Single Shared Room', () => {
  let serverPort: number;
  const clients: ReturnType<typeof ioClient>[] = [];

  beforeAll((done) => {
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as AddressInfo).port;
      console.log(`Test server started on port ${serverPort}`);
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => {
      console.log('Test server closed');
      done();
    });
  });

  afterEach((done) => {
    // Disconnect all clients
    clients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
    clients.length = 0;

    // Wait a bit for cleanup
    setTimeout(done, 100);
  });

  describe('1. Connection Flow', () => {
    test('connect 시 globalRoomId와 ipRoomId를 함께 등록한다', (done) => {
      const client = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
      clients.push(client);

      client.on('registered', (payload: { globalRoomId: string; ipRoomId: string }) => {
        expect(payload.globalRoomId).toBe('room-shared');
        expect(payload.ipRoomId).toMatch(/^room-[0-9a-f]{12}$/);
        done();
      });
    });

    test('모든 클라이언트가 같은 globalRoomId(room-shared)를 받는다', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
      const client2 = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
      clients.push(client1, client2);

      const globals: string[] = [];
      const check = () => {
        if (globals.length === 2) {
          expect(globals[0]).toBe('room-shared');
          expect(globals[1]).toBe('room-shared');
          done();
        }
      };

      client1.on('registered', (p: { globalRoomId: string }) => { globals.push(p.globalRoomId); check(); });
      client2.on('registered', (p: { globalRoomId: string }) => { globals.push(p.globalRoomId); check(); });
    });
  });

  describe('2. Message Broadcasting', () => {
    test('should broadcast message to all users in shared room', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      const testMessage = { type: 'text', content: 'Hello!' };
      let messageCount = 0;
      let registeredCount = 0;

      const messageHandler = (msg: any) => {
        expect(msg).toEqual(testMessage);
        messageCount++;
        if (messageCount === 2) { // Both clients received
          done();
        }
      };

      // Set up message handlers BEFORE any events
      client1.on('message', messageHandler);
      client2.on('message', messageHandler);

      const checkRegistered = () => {
        registeredCount++;
        if (registeredCount === 2) {
          // Both clients are in the shared room, publish a message
          setTimeout(() => {
            client1.emit('publish', testMessage, 'global');
          }, 50);
        }
      };

      client1.on('registered', checkRegistered);
      client2.on('registered', checkRegistered);
    });

    test("target=global 메시지는 IP가 다른 두 클라이언트 모두에게 도달한다", (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': '198.51.100.1' },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': '203.0.113.9' },
      });
      clients.push(a, b);

      const msg = { type: 'text', content: 'global-hello' };
      let registered = 0;
      let received = 0;

      const onReg = () => { registered++; if (registered === 2) a.emit('publish', msg, 'global'); };
      a.on('registered', onReg);
      b.on('registered', onReg);

      const onMsg = (m: any) => { expect(m).toEqual(msg); received++; if (received === 2) done(); };
      a.on('message', onMsg);
      b.on('message', onMsg);
    });

    test("target=ip 메시지는 같은 IP 클라이언트끼리만 도달한다", (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': '198.51.100.50' },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': '198.51.100.50' },
      });
      const stranger = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': '203.0.113.200' },
      });
      clients.push(a, b, stranger);

      const msg = { type: 'text', content: 'ip-only' };
      let registered = 0;
      const onReg = () => { registered++; if (registered === 3) a.emit('publish', msg, 'ip'); };
      a.on('registered', onReg);
      b.on('registered', onReg);
      stranger.on('registered', onReg);

      let received = 0;
      stranger.on('message', () => done(new Error('다른 IP가 ip 메시지를 수신함')));

      const settle = () => { received++; if (received === 2) done(); };
      a.on('message', settle);
      b.on('message', settle);
    });

    test("소켓이 속하지 않은 target은 에러로 거부된다", (done) => {
      const c = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
      clients.push(c);
      c.on('registered', () => {
        // 잘못된 target을 강제로 전송해 서버의 검증 로직을 확인한다 (구버전 타입 스텁으로 인해 컴파일 타임에는 막히지 않음)
        c.emit('publish', { type: 'text', content: 'x' }, 'bogus', (err: Error | null) => {
          expect(err).toBeTruthy();
          done();
        });
      });
    });
  });

  describe('3. Disconnect Handling', () => {
    test('should notify remaining users when someone leaves', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      let registeredCount = 0;
      let userLeftCount = 0;

      // client1과 client2는 같은 IP 룸에도 속하므로, client2 disconnect 시
      // globalRoomId/ipRoomId 두 룸 각각에서 user-left가 한 번씩, 총 2번 발생한다.
      client1.on('user-left', (userCount: number) => {
        expect(userCount).toBe(1); // Only client1 remains in each room
        userLeftCount++;
        if (userLeftCount === 2) {
          done();
        }
      });

      const checkRegistered = () => {
        registeredCount++;
        if (registeredCount === 2) {
          // Both in same rooms, now disconnect client2
          setTimeout(() => {
            client2.disconnect();
          }, 50);
        }
      };

      client1.on('registered', checkRegistered);
      client2.on('registered', checkRegistered);
    });
  });

  describe('4. Device Roster (room-users)', () => {
    test('같은 IP로 접속한 두 소켓은 room-users로 서로를 포함한 목록을 받는다', (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.77',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.77',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1',
        },
      });
      clients.push(a, b);

      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };

      let aLen = 0;
      let bLen = 0;

      a.on('room-users', (devices: unknown[]) => {
        aLen = devices.length;
        if (aLen === 2 && bLen === 2) finish();
      });
      b.on('room-users', (devices: unknown[]) => {
        bLen = devices.length;
        if (aLen === 2 && bLen === 2) finish();
      });
    });

    test('한 명이 disconnect하면 남은 클라이언트는 room-users로 길이 1인 목록을 받는다', (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.88',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.88',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clients.push(a, b);

      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };

      let registered = 0;
      let sawInitialPair = false;

      const onReg = () => {
        registered++;
        if (registered === 2) {
          setTimeout(() => b.disconnect(), 50);
        }
      };
      a.on('registered', onReg);
      b.on('registered', onReg);

      a.on('room-users', (devices: unknown[]) => {
        if (devices.length === 2) {
          sawInitialPair = true;
          return;
        }
        if (sawInitialPair && devices.length === 1) {
          finish();
        }
      });
    });
  });
});
