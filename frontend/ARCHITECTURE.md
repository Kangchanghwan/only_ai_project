# 프론트엔드 아키텍처 문서

## 📋 프로젝트 개요

**Image Share** - 실시간 이미지 공유 웹 애플리케이션

- **기술 스택**: Vue 3 + Socket.IO + Supabase Storage + Vite
- **아키텍처 패턴**: Composition API + Service Layer Pattern
- **주요 기능**:
  - 룸 기반 실시간 이미지 공유
  - 클립보드 붙여넣기로 이미지 업로드
  - 이미지 클릭으로 클립보드 복사
  - 실시간 사용자 수 표시

---

## 🏗️ 아키텍처 패턴

### 3-Layer Architecture

```
┌─────────────────────────────────────┐
│     Components (UI Layer)           │  ← 사용자 인터페이스
│  - App.vue                          │
│  - RoomScreen.vue                   │
│  - NotificationToast.vue            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Composables (Business Logic)      │  ← 재사용 가능한 비즈니스 로직
│  - useRoomManager                   │
│  - useFileManager                   │
│  - useSocket                        │
│  - useClipboard                     │
│  - useNotification                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Services (Data Layer)           │  ← 외부 API 통신
│  - socketService                    │
│  - supabaseService                  │
│  - notificationService              │
└─────────────────────────────────────┘
```

### 설계 원칙

1. **관심사의 분리 (Separation of Concerns)**
   - UI 컴포넌트는 화면 렌더링에만 집중
   - Composables는 비즈니스 로직 캡슐화
   - Services는 외부 API 통신 담당

2. **단방향 데이터 흐름**
   - Services → Composables → Components
   - 반응형 상태는 `readonly()`로 보호

3. **싱글톤 패턴**
   - 모든 Service는 싱글톤 인스턴스
   - 앱 전체에서 동일한 상태 공유

---

## 📂 디렉토리 구조

```
frontend/
├── src/
│   ├── main.js                      # 앱 엔트리 포인트
│   ├── App.vue                      # 루트 컴포넌트
│   ├── style.css                    # 전역 스타일
│   │
│   ├── components/                  # UI 컴포넌트
│   │   ├── RoomScreen.vue          # 룸 화면 (메인 UI)
│   │   └── NotificationToast.vue   # 알림 토스트
│   │
│   ├── composables/                # Composition API 로직
│   │   ├── useRoomManager.js       # 룸 생성/입장 관리
│   │   ├── useFileManager.js       # 파일 업로드/조회
│   │   ├── useSocket.js            # Socket.IO 래퍼
│   │   ├── useClipboard.js         # 클립보드 유틸리티
│   │   └── useNotification.js      # 알림 관리
│   │
│   └── services/                   # 서비스 레이어
│       ├── socketService.js        # Socket.IO 클라이언트
│       ├── supabaseService.js      # Supabase Storage
│       └── notificationService.js  # 알림 서비스
│
├── package.json
├── vite.config.js
└── index.html
```

---

## 🔧 핵심 컴포넌트 설명

### 1. App.vue (메인 애플리케이션)

**역할**: 앱의 진입점, 전역 이벤트 관리

**주요 기능**:
- 5개의 Composables 초기화 및 조합
- 룸 연결 및 소켓 이벤트 리스너 설정
- 전역 `paste` 이벤트 처리
- 라이프사이클 관리 (연결/해제)

**핵심 로직**:
```javascript
// 초기화
const roomManager = useRoomManager()    // 룸 상태 관리
const fileManager = useFileManager()    // 파일 CRUD
const clipboard = useClipboard()        // 복사/붙여넣기
const socket = useSocket()              // 실시간 통신
const notification = useNotification()  // 알림 표시

// 룸 연결 플로우
async function connectToRoom(roomCode) {
  1. 소켓 연결 (connect)
  2. 룸 입장 (joinRoom)
  3. 파일 목록 로드 (loadFiles)
  4. 이벤트 리스너 설정 (setupSocketListeners)
}

// 붙여넣기 이벤트 핸들러
async function handlePaste(event) {
  1. 클립보드에서 이미지 추출
  2. 파일 업로드
  3. 소켓으로 메시지 발행
  4. 로컬 파일 목록 업데이트 (UX 개선)
}
```

---

### 2. RoomScreen.vue (메인 화면)

**역할**: 사용자 인터페이스 렌더링

**Props**:
- `roomId`: 현재 룸 코드
- `files`: 이미지 파일 목록
- `isLoading`: 로딩 상태
- `userCount`: 현재 접속 인원
- `isConnecting`: 연결 중 상태

**Emits**:
- `copy-room-code`: 룸 코드 복사
- `copy-image`: 이미지 복사
- `join-other-room`: 다른 룸 입장

**UI 상태**:
1. **연결 중**: 스피너 표시
2. **빈 상태**: "룸이 비어있습니다" 메시지
3. **갤러리**: 이미지 그리드 표시

---

## 🎯 Composables 상세

### useRoomManager.js

**책임**: 룸 생성 및 입장 관리

```javascript
// 상태
currentRoomId: Ref<string|null>  // 현재 룸 ID

// 메서드
generateRoomCode()               // 6자리 랜덤 코드 생성 (예: "A3B7X9")
createNewRoom()                  // 새 룸 생성
joinRoomByCode(code)            // 기존 룸 입장
leaveRoom()                     // 룸 퇴장
```

**특징**:
- 상태만 관리, 실제 소켓 통신은 하지 않음
- `readonly()`로 외부 수정 방지

---

### useFileManager.js

**책임**: 파일 CRUD 작업

```javascript
// 상태
files: Ref<Array>        // 파일 목록
isLoading: Ref<boolean>  // 로딩 상태
error: Ref<Error|null>   // 에러 정보

// 메서드
loadFiles(roomId, options)          // 파일 목록 조회
uploadFile(roomId, file, options)   // 파일 업로드
deleteFile(roomId, fileName)        // 파일 삭제
clearFiles()                        // 목록 초기화
addFile(file)                       // 로컬 목록에 추가 (UX)
```

**특징**:
- `supabaseService`를 통해 실제 스토리지 작업 수행
- 에러 처리 및 로딩 상태 관리
- `addFile()`은 업로드 후 즉시 UI 반영 (낙관적 업데이트)

---

### useSocket.js

**책임**: Socket.IO 연결 및 이벤트 관리

```javascript
// 상태 (readonly)
isConnected: Ref<boolean>      // 연결 상태
currentRoomNr: Ref<number>     // 현재 룸 번호
usersInRoom: Ref<number>       // 룸 인원 수

// 메서드
connect()                      // 소켓 연결 + 자동 룸 생성
disconnect()                   // 연결 해제
joinRoom(roomNr)              // 특정 룸 입장
publishMessage(message)        // 메시지 발행
onMessage(callback)           // 메시지 수신 리스너
onUserLeft(callback)          // 사용자 퇴장 리스너
```

**이벤트 플로우**:
```
Client                    Server
  │                         │
  ├─ connect() ────────────>│
  │<──── 'registered' ──────┤  (자동 룸 생성)
  │                         │
  ├─ joinRoom(123) ────────>│
  │<──── 'subscribed' ──────┤  (룸 입장 성공)
  │                         │
  ├─ publishMessage() ─────>│
  │<──── 'message' ─────────┤  (브로드캐스트)
```

**특징**:
- `socketService`의 메서드를 바인딩하여 제공
- Cleanup 함수 반환으로 메모리 누수 방지

---

### useClipboard.js

**책임**: 클립보드 입출력 처리

```javascript
copyText(text)                     // 텍스트 복사
copyImage(imageUrl)                // 이미지 URL → Blob → 복사
extractImagesFromPaste(event)      // 붙여넣기에서 이미지 추출
```

**특징**:
- 상태 없는 유틸리티 함수 모음
- Clipboard API 사용 (CORS 제약 주의)

---

### useNotification.js

**책임**: 알림 표시

```javascript
notification: Ref<string|null>     // 현재 알림 메시지

showNotification(message, duration)  // 일반 알림
showSuccess(message)                 // ✓ 성공
showError(message)                   // ✗ 에러
showInfo(message)                    // ℹ 정보
```

---

## 🌐 Services 상세

### socketService.js (싱글톤)

**책임**: Socket.IO 클라이언트 관리

**설정**:
```javascript
serverUrl: 'http://localhost:3001'  // 환경 변수로 설정 가능
reconnection: true                   // 자동 재연결
reconnectionAttempts: 5
reconnectionDelay: 1000ms
timeout: 10000ms
```

**이벤트**:
- `connect`: 연결 성공
- `disconnect`: 연결 해제
- `connect_error`: 연결 실패
- `reconnect_attempt`: 재연결 시도
- `registered`: 자동 룸 생성 완료
- `subscribed`: 룸 입장 성공
- `room-not-found`: 룸 없음
- `message`: 메시지 수신
- `user-left`: 사용자 퇴장

**Best Practices**:
- Promise 기반 비동기 처리
- 타임아웃으로 무한 대기 방지
- 이벤트 리스너 cleanup
- 재연결 전략 구현

---

### supabaseService.js (싱글톤)

**책임**: Supabase Storage 클라이언트

**설정**:
```javascript
supabaseUrl: process.env.VITE_SUPABASE_URL
supabaseKey: process.env.VITE_SUPABASE_KEY
bucketName: 'test'
```

**파일 경로 구조**:
```
test/                              # 버킷
├── ROOM_ID_1/                     # 룸별 폴더
│   ├── 1638461234567_a3b7x9.png
│   └── 1638461245678_z9y8x7.jpg
└── ROOM_ID_2/
    └── ...
```

**주요 메서드**:
```javascript
generateFileName(extension)           // 타임스탬프 + 랜덤 문자열
getFileUrl(roomId, fileName)         // 공개 URL 생성
loadFiles(roomId, options)           // 파일 목록 조회
uploadFile(roomId, file, options)    // 파일 업로드
deleteFile(roomId, fileName)         // 파일 삭제
deleteAllFiles(roomId)               // 룸 전체 파일 삭제
```

**Best Practices**:
- 파라미터 검증
- 구조화된 에러 처리
- 폴더 플레이스홀더 필터링
- 표준화된 파일 객체 반환

---

### notificationService.js (싱글톤)

**책임**: 전역 알림 관리

**구현**:
```javascript
notification: Ref<string|null>     // 반응형 상태
defaultDuration: 3000ms            // 기본 3초 표시
currentTimer: TimeoutID            // 자동 숨김 타이머

showNotification(message, duration)
hideNotification()
showSuccess(message)    // "✓ " 접두사
showError(message)      // "✗ " 접두사 (5초)
showInfo(message)       // "ℹ " 접두사
```

**특징**:
- 타이머 정리로 메모리 누수 방지
- 새 알림이 뜨면 이전 타이머 클리어

---

## 🔄 데이터 플로우

### 1. 앱 초기화

```
main.js
  └─> createApp(App).mount('#app')
       └─> App.vue
            ├─> onMounted()
            │    ├─> connectToRoom()
            │    │    ├─> socket.connect()
            │    │    ├─> socket.joinRoom()
            │    │    ├─> fileManager.loadFiles()
            │    │    └─> setupSocketListeners()
            │    └─> document.addEventListener('paste')
            └─> render RoomScreen
```

### 2. 이미지 업로드 플로우

```
User                           App.vue                    Services
  │                              │                          │
  ├─ Ctrl+V (paste) ───────────>│                          │
  │                              ├─ handlePaste()           │
  │                              ├─ extractImagesFromPaste()│
  │                              │                          │
  │                              ├─ uploadFile() ──────────>│ supabaseService
  │                              │<─ { url, fileName } ─────┤
  │                              │                          │
  │                              ├─ publishMessage() ──────>│ socketService
  │                              │                          ├─> emit('publish')
  │                              │                          │
  │                              ├─ addFile() (local UX)    │
  │                              └─ showSuccess()           │
  │<─ UI 업데이트 ────────────────┤                          │
```

### 3. 실시간 동기화 플로우

```
User A                         Server                     User B
  │                              │                          │
  ├─ upload image ──────────────>│                          │
  │                              ├─ broadcast 'message' ───>│
  │                              │                          ├─ onMessage()
  │                              │                          ├─ loadFiles()
  │                              │                          └─ UI 업데이트
```

---

## 🎨 Vue 3 Best Practices 적용

### 1. Composition API

- `<script setup>` 사용으로 간결한 컴포넌트
- Composables로 로직 재사용
- `ref()`와 `readonly()`로 반응형 상태 관리

### 2. 책임 분리

- **Components**: UI 렌더링만
- **Composables**: 비즈니스 로직 캡슐화
- **Services**: 외부 API 통신

### 3. 이벤트 처리

- Props Down, Emit Up 패턴
- 명시적 `defineProps()`, `defineEmits()`
- 이벤트 리스너 cleanup (메모리 누수 방지)

### 4. 라이프사이클 관리

```javascript
onMounted(() => {
  // 초기화
  connectToRoom()
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  // 정리
  cleanupUserLeft()
  cleanupOnMessage()
  document.removeEventListener('paste', handlePaste)
  socket.disconnect()
})
```

---

## 🔐 환경 변수

`.env` 파일에 다음 변수 설정 필요:

```env
VITE_SOCKET_URL=http://localhost:3001
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

---

## 🧪 테스트 전략

현재 테스트 파일:
```
composables/
  ├── useClipboard.test.js
  ├── useRoomManager.test.js
  ├── useFileManager.test.js
  └── useFileManager.integration.test.js

components/
  └── RoomScreen.test.js

services/
  └── socketService.test.js
```

**테스트 도구**:
- Vitest (Unit Testing)
- @vue/test-utils (Component Testing)
- happy-dom / jsdom (DOM Mocking)

---

## 🚀 실행 방법

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 테스트
npm run test
npm run test:ui  # UI 모드
```

---

## 📊 상태 관리 흐름도

```
┌─────────────────────────────────────────┐
│  App.vue (State Orchestrator)          │
│                                         │
│  const roomManager = useRoomManager()   │
│  const fileManager = useFileManager()   │
│  const socket = useSocket()             │
│  const clipboard = useClipboard()       │
│  const notification = useNotification() │
└────────┬────────────────────────────────┘
         │
         ├─> roomManager.currentRoomId ──> RoomScreen (props)
         ├─> fileManager.files ──────────> RoomScreen (props)
         ├─> socket.usersInRoom ─────────> RoomScreen (props)
         └─> notification.notification ──> NotificationToast (props)
```

---

## 🔍 디버깅 팁

1. **Socket 이벤트 추적**:
   - 모든 Service에 `console.log` 추가됨
   - 브라우저 개발자 도구 > Network > WS 탭

2. **Supabase Storage 확인**:
   - Supabase Dashboard > Storage > test 버킷

3. **반응형 상태 디버깅**:
   - Vue DevTools 사용

---

## 📝 코드 컨벤션

1. **파일 명명**:
   - Components: PascalCase (예: `RoomScreen.vue`)
   - Composables: camelCase with `use` prefix (예: `useRoomManager.js`)
   - Services: camelCase with `Service` suffix (예: `socketService.js`)

2. **주석**:
   - JSDoc 스타일 함수 문서화
   - 각 파일 상단에 역할 설명

3. **에러 처리**:
   - try-catch로 모든 비동기 작업 감싸기
   - 사용자 친화적 에러 메시지

---

## 🎯 향후 개선 사항

1. **상태 관리 라이브러리**: Pinia 도입 고려
2. **타입 안전성**: TypeScript 마이그레이션
3. **오프라인 지원**: Service Worker + IndexedDB
4. **이미지 최적화**: 압축, 썸네일 생성
5. **테스트 커버리지**: E2E 테스트 추가

---

**작성일**: 2025-11-18
**버전**: 1.0
**작성자**: Architecture Documentation
