# Intent: 영어 "online clipboard for files" 페이지 제목에 5GB·가입 없음 넣기

Author: growth-operator (agent). Status: rejected (2026-10-27, 7일 판독). Created: 2026-10-20.
Trigger: 정기 (bands 최고 등급 ok, propose/accepted intent 없음). 10-19 주간 리포트 "노출 100+ & CTR < 2%" 후보.

## Problem
- GSC 10-10–10-16 쿼리 "online clipboard for files" 노출 102 / 클릭 0. 
- 대상 페이지 /en/guide/online-clipboard-for-files-and-images.html: 10-14–10-17 노출 131 / 클릭 1 (CTR 0.8%), 평균 순위 7.2. 순위는 1페이지인데 클릭이 거의 없다.
- 현재 제목 "Online Clipboard for Files & Images: Paste, Then Download Anywhere"는 쿼리와 맞지만 용량·가입 여부 같은 결과가 안 보인다.
- 원래 1순위 후보였던 /en/guide/online-clipboard-copy-paste-between-devices.html(1,064 노출, CTR 0.9%)은 미룬다. 10-16·10-17에 "online clipboard" 쿼리 /en/ 노출이 하루 150대 → 15대로, 순위 8.6 → 13.8로 떨어졌고(사이트 메타 변경 없음), 지금 이 쿼리를 떠받치는 copy-paste 가이드 제목을 바꾸면 순위 변동과 효과가 섞인다. 0001 롤백 사례도 있다.

## Proposed outcome
7일 뒤(10-27) 이 URL CTR 0.8% → 2% 이상, 노출은 절반 이상 유지.

## Change
- frontend/public/en/guide/online-clipboard-for-files-and-images.html: title, og:title, Article headline, meta/og/JSON-LD description (자동 머지 허용 경로)
  - 제목: "Online Clipboard for Files & Images: Up to 5GB, No Sign-up or App" (65자, 쿼리 앞부분 유지)
  - 설명: 파일 5GB, 같은 와이파이 자동 연결, 코드·계정·앱 없음, 하루 안에 정리 (본문에 이미 있는 사실만)
- sitemap.xml lastmod 2026-10-20

## Constraints
- 사실: 파일당 5GB(backend/src/utils/uploadLimits.ts), 같은 와이파이 자동 연결, 최대 약 1일 보관. 본문은 바꾸지 않았다.
- 구글 순위 위험: 페이지 노출이 131로 작아 사이트 전체 영향은 작다. 노출이 절반 아래로 떨어지면 원복.

## Measure
선행: 10-27 GSC 이 URL 7일 노출·CTR (기준 10-14–10-17 하루 평균 노출 33, CTR 0.8%).
후행: 28일(11-17) 클릭.

## Result
- 2026-10-20 배포. 7일 결과 확인: 2026-10-27.
- 2026-10-27 7일 판독: 대상 URL 배포 전 10-14–10-19 노출 174·클릭 1(CTR 0.6%, 순위 7.4) → 배포 후 10-21–10-26 노출 33·클릭 0(하루 5.5, 순위 7.5). 쿼리 "online clipboard for files"는 66 → 0. 기준(하루 33, CTR 0.8%) 대비 노출이 절반 아래라 Constraints의 원복 조건에 해당 → rejected. 단, 노출 감소는 10-17부터 시작됐고 같은 시기 사이트 전체 "online clipboard" 노출도 줄어(10-19 134 → 10-26 23) 제목 변경만의 효과로 단정할 수 없다. 다음 개선 슬롯(10-28)에서 title·description을 원래 값으로 되돌리고 28일(11-17)에 다시 본다.
