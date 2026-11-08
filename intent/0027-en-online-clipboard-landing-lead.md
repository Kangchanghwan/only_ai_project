# Intent: "online clipboard" 착지 페이지 첫 문단에 숫자·기준일·파일 공유 표현 넣기

Author: growth-operator (agent). Status: shipped. Created: 2026-11-02.
Trigger: 정기 (bands 최고 등급 ok). ai-visibility.md 3절 큐 A(착지 페이지 첫 문단) + 10-31 피드백 "11월은 색인된 기존 페이지 보강".

## Problem
- GSC 10-24–10-30 "online clipboard" 노출 223 / 클릭 1 (CTR 0.4%), 평균 순위 15.2 (10-17–10-23 순위 10.0). 착지 1위는 /en/guide/online-clipboard-copy-paste-between-devices.html (157 노출, 순위 11.2), /en/ 은 66 (24.5).
- 이 페이지 첫 화면에는 파일 용량·보관 기간·잠금 같은 구체적 숫자와 기준일이 없다. ai-visibility.md "인용되기 쉬운 문장 규칙"(숫자·기준일)을 아직 적용하지 않은 색인된 페이지다.
- A 검색어("online clipboard file share" 등)는 3개월 노출 33 이하이고 착지가 /en/ 이다. /en/ 홈 타이틀·카피는 0001 롤백 사례가 있어 건드리지 않고, 같은 묶음의 대표 가이드 첫 문단에 "online clipboard for file sharing" 표현을 1회 넣는다.

## Proposed outcome
7일(11-09) 이 URL 노출이 지난 7일(10-24–10-30, 쿼리 기준 157) 이상 유지되고 CTR 1% 이상. 후행: AI 언급표 q2·q9에서 이 URL 인용 여부.

## Change
- frontend/public/en/guide/online-clipboard-copy-paste-between-devices.html: 두 번째 문단을 "As of November 2026" 기준일 + 가입·앱 없음 + 파일당 5GB + 원하는 파일만 비밀번호 잠금 + 모든 기기가 나가면 삭제(파일은 최대 약 1일) 문장으로 교체. dateModified 2026-11-02. 제목·설명·h1은 그대로(순위 위험 최소화).
- sitemap.xml lastmod 2026-11-02, llms-full.txt 재생성. (자동 머지 허용 경로)

## Constraints
- 사실은 llms.txt·비교 가이드(0025)에 이미 쓴 문장과 같게: 5GB(backend uploadLimits), 최대 약 1일, 모든 기기가 나가면 삭제, 필요한 파일만 잠금. "최초·유일·완벽" 금지.
- "online clipboard" 순위가 이미 흔들리는 중(10-29 9.4 → 10-30 33.7 부분값)이라 효과와 외부 변동이 섞일 수 있다. 일별 표로 같이 본다.

## Measure
선행(7일, 11-09): 이 URL 노출·CTR·순위, "online clipboard" 일별 순위. 후행(28일, 11-30): 클릭. 기존 페이지 수정이라 배포일부터 센다.

## Open questions

## Result
- 2026-11-02 배포. 7일 판독 11-09, 28일 11-30.
- 2026-11-09 7일 판독(GSC 최신 11-06이라 11-02–11-06 5일, 정확일치 page=!): 노출 95 / 클릭 1 / CTR 1.1% / 순위 19.4. 목표(7일 157 이상)에는 못 미침. 다만 일별 순위는 배포 전 10-30–11-01 24.4·24.0·38.5(하루 노출 8~16)에서 배포 후 24.8 → 24.7 → 14.8 → 17.7 → 14.1(하루 13~27)로 오히려 올라왔고, 하락 시작(10-30)이 배포(11-02)보다 앞선다(intent 0033). → 0027이 원인이 아니므로 원복하지 않고 rejected도 하지 않음(판정 보류). 이 URL의 "online clipboard" 쿼리 노출은 27 / 순위 38.9(10-31–11-06). 28일 판독 11-30.
