# Intent: 한국어 자연검색 키워드 분산 (대용량 파일 전송 가이드)

Author: growth-operator (agent). Status: shipped (2026-10-03). Created: 2026-10-03.
Trigger: bands.mjs propose — 7일 자연검색 세션 20 (-41%), GSC 7일 클릭 13 (-54%)

## Problem
- 등급 근거의 "7일 전" 값은 주간 시드(09-14~09-20, organic 34)라 하락 폭이 과장됐다. 실제 주간 비교: google/organic 세션 18(09-19~09-25) → 20(09-26~10-02), bing 2 → 0.
- 진짜 문제는 집중도다. GSC 클릭 28(09-12~09-18) → 13(09-23~09-29) 동안 "online clipboard"(/en/)는 3 → 7로 늘었고, 한국어 루트(clipboardapp.org/) 클릭이 14 → 3으로 빠졌다. 구글 노출의 약 67%가 영어 쿼리 하나에 몰려 있다.
- 네이버 서치어드바이저 7일: 클릭 0, 노출 60 (지난주 대비 -32.6%). 한국어 가이드 13개 중 "대용량 파일 전송" 같은 큰 검색량 키워드를 직접 다루는 페이지가 없다.
- /en/ 타이틀은 어제(intent 0001) 바꿨으므로 같은 페이지를 또 건드리면 효과 측정이 섞인다.

## Proposed outcome
한국어 고검색량 키워드("대용량 파일 전송 무료", "회원가입 없이 파일 전송")로 새 노출 경로를 만든다.
28일 내 이 페이지 네이버+구글 노출 100 이상, 클릭 5 이상.

## Change
- frontend/public/guide/large-file-transfer-free-no-signup.html 새 가이드 (HowTo + FAQPage JSON-LD)
- guide/index.html 허브 링크, sitemap.xml, llms.txt 추가
- 사실 근거: backend/src/utils/uploadLimits.ts (파일 5GB, 룸 10GB), ko.json 보관 안내(최대 1일), 100MB 이상 멀티파트 이어올리기.
- 다음 화요일 네이버 블로그 주제 2(대용량 파일 전송 무료)와 같은 키워드라 블로그에서 이 가이드로 링크한다.

## Constraints
content-rules.json 금지 문구 없음. P2P·종단간 암호화·영구 보관 같은 없는 기능을 쓰지 않는다.

## Measure
선행: IndexNow 제출 후 네이버 수집 여부(서치어드바이저 수집 현황), 7일 노출.
후행: 28일 이 URL 클릭 수, 7일 자연검색 세션.

## Follow-up
- bands.mjs "7일 전" 비교가 주간 시드 행과 매칭되는 문제(±2일 허용 범위)는 게이트 파일이라 PR로만 고칠 수 있다. 일일 행이 7개 쌓이는 10-09 이후 자연 해소.

## Result
- 2026-10-03 배포. 7일 결과 확인: 2026-10-10.
- 7일 (2026-10-10): GSC 10-03~10-08 이 URL 노출 0·클릭 0, 네이버 7일 웹문서 목록에 없음(노출 0). 원인은 콘텐츠가 아니라 발견: GSC URL 검사 "Google에는 아직 알려지지 않은 URL", 사이트맵 마지막 읽음 10-02. 판정 보류 → intent 0009(내부 링크·사이트맵 재제출·색인 요청)로 발견 경로를 고친 뒤 28일 판독(10-31)에서 다시 본다.
