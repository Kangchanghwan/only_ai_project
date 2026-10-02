# velog 개발기 (매주 목요일)

자동 발행. 시리즈 진행 상황은 루틴 메모리와 ops/reports 에 기록하고, velog.io/@ch_kang/posts 에서 중복을 확인한다.
지어낸 에피소드는 쓰지 않는다.

코드 사실은 반드시 origin/master 기준으로 직접 읽어 확인하고(git CLI가 막혀 있으면 https://raw.githubusercontent.com/Kangchanghwan/only_ai_project/master/<path> 를 fetch), 실제 코드 조각을 짧게 인용하세요. 추측한 구현 내용은 쓰지 마세요. 커밋/PR 맥락은 git log 또는 GitHub 커밋 페이지에서 확인하세요.

현재 제품 사실 요약 (2026-10-01, PR #35~#46 반영. 글에 쓰기 전 코드로 재확인): 파일당 5GB/방 10GB/IP당 하루 20GB, 1MB 미만은 서버 경유, 100MB 이하 R2 단일 PUT presigned, 초과는 64MiB 멀티파트 + 이어올리기, 업로드 취소, 룸 토큰(X-Room-Token) 인증, 동물+형용사 기기 이름표, P2P는 연결 가능성 측정(probe)만 있고 실제 전송은 R2 경유, 반응형 레이아웃(760/1040/1100px), 파일 최대 약 1일 보관, 21개 로케일. 예전 "최대 100MB", "480px 폰 프레임" 서술은 과거형으로만 쓸 것.

톤: 개발기, 반말, 솔직하고 짧은 문장. 계정 velog @ch_kang (CokeBear). AI(Claude Code)로 만들었다는 언급 허용. "왜 이렇게 바꿨나 → 어떻게 → 뭐가 아직 아쉬운가" 흐름 권장. 마지막에 https://www.clipboardapp.org 링크와 "써보고 피드백 달라"는 한 줄(사이트 하단 "건의하기"도 언급 가능). 지어낸 에피소드는 쓰지 않는다.

시리즈 순서 (루틴 메모리에 몇 편까지 썼는지 기록, velog 목록에서 중복 확인):
1. 로그인 없이 "같은 와이파이"만으로 방을 만드는 법 - IP 해시 룸 설계 (backend/src/utils/clientIp.ts: HMAC-SHA256(secret, normalized IP) 앞 12자리, IPv6 /64 그룹, CF-Connecting-IP → X-Forwarded-For → socket 순서). 이미 초안 있음(루틴 메모리 경로), 미발행이면 이것부터 다듬어 발행.
2. 업로드 경로를 3단으로 나눈 이유: 1MB 미만 서버 경유 / 100MB 이하 R2 presigned 단일 PUT / 그 이상 멀티파트 (backend/src/server.ts DIRECT_UPLOAD_MAX_SIZE, backend/src/utils/uploadLimits.ts SINGLE_PUT_MAX_MB, backend/src/services/r2Service.ts)
3. 100MB 한도를 5GB로: R2 멀티파트·이어올리기·업로드 취소 (frontend/src/services/multipartUploader.js 64MiB 파트, 동시 4/모바일 2, 재시도·재서명·오프라인 일시정지·localStorage 재개; backend/src/routes/multipart.ts, utils/multipartStore.ts, utils/dailyQuota.ts IP 일일 한도, 룸 정리 시 진행 중 멀티파트 abort)
4. roomId만 알면 남의 방 목록이 보였다: 룸 토큰 도입기 (backend/src/utils/roomToken.ts, middleware/roomAuth.ts, ROOM_TOKEN_ENFORCE=false "보고 전용" 모드로 단계적 적용, frontend/src/services/roomTokenStore.js)
5. 로그인 없이 기기 구분하기: 동물+형용사 이름표 (backend/src/utils/identity.ts 할당·다시 뽑기·보낸 사람 스탬핑, frontend MyIdentity.vue / DeviceList.vue, Fluent Emoji SVG 24종 MIT)
6. P2P로 갈까? WebRTC 연결 가능성부터 재봤다 (frontend/src/services/p2pProbe.js, p2p:signal 중계, GA4 p2p_probe). 실제 전송은 아직 P2P가 아님을 분명히 쓰고, 측정 데이터는 GA4에서 확인 가능할 때만 인용.
7. 480px 폰 프레임을 버리고 반응형으로 (760/1040px, 1100px 좌측 기기 패널, 44px hit area, 받은 파일·텍스트 UI 개편)
8. PWA Web Share Target으로 갤럭시 공유 시트에 넣기
9. Claude Code로 하루에 PR 여러 개 머지한 날: 2026-10-01 PR #36~#46 (.claude/ 디렉터리, 기능 브랜치 → PR → 머지 흐름, 실제로 뭘 시켰고 뭘 손봤나). PR 개수·순서는 git log로 확인 후 기재.
10. 21개 언어 i18n을 혼자 관리하는 방법 (frontend/src/i18n/i18n.test.js, 코드의 t() 키 존재 검사 테스트, fallbackLocale en, 하드코딩 한국어 i18n 이관)
11 이후: 최근 머지된 PR 중 글감이 될 만한 것.


## 작성과 발행
- 제목에 구글 검색 키워드 포함 (예: "온라인 클립보드", "Socket.IO", "Cloudflare R2 multipart upload", "presigned URL", "WebRTC", "이어올리기"), 태그 5~8개, 150자 요약.
- 이 하네스 자체(intent.md, 자동 머지 게이트, 지표 밴드, 일일 루프)도 시리즈 소재다. "AI 에이전트가 내 사이드 프로젝트를 운영한다" 편을 4주 운영 데이터가 쌓인 뒤 쓴다.
- 발행: velog 에디터 절차(CodeMirror setValue, 태그 입력, 출간하기 → 요약 → 전체 공개 → 출간하기). URL을 리포트에 기록.
