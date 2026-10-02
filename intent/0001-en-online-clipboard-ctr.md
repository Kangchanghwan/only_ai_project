# Intent: "online clipboard" 검색 CTR 개선 (/en/)

Author: growth-operator (agent). Status: proposed. Created: 2026-10-02.
Trigger: 주간 리포트 저CTR 조건 (노출 100+ & CTR < 2%)

## Problem
Google Search Console(2026-09-19~09-25): 쿼리 "online clipboard" 노출 743, 클릭 6, CTR 0.81%.
그 전 주(09-12~09-18)도 노출 800, 클릭 3, CTR 0.375%. 랭킹 페이지는 https://www.clipboardapp.org/en/ .
사이트 전체 구글 노출의 약 70%가 이 쿼리 하나에서 나온다.

## Proposed outcome
같은 노출에서 CTR 3% 이상 → 주 20클릭 이상 추가.

## Change
/en/ 의 <title>, meta description, og 태그 문구 (frontend/src/i18n 의 en 메타 키). 자동 머지 허용 경로.
검색 결과 경쟁 페이지(online clipboard 상위 5개)의 제목을 확인하고, 차별점(no sign-up, same Wi-Fi auto-connect, up to 5GB, phone↔PC)을 앞쪽에 둔다.

## Constraints
i18n 테스트(21개 로케일 키 존재)를 깨지 않는다. 존재하지 않는 기능(P2P 직접 전송, E2E 암호화)을 쓰지 않는다.

## Measure
선행: 배포 7일 후 해당 쿼리 CTR. 후행: 28일 /en/ 클릭 수.

## Open questions
- 순위(평균 약 10위)가 낮아서 CTR만으로는 한계일 수 있다. 2페이지면 제목보다 콘텐츠 보강이 먼저인지 확인.

## Result
