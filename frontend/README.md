# 📋 Clipboard Share

다른 디바이스와 이미지를 실시간으로 공유하는 웹 애플리케이션

## 🚀 주요 기능

- **룸 기반 공유**: 6자리 랜덤 코드로 다른 디바이스와 연결
- **실시간 동기화**: 1초 간격으로 자동 업데이트
- **간편한 업로드**: Ctrl+V (Cmd+V)로 클립보드의 이미지 즉시 업로드
- **쉬운 복사**: 이미지 클릭으로 클립보드에 복사
- **크로스 플랫폼**: OS에 상관없이 모든 디바이스에서 사용 가능

## 🛠️ 기술 스택

- **프론트엔드**: Vue 3 (Composition API)
- **빌드 도구**: Vite
- **백엔드/스토리지**: Supabase
- **테스트**: Vitest + Vue Test Utils
- **개발 방법론**: TDD (Test-Driven Development)

## 📦 설치 및 실행

### 필수 요구사항

- Node.js 20.19+ 또는 22.12+
- npm 또는 yarn

### 설치

```bash
# 의존성 설치
npm install
```

### 개발 서버 실행

```bash
# 개발 모드 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

### 테스트 실행

```bash
# 테스트 실행
npm test

# UI 모드로 테스트 실행
npm run test:ui
```

### 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 🧪 테스트 커버리지

TDD 방식으로 개발되었으며, 다음 핵심 기능들이 테스트되었습니다:

### 룸 관리 (useRoomManager)
- ✅ 6자리 영숫자 룸 코드 생성
- ✅ 랜덤 코드 중복 방지
- ✅ 새 룸 생성
- ✅ 기존 룸 입장
- ✅ 빈 코드 입력 방지
- ✅ 공백 제거 및 대소문자 변환
- ✅ 룸 나가기

### 파일 관리 (useFileManager)
- ✅ 파일 목록 로드
- ✅ 이미지 업로드
- ✅ 파일명 타임스탬프 생성
- ✅ 파일 URL 생성
- ✅ .emptyFolderPlaceholder 필터링
- ✅ 파일 크기 제한 검증 (환경 변수 기반)
- ✅ 빈 파일 검증
- ✅ 크기 초과 파일 에러 처리

### 클립보드 (useClipboard)
- ✅ 텍스트 복사
- ✅ 이미지 복사
- ✅ 이미지 복사 실패 처리
- ✅ 붙여넣기 이벤트에서 이미지 추출
- ✅ 이미지가 아닌 항목 필터링

**총 24개 테스트 통과**

## 📁 프로젝트 구조

```
src/
├── components/          # Vue 컴포넌트
│   ├── HomeScreen.vue       # 홈 화면 (룸 생성/입장)
│   ├── RoomScreen.vue       # 룸 화면 (파일 갤러리)
│   └── NotificationToast.vue # 알림 토스트
│
├── composables/         # Vue Composables (비즈니스 로직)
│   ├── useRoomManager.js     # 룸 관리
│   ├── useRoomManager.test.js
│   ├── useFileManager.js     # 파일 업로드/로드
│   ├── useFileManager.test.js
│   ├── useClipboard.js       # 클립보드 기능
│   └── useClipboard.test.js
│
├── App.vue              # 메인 앱 컴포넌트
├── main.js              # 엔트리 포인트
└── style.css            # 글로벌 스타일
```

## 💡 사용 방법

### 1. 새 룸 만들기

1. "새 룸 만들기" 버튼 클릭
2. 6자리 룸 코드가 자동으로 생성됨
3. 룸 코드를 다른 디바이스와 공유

### 2. 룸 코드로 입장

1. "룸 코드로 입장" 버튼 클릭
2. 6자리 룸 코드 입력
3. "입장" 버튼 클릭

### 3. 이미지 공유

**업로드:**
- 이미지를 클립보드에 복사 (Ctrl+C / Cmd+C)
- 웹페이지에서 Ctrl+V (Cmd+V) 입력
- 이미지가 자동으로 업로드되고 모든 디바이스에 표시됨

**복사:**
- 갤러리에서 이미지 클릭
- 클립보드에 자동으로 복사됨
- 다른 앱에 Ctrl+V (Cmd+V)로 붙여넣기

## 🔧 환경 설정

### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 입력하세요:

```bash
# Socket.IO 서버 URL
VITE_SOCKET_URL=http://localhost:3001

# Supabase 설정
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-supabase-anon-key

# 파일 업로드 크기 제한 (MB 단위, 기본값: 10)
VITE_MAX_FILE_SIZE_MB=10
```

`.env.example` 파일을 참고하여 설정할 수 있습니다.

### Supabase Storage 버킷 생성

1. Supabase 대시보드에서 Storage 선택
2. 'test' 이름으로 Public 버킷 생성
3. Storage Policies에서 다음 정책 추가:
   - INSERT: Public Upload
   - SELECT: Public Read
   - DELETE: Public Delete (선택사항)

## 🌐 브라우저 호환성

- Chrome/Edge: 완벽 지원
- Firefox: 완벽 지원
- Safari: 이미지 복사 제한적 (우클릭 복사 사용)

## 📝 개발 히스토리

이 프로젝트는 **TDD(Test-Driven Development)** 방식으로 개발되었습니다:

1. ✅ 테스트 환경 설정 (Vitest, Vue Test Utils)
2. ✅ 핵심 기능 테스트 작성 (19개 테스트)
3. ✅ 테스트를 통과하는 코드 구현
4. ✅ 컴포넌트 UI 구현
5. ✅ 모든 테스트 통과 확인

## 📄 라이센스

MIT License

## 👨‍💻 개발자

현창환 (Gang Changhwan)

