import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Socket.IO Server - Room Management (TDD)', () => {
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

  describe('1. Room Creation Flow', () => {
    test('should create room and return room number when client connects', (done) => {
      const client = ioClient(`http://localhost:${serverPort}`);
      clients.push(client);

      client.on('registered', (roomNumber: number) => {
        expect(roomNumber).toBeDefined();
        expect(typeof roomNumber).toBe('number');
        expect(roomNumber).toBeGreaterThanOrEqual(100000);
        expect(roomNumber).toBeLessThan(1000000);
        done();
      });
    });

    test('should create unique room numbers for different clients', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      const roomNumbers: number[] = [];

      const checkCompletion = () => {
        if (roomNumbers.length === 2) {
          expect(roomNumbers[0]).not.toBe(roomNumbers[1]);
          done();
        }
      };

      client1.on('registered', (roomNumber: number) => {
        roomNumbers.push(roomNumber);
        checkCompletion();
      });

      client2.on('registered', (roomNumber: number) => {
        roomNumbers.push(roomNumber);
        checkCompletion();
      });
    });
  });

  describe('2. Room Joining Flow', () => {
    test('should allow client to join existing room', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      let client1RoomNumber: number;

      client1.on('registered', (roomNumber: number) => {
        client1RoomNumber = roomNumber;
      });

      client2.on('registered', () => {
        // Client2 tries to join client1's room
        client2.emit('join', client1RoomNumber);
      });

      client2.on('subscribed', (roomNumber: number, userCount: number) => {
        expect(roomNumber).toBe(client1RoomNumber);
        expect(userCount).toBe(2);
        done();
      });
    });

    test('should notify when trying to join non-existent room', (done) => {
      const client = ioClient(`http://localhost:${serverPort}`);
      clients.push(client);

      const nonExistentRoom = 999999;

      client.on('registered', () => {
        client.emit('join', nonExistentRoom);
      });

      client.on('room-not-found', () => {
        expect(true).toBe(true);
        done();
      });
    });
  });

  describe('3. Message Broadcasting', () => {
    test('should broadcast message to all users in same room', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      let client1RoomNumber: number;
      const testMessage = { type: 'text', content: 'Hello!' };
      let messageCount = 0;

      client1.on('registered', (roomNumber: number) => {
        client1RoomNumber = roomNumber;
      });

      client2.on('registered', () => {
        client2.emit('join', client1RoomNumber);
      });

      client2.on('subscribed', () => {
        // Both clients in same room, send message
        client1.emit('publish', testMessage);
      });

      const messageHandler = (msg: any) => {
        expect(msg).toEqual(testMessage);
        messageCount++;
        if (messageCount === 2) { // Both clients received
          done();
        }
      };

      client1.on('message', messageHandler);
      client2.on('message', messageHandler);
    });
  });

  describe('4. Disconnect Handling', () => {
    test('should notify remaining users when someone leaves', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`);
      const client2 = ioClient(`http://localhost:${serverPort}`);
      clients.push(client1, client2);

      let client1RoomNumber: number;

      client1.on('registered', (roomNumber: number) => {
        client1RoomNumber = roomNumber;
      });

      client2.on('registered', () => {
        client2.emit('join', client1RoomNumber);
      });

      client2.on('subscribed', () => {
        // Both in same room, now disconnect client2
        client2.disconnect();
      });

      client1.on('user-left', (userCount: number) => {
        expect(userCount).toBe(1); // Only client1 remains
        done();
      });
    });
  });
});
