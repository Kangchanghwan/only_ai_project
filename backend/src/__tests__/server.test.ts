import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';

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
    test('should register client with shared room ID on connect', (done) => {
      const client = ioClient(`http://localhost:${serverPort}`);
      clients.push(client);

      client.on('registered', (roomId: string) => {
        expect(roomId).toBe('room-shared');
        done();
      });
    });

    test('should register all clients with the same shared room ID', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      const roomIds: string[] = [];

      const checkCompletion = () => {
        if (roomIds.length === 2) {
          expect(roomIds[0]).toBe('room-shared');
          expect(roomIds[1]).toBe('room-shared');
          done();
        }
      };

      client1.on('registered', (roomId: string) => {
        roomIds.push(roomId);
        checkCompletion();
      });

      client2.on('registered', (roomId: string) => {
        roomIds.push(roomId);
        checkCompletion();
      });
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
            client1.emit('publish', testMessage);
          }, 50);
        }
      };

      client1.on('registered', checkRegistered);
      client2.on('registered', checkRegistered);
    });
  });

  describe('3. Disconnect Handling', () => {
    test('should notify remaining users when someone leaves', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      let registeredCount = 0;

      client1.on('user-left', (userCount: number) => {
        expect(userCount).toBe(1); // Only client1 remains
        done();
      });

      const checkRegistered = () => {
        registeredCount++;
        if (registeredCount === 2) {
          // Both in same room, now disconnect client2
          setTimeout(() => {
            client2.disconnect();
          }, 50);
        }
      };

      client1.on('registered', checkRegistered);
      client2.on('registered', checkRegistered);
    });
  });
});
