# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time file/image sharing web app ("ClipboardApp") using Socket.IO. All clients auto-join a single shared room (`room-shared`) and exchange files, images, and text in real time. Production domain: `www.clipboardapp.org`.

## Monorepo Structure

```
backend/   → Node.js + TypeScript + Express 5 + Socket.IO 4.8 server
frontend/  → Vue 3 (Composition API, plain JavaScript) + Vite 7 + Tailwind CSS 4 SPA
```

See `backend/CLAUDE.md` for detailed backend patterns and Socket.IO best practices.

## Commands

### Root
```bash
npm run build:prod       # Install frontend deps + production build (shortcut)
```

### Backend (from `backend/`)
```bash
npm run dev              # Dev server with hot reload (port 3001)
npm run build            # TypeScript compilation to dist/
npm run build:prod       # Production TypeScript build
npm start                # Run from dist/ (after build)
npm test                 # Run Jest tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npx jest src/__tests__/RoomManager.test.ts   # Single test file
npx jest -t "test name"                      # Single test by name
```

### Frontend (from `frontend/`)
```bash
npm run dev              # Vite dev server (port 5173)
npm run build            # Production build
npm run build:prod       # Optimized production build (mode=production)
npm run build:seo        # Production build + Puppeteer prerendering
npm test                 # Run Vitest tests
npm run test:ui          # Vitest with browser UI
```

No linting or formatting tools (ESLint, Prettier) are configured. Node.js >= 22.9.0 required.

## Architecture

### Communication Flow
```
Browser (Vue 3) ←→ Socket.IO ←→ Node.js Server ←→ CloudFlare R2 (storage)
```

Socket.IO handles real-time events (file publish, user join/leave). File uploads go through REST endpoints with presigned URLs for R2. Socket.IO server config: `pingTimeout: 60s`, `pingInterval: 25s`, `connectTimeout: 45s`.

### Backend Key Modules (`backend/src/`)
- `server.ts` — Express + Socket.IO setup, REST API endpoints, graceful shutdown
- `managers/RoomManager.ts` — In-memory room state singleton, auto-cleanup of empty rooms via StorageService
- `handlers/socketHandlers.ts` — Socket event handlers (connection auto-joins `room-shared`, publish, disconnect)
- `services/r2Service.ts` — CloudFlare R2 wrapper (S3-compatible SDK)
- `services/StorageService.ts` — Wraps r2Service for room cleanup on last user leave
- `types/index.ts` — TypeScript interfaces for all Socket.IO events
- `utils/logger.ts` — Environment-aware logger (suppresses logs in test/production)

### Frontend 3-Layer Architecture
```
Components (UI) → Composables (Logic) → Services (API)
```

- **Composables** (`src/composables/`): `useRoomManager`, `useFileManager`, `useSocket`, `useClipboard`, `useNotification`, `useDownload`, `useTextShare`, `useTheme`, `useQRCode`
- **Services** (`src/services/`): `socketService` (Socket.IO singleton), `r2Service` (R2 storage client), `roomHealthService`, `notificationService`
- **Routing**: Hash-based without Vue Router (`src/utils/router.js`). Routes: `/` = home/room, `/#/download?r={roomId}&f={base64fileNames}` = download page

### REST API Endpoints (backend)
- `GET /health` — Server status + room/user counts
- `GET /stats` — Room/user counts
- `POST /api/r2/presigned-url` — Generate upload URL (body: roomId, fileName, contentType)
- `POST /api/r2/upload` — Direct upload via multer (max 1MB)
- `GET /api/r2/files/:roomId` — List files (query: limit, continuationToken)
- `GET /api/r2/size/:roomId` — Room total size in bytes
- `DELETE /api/r2/files/:roomId` — Delete all room files
- `DELETE /api/r2/files/:roomId/:fileName` — Delete single file

### Storage
- **Primary**: CloudFlare R2 via AWS S3 SDK. Files stored as `{roomId}/{fileName}`.
- Files <1MB upload directly through server; >1MB use presigned URLs for direct R2 upload.
- File size limits via env vars: `VITE_MAX_FILE_SIZE_MB` (default 10MB), `VITE_MAX_ROOM_SIZE_MB` (default 500MB).
- Files auto-deleted when room empties (grace period configurable via `ROOM_GRACE_PERIOD_SEC`).

### Internationalization
21 languages in `frontend/src/i18n/locales/`. Browser language auto-detected, persisted to localStorage. Fallback language: Korean (`ko`). When adding UI text, add keys to all locale files.

## Testing

- **Backend**: Jest + ts-jest. Tests use real Socket.IO server instances. Test files in `src/__tests__/`. Setup in `src/__tests__/setup.ts`. Custom Jest environment mocks `localStorage` for socket.io-client. Timeout: 10s.
- **Frontend**: Vitest + Vue Test Utils with happy-dom. Test files colocated with source (`*.test.js`). Configured in `vite.config.js`.

## Environment Variables

### Backend
```
PORT=3001
ALLOWED_ORIGINS=https://www.clipboardapp.org
ROOM_GRACE_PERIOD_SEC=300
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
```

### Frontend
```
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
VITE_R2_PUBLIC_URL=https://store.clipboardapp.org
VITE_MAX_FILE_SIZE_MB=10
VITE_MAX_ROOM_SIZE_MB=500
```

## Key Conventions

- Backend uses strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`). Frontend is plain JavaScript.
- Socket.IO events are typed via interfaces in `backend/src/types/index.ts`
- Connection State Recovery enabled (2-minute window for reconnection)
- Frontend uses Vue 3 Composition API exclusively (no Options API)
- Props Down / Emit Up pattern for component communication

## Deployment

- **Frontend**: Vercel (`vercel.json`) — SPA fallback, security headers, immutable caching for static assets
- **Backend**: Docker multi-stage build (`Dockerfile`) — node:18-alpine, health check on `/health`. Note: Dockerfile uses node:18 but project requires Node >= 22.9.0; update Dockerfile base image if rebuilding.
- **Production URLs**: frontend `https://www.clipboardapp.org`, API `https://api.clipboardapp.org`, R2 storage `https://store.clipboardapp.org`
- **SEO**: Puppeteer prerendering via `frontend/scripts/prerender.mjs` (used in `build:seo`)
- **Frontend build optimizations**: Terser with `drop_console`, CSS code splitting, manual chunks (vendor, socket.io-client, vue-i18n), source maps disabled in production

## Known Legacy Code

- `backend/src/config/supabase.ts` and `frontend/src/services/supabaseService.js` are legacy Supabase references — R2 is the current storage.
- `frontend/ARCHITECTURE.md` is outdated (still references Supabase).
- **`backend/CLAUDE.md` is significantly outdated**: describes 6-digit room numbers (100000-999999) and `room-${roomNumber}` format, but the current architecture uses a single shared room (`room-shared`). Trust the root CLAUDE.md over `backend/CLAUDE.md` when they conflict.
- Root `README.md` is also outdated (describes the old 6-digit room model in Korean).
