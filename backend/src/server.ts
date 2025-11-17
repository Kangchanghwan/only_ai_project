import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
            'http://localhost:3000',
            'http://localhost:3020',
            'https://clipboard.ninja',
            'https://clipboard-ninja.vercel.app'
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

interface RoomData {
    userCount: number;
    createdAt: Date;
}

interface Rooms {
    [roomId: string]: RoomData;
}

interface MySocket extends Socket {
    roomNr?: number;
    roomId?: string;
}

class RoomManager {
    private rooms: Rooms = {};
    private readonly MIN_ROOM_NR = 100000;
    private readonly MAX_ROOM_NR = 999999;
    private readonly MAX_RETRIES = 10;

    /**
     * Generate a unique room number
     */
    generateRoomNumber(): number {
        let attempts = 0;

        while (attempts < this.MAX_RETRIES) {
            const number = Math.floor(
                Math.random() * (this.MAX_ROOM_NR - this.MIN_ROOM_NR) + this.MIN_ROOM_NR
            );
            const roomId = this.getRoomId(number);

            if (!this.rooms[roomId]) {
                return number;
            }

            attempts++;
        }

        throw new Error('Failed to generate unique room number');
    }

    /**
     * Convert room number to room ID
     */
    getRoomId(roomNr: number): string {
        return `room-${roomNr}`;
    }

    /**
     * Check if room exists
     */
    roomExists(roomNr: number): boolean {
        const roomId = this.getRoomId(roomNr);
        return !!this.rooms[roomId] && this.rooms[roomId].userCount > 0;
    }

    /**
     * Create a new room
     */
    createRoom(roomId: string): void {
        if (!this.rooms[roomId]) {
            this.rooms[roomId] = {
                userCount: 0,
                createdAt: new Date()
            };
        }
    }

    /**
     * Add user to room
     */
    addUserToRoom(roomId: string): number {
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }
        this.rooms[roomId].userCount++;
        return this.rooms[roomId].userCount;
    }

    /**
     * Remove user from room
     */
    removeUserFromRoom(roomId: string): number {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].userCount--;

        // Clean up empty rooms
        if (this.rooms[roomId].userCount <= 0) {
            delete this.rooms[roomId];
            return 0;
        }

        return this.rooms[roomId].userCount;
    }

    /**
     * Get user count in room
     */
    getRoomUserCount(roomId: string): number {
        return this.rooms[roomId]?.userCount || 0;
    }

    /**
     * Get total number of rooms
     */
    getTotalRooms(): number {
        return Object.keys(this.rooms).length;
    }

    /**
     * Get total number of users across all rooms
     */
    getTotalUsers(): number {
        return Object.values(this.rooms).reduce((sum, room) => sum + room.userCount, 0);
    }
}

const roomManager = new RoomManager();

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        totalRooms: roomManager.getTotalRooms(),
        totalUsers: roomManager.getTotalUsers()
    });
});

// Socket.IO connection handling
io.on('connection', (socket: MySocket) => {
    const timestamp = new Date().toISOString();

    try {
        // Automatically create and assign room when client connects
        const roomNr = roomManager.generateRoomNumber();
        socket.roomNr = roomNr;
        socket.roomId = roomManager.getRoomId(roomNr);

        // Create room and join
        socket.join(socket.roomId);
        roomManager.addUserToRoom(socket.roomId);

        // Notify client of their room number
        socket.emit('registered', socket.roomNr);

        console.log(`[${timestamp}] User registered in ${socket.roomId} (Room: ${socket.roomNr})`);

    } catch (error) {
        console.error(`[${timestamp}] ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        socket.emit('error', { message: 'Failed to create room' });
        socket.disconnect();
        return;
    }

    /**
     * Handle client disconnect
     */
    socket.on('disconnect', () => {
        const timestamp = new Date().toISOString();

        if (!socket.roomId) {
            return;
        }

        const remainingUsers = roomManager.removeUserFromRoom(socket.roomId);

        // Notify remaining users in the room
        io.to(socket.roomId).emit('user-left', remainingUsers);

        console.log(`[${timestamp}] User left ${socket.roomId} (Remaining: ${remainingUsers})`);
    });

    /**
     * Handle publishing messages to room
     */
    socket.on('publish', (msg) => {
        if (!socket.roomId) {
            return;
        }

        // Broadcast message to all users in the room (including sender)
        io.to(socket.roomId).emit('message', msg);
    });

    /**
     * Handle joining an existing room by room number
     */
    socket.on('join', (roomNr: number) => {
        const timestamp = new Date().toISOString();

        if (!socket.roomId) {
            return;
        }

        // Validate room number
        if (typeof roomNr !== 'number' || !roomManager.roomExists(roomNr)) {
            socket.emit('room-not-found');
            console.log(`[${timestamp}] Attempt to join non-existent room: ${roomNr}`);
            return;
        }

        const oldRoomId = socket.roomId;
        const newRoomId = roomManager.getRoomId(roomNr);

        // If already in the target room, do nothing
        if (oldRoomId === newRoomId) {
            return;
        }

        // Leave current room
        socket.leave(oldRoomId);
        const remainingInOldRoom = roomManager.removeUserFromRoom(oldRoomId);

        // Notify users in old room
        io.to(oldRoomId).emit('user-left', remainingInOldRoom);

        // Join new room
        socket.roomId = newRoomId;
        socket.roomNr = roomNr;
        socket.join(newRoomId);

        const usersInNewRoom = roomManager.addUserToRoom(newRoomId);

        // Notify all users in new room (including the joiner)
        io.to(newRoomId).emit('subscribed', roomNr, usersInNewRoom);

        console.log(`[${timestamp}] User joined ${newRoomId} (Room: ${roomNr}, Users: ${usersInNewRoom})`);
    });
});

const PORT = process.env.PORT || 3001;

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(PORT, () => {
        console.log(`[${new Date().toISOString()}] Server started on port ${PORT}`);
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        console.log('HTTP server closed');
    });
});

// Export for testing
export { io, httpServer, roomManager };
