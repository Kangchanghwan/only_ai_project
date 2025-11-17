# Backend Server

Real-time communication server using Socket.IO for image sharing application.

## Features

- Real-time room-based communication
- Auto-generated unique room numbers
- User presence tracking
- Health check endpoint
- TypeScript support
- Hot reload in development

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` to configure:
- `PORT`: Server port (default: 3001)
- `ALLOWED_ORIGINS`: Comma-separated CORS allowed origins

## Development

```bash
npm run dev
```

Server will start on port 3001 with hot reload enabled.

## Production

Build:
```bash
npm run build
```

Start:
```bash
npm start
```

## API Endpoints

### Health Check
- **GET** `/health`
- Returns server status and user count

## Socket.IO Events

### Client → Server

- `join`: Join an existing room
  ```js
  socket.emit('join', roomNumber)
  ```

- `publish`: Send message to room
  ```js
  socket.emit('publish', message)
  ```

### Server → Client

- `registered`: Confirmation of room registration
  ```js
  socket.on('registered', (roomNumber) => {})
  ```

- `subscribed`: User joined room
  ```js
  socket.on('subscribed', (roomNumber, userCount) => {})
  ```

- `unsubscribed`: User left room
  ```js
  socket.on('unsubscribed', (userCount) => {})
  ```

- `message`: Received message from room
  ```js
  socket.on('message', (msg) => {})
  ```

- `deviceid-not-exists`: Room not found
  ```js
  socket.on('deviceid-not-exists', () => {})
  ```

## Architecture Improvements

### Original Code Issues:
- Mixed concerns (no separation)
- Limited error handling
- No environment configuration
- Inconsistent logging
- No TypeScript strict mode

### Optimizations:
1. **RoomManager Class**: Encapsulated room logic
2. **Better Error Handling**: Try-catch blocks and validation
3. **Environment Variables**: Configurable settings
4. **ISO Timestamps**: Consistent, parseable logging
5. **Health Endpoint**: Monitoring support
6. **Graceful Shutdown**: Proper cleanup on termination
7. **Type Safety**: Strict TypeScript configuration
8. **Better Logging**: Structured with timestamps and context
