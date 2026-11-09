# Intent: 영어 Snapdrop/PairDrop 대안 가이드 첫 화면에 "앱 없이 같은 와이파이" 사실 문단

Author: growth-operator (agent). Status: shipped (2026-11-03). Created: 2026-11-03.
Trigger: ai-visibility.md 3절 큐 D("Share files on the same Wi-Fi without an app")를 새 URL 대신 이미 색인된 페이지 보강으로 실행. 새 URL 4개가 3~4주째 미색인(11-03 URL 검사 모두 "알려지지 않은 URL")이라 색인된 페이지에 싣는다.

## Problem
- GSC 28일(10-04–10-31) /en/guide/snapdrop-pairdrop-alternative.html 노출 437, 클릭 5(CTR 1.1%). 영어 가이드 중 노출 3위.
- 첫 화면 두 문단에 숫자(파일 크기·보관)·기준일·"앱·가입 없이"가 없다. 인용 문장 규칙(ai-visibility.md 3절)에 안 맞는다.

## Change
- 두 번째 문단 뒤에 한 문단: "As of November 2026" + 브라우저만(앱·계정 없음) + 같은 와이파이 자동 연결 + 파일당 5GB + 최대 약 1일 보관 + 필요한 파일만 비밀번호 잠금.
- 제목·설명·본문 나머지는 그대로. JSON-LD dateModified, sitemap lastmod 2026-11-03.

## Constraints
제품 사실은 사이트 공통 문장(ai-visibility.md 3절)만. "최초·유일·완벽" 금지. 경쟁 도구 서술은 바꾸지 않는다.

## Measure
기존 페이지 수정이라 배포일 기준. 7일(11-10): 이 URL GSC 노출·CTR (기준 28일 437/5, 7일 평균 약 109/1). 28일(12-01): 클릭, AI 언급표에서 이 URL 인용 여부.

## Result
- 2026-11-10 7일 판독: GSC 정확일치 10-27–11-02 클릭 2 / 노출 92 / 11.3위 → 11-03–11-07(5일, 데이터 지연) 0 / 39 / 15.6위. 하루 노출 13.1 → 7.8로 목표(7일 평균 약 109 유지·CTR 개선) 미달. 같은 기간 사이트 GSC 7일 노출도 -14%(0033 diagnose, 3주 연속)라 이 문단 추가 때문이라고 보기 어렵고, 바꾼 것은 사실 문단 추가뿐이라 원복하지 않는다. 28일 판독 12-01.
