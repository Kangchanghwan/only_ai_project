# Image Share - 실시간 이미지 공유 애플리케이션

Socket.IO를 활용한 실시간 이미지 공유 애플리케이션입니다.

## 📋 기능

### ✅ 구현된 핵심 기능

1. **자동 룸 생성**
   - 웹 접속 시 자동으로 6자리 룸 번호 생성 (100000-999999)
   - 룸 번호가 웹에 즉시 표시됨

2. **룸 입장**
   - 다른 사용자가 생성한 룸 번호로 입장 가능
   - 실시간으로 사용자 수 확인

3. **실시간 통신**
   - Socket.IO 기반 양방향 실시간 통신
   - 룸 내 모든 사용자에게 즉시 메시지 브로드캐스트

4. **사용자 관리**
   - 사용자 입장/퇴장 실시간 알림
   - 빈 룸 자동 정리

## 🏗️ 프로젝트 구조

```
.
├── backend/                # Socket.IO 서버 (Node.js + TypeScript)
│   ├── src/
│   │   ├── server.ts      # 메인 서버 로직
│   │   └── __tests__/     # Jest 테스트
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
└── frontend/              # Vue 3 클라이언트
    ├── src/
    │   ├── App.vue        # 메인 앱 컴포넌트
    │   ├── components/    # UI 컴포넌트
    │   └── composables/   # Vue 컴포저블
    │       └── useSocket.js  # Socket.IO 클라이언트
    └── package.json
```

## 🚀 시작하기

### 사전 요구사항

- Node.js 22.9.0 이상
- npm 또는 yarn

### 백엔드 서버 실행

```bash
cd backend

# 의존성 설치
npm install

# 개발 모드 실행 (hot reload)
npm run dev

# 테스트 실행
npm test

# 프로덕션 빌드
npm run build
npm start
```

서버는 **http://localhost:3001** 에서 실행됩니다.

### 프론트엔드 실행

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

프론트엔드는 **http://localhost:5174/** 에서 실행됩니다.

## 📡 Socket.IO 이벤트

### 서버 → 클라이언트

| 이벤트 | 파라미터 | 설명 |
|-------|---------|------|
| `registered` | `roomNumber: number` | 새 룸 생성 완료, 룸 번호 반환 |
| `subscribed` | `roomNumber: number, userCount: number` | 기존 룸 입장 성공 |
| `room-not-found` | - | 존재하지 않는 룸 입장 시도 |
| `message` | `msg: any` | 룸 내 메시지 수신 |
| `user-left` | `userCount: number` | 사용자 퇴장 알림 |

### 클라이언트 → 서버

| 이벤트 | 파라미터 | 설명 |
|-------|---------|------|
| `join` | `roomNumber: number` | 기존 룸 입장 요청 |
| `publish` | `message: any` | 룸에 메시지 전송 |

## 🎯 사용 흐름

### 1. 새 룸 생성

1. 웹 브라우저에서 http://localhost:5174/ 접속
2. "새 룸 생성" 버튼 클릭
3. **자동으로 생성된 6자리 룸 번호가 화면에 표시됨**
4. 이 번호를 다른 사용자와 공유

### 2. 기존 룸 입장

1. 웹 브라우저에서 http://localhost:5174/ 접속
2. "룸 입장" 버튼 클릭
3. 공유받은 6자리 룸 번호 입력
4. 입장하면 현재 룸에 있는 사용자 수 표시

### 3. 이미지 공유 (예정)

- Ctrl+V (Mac: Cmd+V)로 클립보드 이미지 업로드
- 업로드된 이미지는 같은 룸의 모든 사용자에게 실시간 표시

## 🧪 테스트

백엔드는 TDD(Test-Driven Development) 방식으로 개발되었습니다.

```bash
cd backend

# 전체 테스트 실행
npm test

# 테스트 감시 모드
npm run test:watch

# 커버리지 확인
npm run test:coverage
```

### 테스트 커버리지

- ✅ 룸 생성 플로우
- ✅ 룸 입장 플로우
- ✅ 메시지 브로드캐스팅
- ✅ 사용자 퇴장 처리

## 🛠️ 기술 스택

### 백엔드
- **Node.js** - 런타임 환경
- **TypeScript** - 타입 안전성
- **Socket.IO** - 실시간 양방향 통신
- **Express** - HTTP 서버
- **Jest** - 테스트 프레임워크

### 프론트엔드
- **Vue 3** - 프론트엔드 프레임워크
- **Vite** - 빌드 도구
- **Socket.IO Client** - 실시간 통신 클라이언트

## 🔧 환경 설정

### 백엔드 (.env)

```env
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174
```

### 프론트엔드 (.env)

```env
VITE_SOCKET_URL=http://localhost:3001
```

## 📝 개발 원칙

1. **TDD (Test-Driven Development)**
   - 테스트 먼저 작성
   - 테스트를 통과하는 최소한의 코드 작성
   - 리팩토링

2. **타입 안전성**
   - TypeScript strict 모드
   - 명확한 인터페이스 정의

3. **관심사 분리**
   - RoomManager 클래스로 룸 로직 캡슐화
   - Vue Composables로 기능 모듈화

4. **에러 처리**
   - Promise 기반 비동기 처리
   - 타임아웃 설정
   - 명확한 에러 메시지

## 🐛 트러블슈팅

### 포트가 이미 사용 중인 경우

```bash
# 백엔드 (3001 포트)
lsof -ti:3001 | xargs kill -9

# 프론트엔드 (5174 포트)
lsof -ti:5174 | xargs kill -9
```

### Socket.IO 연결 오류

1. 백엔드 서버가 실행 중인지 확인
2. CORS 설정 확인 (backend/.env)
3. 브라우저 콘솔에서 연결 상태 확인

## 📄 라이선스

ISC

## 👥 기여

프로젝트 개선을 위한 이슈 및 풀 리퀘스트를 환영합니다!
