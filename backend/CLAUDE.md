# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important**: Automatically use Context7 MCP for retrieving up-to-date library documentation when working with dependencies.

## Project Context

This is the **backend** component of a real-time image sharing application. The backend is a Socket.IO server built with Node.js and TypeScript that manages room-based real-time communication. Users automatically get assigned a 6-digit room number (100000-999999) when connecting, and can share images/messages with others in the same room.

## Commands

### Development
```bash
npm run dev          # Start dev server with hot reload on port 3001
npm run build        # Compile TypeScript to dist/
npm start            # Run production server from dist/
```

### Testing
```bash
npm test             # Run all Jest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Running Single Tests
```bash
npx jest -t "test name pattern"
npx jest src/__tests__/server.test.ts  # Run specific file
```

## Architecture

### Modular Structure
The codebase follows a modular architecture with clear separation of concerns:

```
src/
├── types/index.ts              # TypeScript type definitions
├── managers/RoomManager.ts     # Room state management class
├── handlers/socketHandlers.ts  # Socket.IO event handlers
└── server.ts                   # Main server initialization (minimal)
```

**Key principle**: Each module has a single responsibility. When adding features, maintain this structure.

### RoomManager Pattern
The `RoomManager` class encapsulates all room-related state and logic:
- Room creation/deletion
- User join/leave tracking
- Room number generation with collision detection
- Automatic cleanup of empty rooms

**Important**: All room state is in-memory only. There is NO persistence layer. Rooms are cleaned up immediately when the last user leaves.

### Socket Event Handlers
All Socket.IO event logic lives in `src/handlers/socketHandlers.ts`. The pattern used:
- Each event handler is a separate function
- Handlers are registered in `setupSocketHandlers()`
- All handlers include comprehensive error handling and validation
- Acknowledgements (callbacks) are used for critical operations like `join` and `publish`

### Error Handling Pattern
Every event handler follows this pattern:
1. Validate socket state (roomId exists)
2. Validate input parameters
3. Execute business logic in try-catch
4. Send acknowledgement OR error event
5. Log with ISO timestamps

### Socket.IO Best Practices Applied
- Acknowledgements for critical events
- Structured error responses with codes
- Input validation before processing
- Ping/pong timeout configuration
- Graceful shutdown handling

## TypeScript Configuration

This project uses **strict TypeScript** with additional safety flags:
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- All new code must pass TypeScript compilation without errors

## Testing

### Test Environment Setup
- Custom Jest environment in `jest-environment.js` mocks `localStorage` (required for socket.io-client)
- Test setup in `src/__tests__/setup.ts` runs before tests
- Tests use real Socket.IO connections to a test server instance

### Writing Tests
When adding new Socket.IO events:
1. Add test in `src/__tests__/server.test.ts`
2. Set up event handlers BEFORE emitting events (timing matters)
3. Use `done()` callback for async tests
4. Clean up clients in `afterEach`
5. Add small delays (50ms) for event propagation if needed

## Socket.IO Events

### Server → Client Events
- `registered(roomNumber)` - New room created
- `subscribed(roomNumber, userCount)` - Joined existing room
- `room-not-found` - Room doesn't exist
- `message(msg)` - Broadcast message in room
- `user-left(userCount)` - User disconnected
- `error(ErrorResponse)` - Error occurred

### Client → Server Events
- `join(roomNumber, ack?)` - Join existing room (with optional acknowledgement)
- `publish(message, ack?)` - Send message to room (with optional acknowledgement)

### Acknowledgement Pattern
Events support optional acknowledgement callbacks:
```typescript
socket.emit('publish', message, (error, data) => {
  if (error) {
    // Handle error
  } else {
    // Success: data.success === true
  }
});
```

## Environment Configuration

Required `.env` variables:
- `PORT` - Server port (default: 3001)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins
- `NODE_ENV` - Set to 'test' during testing

The app automatically loads origins from `ALLOWED_ORIGINS`, falling back to defaults defined in server.ts.

## Project-Specific Patterns

### Room Number Format
- 6-digit numbers: 100000-999999
- Format: `room-${roomNumber}` for internal room IDs
- Generation includes retry logic (max 10 attempts)

### Logging Convention
All logs use ISO timestamps:
```typescript
console.log(`[${new Date().toISOString()}] Message here`);
```

### Socket Extensions
Sockets are extended with custom properties:
```typescript
interface ExtendedSocket extends Socket {
  roomNr?: number;    // User-facing room number
  roomId?: string;    // Internal room ID (room-XXXXXX)
}
```

### Graceful Shutdown
The server handles SIGTERM, SIGINT, and uncaught exceptions by:
1. Closing Socket.IO connections
2. Closing HTTP server
3. Forcing shutdown after 10s timeout

## Deployment Context

This backend is deployed to Vercel (see root `vercel.json`). The frontend is a separate Vue 3 app. When making CORS changes, ensure both local development URLs and production URLs are included in ALLOWED_ORIGINS.

## Development Workflow (TDD)

This project was built using Test-Driven Development:
1. Write failing test first
2. Implement minimal code to pass test
3. Refactor while keeping tests green
4. Ensure all tests pass before committing

When adding new features, follow this pattern and maintain test coverage.

## Library Documentation Reference

### Context7 Library IDs
When using Context7 MCP for documentation, use these library IDs:

- **Node.js**: `/nodejs/node` (v22.17.0, v22_20_0)
  - HTTP server configuration
  - Graceful shutdown patterns
  - Keep-alive and timeout settings

- **Socket.IO**: `https://context7.com/socketio/socket.io/llms.txt`
  - Connection State Recovery
  - TypeScript event interfaces
  - Authentication & middleware patterns
  - Room management & broadcasting
  - Acknowledgements and timeouts

### Key Dependencies (package.json)
- `socket.io@^4.8.1` - Real-time bidirectional event-based communication
- `express@^5.1.0` - HTTP server framework
- `dotenv@^17.2.3` - Environment variable management
- `typescript@^5.9.3` - Type-safe JavaScript
- `jest@^30.0.0` + `ts-jest@^29.4.5` - Testing framework

**Note**: When implementing features with these libraries, use Context7 MCP to fetch the latest documentation and best practices.

## Socket.IO Best Practices Applied

### Connection State Recovery (Production Feature)
The server is configured with Connection State Recovery to handle temporary disconnections:
```typescript
connectionStateRecovery: {
  maxDisconnectionDuration: 2 * 60 * 1000,  // 2 minutes
  skipMiddlewares: true
}
```
This preserves rooms, socket data, and missed packets during brief network interruptions.

### TypeScript Event Interfaces
All Socket.IO events use strict TypeScript interfaces defined in `src/types/index.ts`:
- `ClientToServerEvents` - Events from client to server
- `ServerToClientEvents` - Events from server to client
- `InterServerEvents` - For Redis adapter (future scaling)
- `SocketData` - Data attached to each socket instance

This prevents runtime event name mismatches and ensures payload consistency.

### Acknowledgements Pattern
All critical operations (`join`, `publish`) support typed acknowledgement callbacks:
```typescript
socket.emit('join', roomNumber, (error, response: JoinResponse) => {
  if (error) {
    // Handle error
  } else {
    // response.success, response.roomNr, response.usersInRoom
  }
});
```

### Timeout Handling
Critical operations should use timeouts (5 seconds recommended):
```typescript
socket.timeout(5000).emit('event', data, (err, response) => {
  if (err) {
    // Handle timeout
  }
});
```

### Broadcasting Operators
- `socket.emit()` - Single socket only
- `socket.broadcast.emit()` - All except sender
- `io.to('room').emit()` - All in room
- `socket.volatile.emit()` - Non-critical, high-frequency updates (acceptable packet loss)
