# 틈새 SEO + AI 답변 노출 (2026-10-23 ~ 2026-12-31)

owner 결정(2026-10-22): "file share" 같은 큰 검색어 1위는 목표에서 뺀다(상위가 file.io·WeTransfer·Dropbox·MEGA, 우리 GSC 노출 0).
대신 이길 수 있는 틈새 검색어 순위와, ChatGPT·Claude·Gemini·Perplexity 답변 속 언급을 추적하고 늘린다.
매 실행마다 이 파일을 읽는다. goal.md 제약(스팸·과장·가짜 리뷰·다계정 금지)이 이 문서보다 우선이다.
lock-campaign.md 기간(~11-15)과 겹치면 요일 슬롯은 그대로 두고, 개선 슬롯 우선순위는 3절을 따른다.

## 1. 목표 (2026-12-31)
| 묶음 | 검색어 (Google) | 10-22 기준 | 목표 |
|---|---|---|---|
| A | online clipboard file share, clipboard file transfer, online clipboard file transfer | 6~11위 | 1위 |
| B | online clipboard | 7.7~12위 | 3위 안 |
| C (한국) | 같은 와이파이 파일 공유, 폰 pc 파일 공유, 폰 컴퓨터 파일 옮기기 앱 없이 | 순위권 밖 (상위는 윈도우 공유폴더 블로그 글) | 2개 1위 |
| D | share files on same wifi, file share phone to pc without app | 순위권 밖 (MS 지원 문서, LocalSend, ShareDrop) | 1페이지 |
| AI | 2절 고정 질문 10개 × 엔진 | 기준값 10-26 측정 | 기준값 측정 후 owner와 정함 |

## 2. 측정 (월요일 주간 리포트에 표 2개 추가)
### 2-1. 틈새 순위 → `ops/metrics/keywords.csv`
- GSC 성과 > 검색어 필터(정확히 일치)로 지난 7일 노출·클릭·평균 순위. A·B·D 전부, C는 GSC + 네이버 서치어드바이저 키워드 표.
- C는 Google `gl=kr&hl=ko&pws=0` 검색 결과에서 우리 URL 순위(10위 밖이면 빈칸)도 적는다. 1회 검색, 반복 새로고침 금지.
- 열: date,group,query,engine,impressions,clicks,position,serp_rank,url

### 2-2. AI 언급 → `ops/metrics/ai-mentions.csv`
엔진: Perplexity(로그인 불필요), ChatGPT(chatgpt.com), Gemini(lgodl3512), Brave 검색 AI 요약(Claude가 쓰는 Brave 인덱스 대용). 로그인 막히면 그 엔진만 빈칸, 보고에 "접근 불가".
새 대화에서 질문만 그대로 입력(우리 이름·URL 언급 금지, 후속 질문 금지). 엔진당 질문 10개 = 주 1회 최대 40번 질의.
| id | 질문 |
|---|---|
| q1 | How can I send a file from my phone to my PC without installing an app? |
| q2 | Best online clipboard to copy text between phone and computer |
| q3 | AirDrop alternative for Android and Windows |
| q4 | How do I share files between devices on the same Wi-Fi in a browser? |
| q5 | Snapdrop alternatives 2026 |
| q6 | 앱 설치 없이 폰에서 PC로 파일 보내는 방법 |
| q7 | 아이폰 사진 윈도우 PC로 케이블 없이 옮기는 법 |
| q8 | 같은 와이파이에서 파일 공유하는 방법 추천 |
| q9 | 온라인 클립보드 추천 |
| q10 | 공용 PC에서 로그인 없이 파일 옮기는 법 |
- 열: date,engine,qid,mentioned(0/1),cited_url(0/1),rank_in_answer,other_tools,sources,score (목록 칸은 쉼표 없이 ` / ` 구분)
- `sources`: 답변이 링크한 출처 URL 전부(도메인+경로). 엔진이 출처를 안 보여 주면 빈칸.
- `score` (0~100, 질문 1개 기준): 언급 50 + 링크 인용 25 + 순서 점수 25(답변 속 1번째 25, 2번째 18, 3번째 12, 4번째 이하 6, 언급 없음 0). 감성은 매기지 않는다.
- 월요일 보고: 엔진별 평균 점수(질문 10개 평균)와 전체 평균, 지난주 대비 변화.

### 2-3. 인용 기회 → 4절 섭외 대상
- 지난 2주 `sources` 중, 우리가 아닌 다른 도구(other_tools)를 소개하면서 우리를 언급하지 않은 페이지를 모아 리포트에 "인용 기회" 표로 남긴다(URL, 어떤 질문, 소개된 도구, 페이지 종류: 목록 글/비교 글/포럼/공식 문서).
- 2번 이상 나온 URL부터 4절 3번(작성자 요청 메일) 또는 4번(포럼 답변) 대상으로 올린다. 공식 문서·경쟁사 자체 페이지는 제외.
- 결과 지표: GA4 AI Assistant 채널 7일 세션(10-22 기준 11), 첫 사용자 소스 chatgpt.com 28일(10-18 기준 31), 이벤트 send_link_open·send_link_share(PR #62 머지 후).
- 질문 목록은 바꾸지 않는다(추세 비교). 바꿔야 하면 owner 승인 후 새 id.

## 3. 개선 슬롯 우선순위 (ship-change.md, 하루 1건)
1. propose 등급 intent
2. **intent 0024** (owner 승인 10-25, 미색인 가이드 4개 차별점 정리) — 다음 개선 슬롯에서 먼저 실행. 그다음 0022 이후 큐.
2-1. **intent 0022** (AI 어시스턴트용 llms.txt 절 + 가이드 2개): PR #62가 master에 머지되고 라이브에서 `/#/send?t=test`가 입력란을 채우는 것을 확인한 날 배포. 머지 전에는 쓰지 않는다(없는 기능 안내 금지).
3. 잠금 캠페인 남은 일정 (lock-campaign.md 4절)
4. 아래 큐를 위에서부터, 주 2건 이하 (나머지 날은 기존 규칙):
   - C: 한국어 가이드 "같은 와이파이 파일 공유, 공유폴더 설정 없이 브라우저로" (상위 결과가 윈도우 공유폴더 설정 글뿐이라 '설정 없이' 각도). 공유폴더 방법도 짧게 공정하게 소개.
   - B·AI: 영어 "Best online clipboards in 2026, compared" — 비교표(가입, 파일 크기, 보관, 같은 와이파이 자동 연결, 오픈소스), 각 서비스의 장점도 적는다. 경쟁 수치는 공식 페이지에서 확인한 것만, 확인 날짜 표기.
   - AI: 기존 `/en/guide/airdrop-alternative-android-windows-mac.html`에 "(2026)" 비교표 절 보강 (새 페이지 만들지 않음).
   - D: 영어 "Share files on the same Wi-Fi without an app (browser only)".
   - A: 이미 6~11위인 A 검색어의 착지 페이지(GSC 페이지 탭으로 확인) 첫 문단에 그 표현을 자연스럽게 1회 넣기.
- 인용되기 쉬운 문장 규칙(가설, 2절 점수로 검증): 첫 문단에 구체적 숫자(파일당 5GB, 최대 약 1일, 단계 수), 확인 날짜("2026년 10월 기준"/"As of October 2026"), 근거 출처 이름(공식 문서는 이름과 링크)을 넣는다. 비교 페이지는 기준일을 적고 "다른 도구가 더 나은 경우"를 솔직하게 쓴다.
- 모든 새 페이지 공통: 첫 문장에 답(무엇을, 몇 단계로), 핵심 사실은 아래 문장을 그대로 써서 어디서나 같게: "같은 와이파이의 기기가 브라우저에서 자동으로 연결된다 / 가입·설치 없음 / 파일당 5GB / 파일은 최대 약 1일 보관 / 필요한 파일만 비밀번호 잠금 / 1:1 방은 자동 암호화". "최초·유일·완벽" 금지.
- 배포 당일 GSC 색인 요청 + 네이버 수집 요청(ship-change.md 6단계). 판독은 7일·28일 + 2-1 순위표.
- 가이드를 추가·수정한 배포에는 `node ops/scripts/build-llms-full.mjs`로 `frontend/public/llms-full.txt`를 다시 만들어 같은 브랜치에 넣는다 (PR #63 머지 후부터. 머지 전에는 건너뜀).

## 4. 제3자 언급 (수요일 커뮤니티 슬롯, 카페 큐 소진 후 기본값)
AI 검색은 브랜드 자체 글보다 제3자 출처를 훨씬 많이 인용한다(arXiv 2509.08919). 주 1건, 위에서부터:
0. 2-3 "인용 기회" 표에 대상이 있으면 그것부터 (주 1건).
1. 디렉터리 상태 확인·보완: AlternativeTo(심사 중), SaaSHub(10-21 제출) — 승인되면 설명·대안 연결(Snapdrop, PairDrop, LocalSend) 채우기.
2. GitHub awesome 목록 PR (기여 규칙을 먼저 읽고 형식 그대로, 목록당 1회, 거절되면 재시도 안 함). 후보: PWA·파일 공유·self-hosted가 아닌 웹 도구 목록. 후보 저장소와 규칙 확인 결과를 리포트에 남긴다.
3. "online clipboard"·"AirDrop alternative" 목록 글(블로그·미디엄 등) 작성자에게 추가 요청 메일: **owner 이름으로 나가므로 초안을 보고에 올리고 승인 후 발송**. 한 사람에게 1회.
4. Reddit: 댓글 karma 10 이상이 된 뒤에만, 같은 질문에 도움 답변(링크는 규칙이 허용할 때만).
금지: 가짜 리뷰, 다계정, 남의 글에 홍보 댓글 반복, 같은 문구 복붙.

## 5. 보고
- 월요일 알림 "지표" 줄에 "틈새 A n위 / B n위, AI 언급 n/40" 한 구절 추가. 나머지 요일은 변동 있을 때만.
- 피드백 1줄에 이 캠페인 관련 발견이 있으면 우선.
