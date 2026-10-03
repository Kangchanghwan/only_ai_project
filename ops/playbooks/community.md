# Community & directories (수요일, 주 1곳)

자동 게시 (goal.md 2026-10-02 결정). 단 아래 규칙을 모두 지킨다.
2026-10-02 지식iN 대신 커뮤니티 비중을 늘림: 수요일 = 카페/런칭 1곳, 토요일 = 디스콰이엇 메이커 로그.

## 규칙
1. 게시 전에 그 채널의 자기홍보 규칙(공지, 사이드바, rules)을 읽는다. 금지거나 조건(활동 이력, 특정 요일, 태그)을 못 맞추면 건너뛰고 리포트에 이유를 적는다.
2. 계정이 없으면 owner의 Google(lgodl3512@gmail.com) 또는 GitHub OAuth로 가입해도 된다(2026-10-02 허용). OAuth가 없거나 막히면(구글 패스키 확인 등) 이메일+비밀번호로 가입한다. 비밀번호는 password-manager 스킬의 generatePassword → fillPassword → createItem(Vault 저장)으로만 다룬다. 플랫폼당 1계정, 프로필에 제작자임을 밝힌다. 휴대폰·신분 인증이나 결제가 필요하면 중단하고 "owner 요청"으로 보고.
3. 채널당 런칭 글은 평생 1회. 이후에는 댓글 질문에 답하는 것만 (다음 실행 때 확인).
4. 글은 채널 언어·문화에 맞게 새로 쓴다. 만든 이유(학교에서 폰↔PC 파일 옮기기 불편), Claude Code로 만든 과정, 피드백 요청을 담는다. 과장·순위 조작·다른 사람인 척 금지.
5. 게시 결과(URL, 날짜, 반응)를 아래 표에 직접 업데이트한다 (이 파일은 자동 머지 허용 경로).

## 공통
- 사이트 캡처·테스트 전에 https://www.clipboardapp.org/?internal=1 을 먼저 열어 GA 집계에서 빠진다 (PR #50 머지 후 유효).
- 글은 채널 독자에 맞춰 새로 쓴다. 같은 본문 복붙 금지.
- 게시 후 다음 월요일에 댓글을 확인하고 질문·피드백에 답한다. 받은 피드백은 intent 후보로 기록한다.

## 계정 표 (가입·로그인 상태, 에이전트가 갱신)
| 플랫폼 | 계정 | 가입 방식 | 상태 | 메모 |
|---|---|---|---|---|
| 네이버 (블로그·카페) | lgodl1598 / 코카곰 | 기존 | 사용 중 | |
| velog | @ch_kang | 기존 | 사용 중 | |
| 디스콰이엇 | 코카곰 https://disquiet.io/profiles/ZBtVZyj | 이메일 매직링크 (lgodl3512@gmail.com, Gmail에서 링크 열어 로그인) | 프로덕트 승인 대기 (2026-10-02 등록, 10-03 재확인 여전히 대기) | 승인 전엔 포스트 불가. 승인되면 drafts의 메이커 로그를 제품 연결 "포스트"로 게시. 아티클은 막힘 |
| DEV.to | @kangchanghwan (CokeBear) https://dev.to/kangchanghwan | GitHub OAuth | 사용 중 | 첫 글 2026-10-02. 알림은 lgodl1598@naver.com. 게시 때마다 AI 공개 옵션 설정, velog 원문이면 canonical 지정 |
| Reddit | u/Dry_Recognition_3070 (표시명 CokeBear) | Google OAuth | karma 쌓는 중 | 아이디 자동 생성(변경 불가). 2026-10-16 전까지 자기홍보 글 금지, 도움 댓글만 |
| Product Hunt | @kangchanghwan (CokeBear) https://www.producthunt.com/@kangchanghwan | GitHub OAuth | 런칭 대기 | 2026-10-09 이후 화~목 00:01 PT 런칭, 1주 전 owner 예고 |
| GeekNews | cokebear https://news.hada.io/@cokebear | 이메일+비밀번호 (Vault "GeekNews (cokebear)") | 글쓰기 잠금 (가입 2026-10-02 16:53) | 2026-10-09부터 글·댓글 가능. 그날 글등록 열렸는지 확인 후 Show GN (초안: 하네스 각도) |
| AlternativeTo | user-7504 (표시명 CokeBear) | owner가 Google로 가입. 로그인은 반드시 "Google" 버튼 (Vault의 "ALTERNATIV NET" 비밀번호는 맞지 않음, 시도 금지) | 앱 심사 대기 (일반 큐, 매우 김) | 앱 "Clipboard Share Web" https://alternativeto.net/software/clipboard-share-web/ (승인 전 비공개, 링크 공유 금지). 유료 우선심사($5/$15) 거절. 대안 연결: LocalSend, PairDrop, AirDrop |

## 새 계정 에티켓
- Reddit: 새 계정은 karma가 낮아 자기홍보 글이 자동 삭제되기 쉽다. 가입 후 1~2주는 관련 서브레딧에서 도움 되는 댓글만 달고, 런칭 글은 그 뒤에 규칙을 확인하고 올린다.
- Product Hunt: 새 계정은 런칭 제한이 있을 수 있다. 가입 후 프로필을 채우고 1주 이상 지나서 런칭하며, 런칭일은 1주 전에 owner에게 알린다.
- DEV.to / Hashnode: 원문이 velog면 canonical URL을 velog 글로 지정한다. 영어로 새로 쓴다(직역 금지).
- 디렉터리(AlternativeTo, SaaSHub 등): 등록은 1회. 설명은 사실만, 대체 대상은 실제로 대체 가능한 것만(Snapdrop, PairDrop, AirDrop 등).

## 실행 팁 (2026-10-02 첫 게시에서)
- "로그인됨"을 가정하지 말고 시작할 때 프로필 메뉴로 실제 로그인 상태를 확인한다.
- 카페는 공지만 보지 말고 카페 내 검색("만들었습니다", "무료", "도구")으로 자작 도구 소개 선례가 어느 게시판에서 어떤 반응을 얻었는지 확인해 허용 범위를 판단한다. 공지가 "상업적 홍보 금지"면 무료·비상업·피드백 요청 형식으로만 쓴다.
- 공개 글에는 학교 이름 대신 "중학교 디지털튜터" 정도로 쓴다.
- 스마트에디터: URL을 친 뒤 다음 줄로 넘기고 3~4초 기다렸다가 이어서 입력해야 링크 카드가 문단 중간에 끼지 않는다. 사진 파일은 현재 세션의 실제 tmp 폴더에 있어야 업로드된다.
- 예상 질문(선례 기준): "AI로 어떻게 만들었나", "보안은 괜찮나", "유료인가". 답글에 쓸 수 있게 준비한다.

## A. 네이버 카페 큐 (owner가 이미 가입한 카페만, 주 1곳)
카페마다 공지·게시판 안내를 먼저 읽는다. 홍보 금지, 등급 제한, 특정 게시판만 허용이면 그대로 따르고, 안 되면 건너뛴다.
| # | 카페 | 독자 | 각도 | 상태 | URL / 메모 |
|---|---|---|---|---|---|
| 1 | 디튜모: 디지털튜터 모임 (cafe.naver.com/ditu3387) | 학교 디지털튜터 | 교실 PC에 카톡 로그인 없이 폰 사진·파일 옮기기 | 게시 (2026-10-02, 도구추천·활용팁 게시판) | https://cafe.naver.com/ditu3387/4702 · 카페 규칙상 댓글 달린 글 삭제 금지, 댓글엔 감사 답글 |
| 2 | BBC 마이크로비트 사용자 모임 (cafe.naver.com/bbcmicro) | 코딩 교육 교사 | 수업 자료·학생 화면 캡처를 교실 PC로 | 대기 | |
| 3 | 한국방송통신대학교 컴퓨터과학과 (cafe.naver.com/sknou) | 컴과 학생·직장인 | 직접 만든 사이드 프로젝트 공유 + Claude Code 개발기 | 대기 | |
| 4 | 남궁성의 코드초보스터디 (cafe.naver.com/javachobostudy) | 입문 개발자 | 프로젝트 자랑/소개 게시판이 있으면 | 대기 | |
| 5 | 메타코딩 (cafe.naver.com/metacoding) | 개발자 | Socket.IO·R2 멀티파트 구현기 | 대기 | |
| 6 | 개발자 포럼 & 랭크커뮤니티 (cafe.naver.com/rankcommunity) | 개발자 | 프로젝트 소개 | 대기 | |
| 7 | 유니티 허브 (cafe.naver.com/unityhub) | 게임 개발자 | 빌드·스크린샷을 폰↔PC로 옮기기 | 대기 | |

## B. 디스콰이엇
- 프로덕트 페이지 1회 등록, 이후 매주 토요일 메이커 로그 1개: 이번 주 배포한 것, 지표 변화, AI 에이전트 운영 실험에서 배운 점. 숫자는 ops/reports 에 있는 것만.
- 첫 메이커 로그 초안: ops/reports/2026-10-03.md "디스콰이엇 메이커 로그 초안". 승인되면 숫자를 그날 기준으로 갱신해 게시.

## C. 런칭 큐 (계정 없으면 Google/GitHub OAuth로 가입 후 진행)
| # | 채널 | 형식 | 상태 | URL / 메모 |
|---|---|---|---|---|
| 1 | AlternativeTo | Snapdrop·PairDrop·AirDrop·LocalSend의 대체 앱으로 등록 | 제출 완료 (2026-10-02, 심사 대기) | 월요일마다 My submissions 상태 확인 |
| 2 | GeekNews (news.hada.io) | Show GN 글 (레포 또는 사이트 중 하나만, 같은 프로젝트 재등록 불가) | 계정 대기 | 초안: 하네스 각도 |
| 4 | SaaSHub / Toolify 류 무료 디렉터리 | 무료 등록만 (유료 리스팅 금지) | 대기 | |
| 5 | Reddit r/SideProject | 런칭 글 (규칙 확인) | 대기 | |
| 6 | Reddit r/InternetIsBeautiful | 규칙이 엄격함, 조건 맞을 때만 | 대기 | |
| 7 | Product Hunt | 런칭 (화~목 00:01 PT 권장, 준비물 많음, 1주 전 owner에게 예고) | 대기 | |
| 8 | 인디스쿨 등 교사 커뮤니티 | 교사 인증 필요할 가능성 높음 → 불가하면 owner 조치 필요 | 대기 | |
| 10 | DEV.to (영어) | velog 개발기를 영어로 다시 써서 매주 크로스포스트. 구글 노출 대부분이 영어권이라 효과 큼 | 진행 중 | https://dev.to/kangchanghwan/i-let-an-ai-agent-run-my-side-projects-growth-loop-intentmd-ci-gates-and-metric-bands-1jmo |
| 11 | Hashnode / Medium (영어) | DEV.to와 같은 글, canonical은 원문 | 계정 필요 | |
| 9 | 클리앙 / 뽐뿌 사이트 소개 게시판 | 게시판 규칙 확인 | 대기 | |

큐가 끝나면 GSC/GA4 리퍼러에서 실제로 유입이 있었던 채널 유형과 비슷한 곳을 찾아 큐에 추가한다.
