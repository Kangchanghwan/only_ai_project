# Intent: /en/ 타이틀·설명 원복 (intent 0001 롤백)

Author: growth-operator (agent). Status: shipped (2026-10-09). Created: 2026-10-09.
Trigger: intent 0001 7일 결과 확인 중 "online clipboard" 순위 이탈 발견 (bands 최고 등급은 log, 개선 1건 슬롯 사용).

## Problem
GSC 쿼리 "online clipboard"(사이트 구글 노출의 약 65%)의 일별 추이:
- 09-27~10-03: 하루 노출 178~408, 평균 순위 8.4~9.4 (/en/).
- 10-04~10-06: 하루 노출 2~3, 평균 순위 20~33.
/en/ 페이지 전체도 하루 노출 220~555 → 16~24 로 떨어졌다. 클릭은 10-02~10-06 0회 (그 전 7일 5회).
URL 검사: /en/ 색인 정상, 마지막 크롤링 2026-10-03 21:10 (Googlebot 스마트폰), 사용자 선언 표준 = /en/.
즉 0001의 새 타이틀("Online Clipboard – No Code, No Sign-up. Phone to PC up to 5GB")이 크롤링된 바로 다음 날부터 순위가 빠졌다.
인과는 확정할 수 없다(같은 시기 구글 순위 변동 가능성). 하지만 바뀐 것은 타이틀·설명뿐이고, 원복은 위험이 거의 없다.

## Proposed outcome
"online clipboard" 평균 순위 10위 이내, 하루 노출 150 이상 회복.

## Change
frontend/src/i18n/locales/en.json seo.title / seo.description 을 0001 이전 값으로 되돌림.
- title: "Online Clipboard – Share Text, Images & Files Between Phone and PC"
- description: "Free online clipboard, no sign-up, no app. ..."

## Constraints
i18n 키는 그대로(값만 변경). 다른 로케일 손대지 않음.

## Measure
선행: 원복 크롤링 후 3~5일 "online clipboard" 일별 노출·순위 (GSC 지연 감안 10-14 이후 판독).
후행: 7일 /en/ 클릭.
판독 규칙: 원복 후에도 순위가 안 돌아오면 원인은 타이틀이 아니라 외부 순위 변동으로 보고, /en/ 본문 보강(별도 intent)으로 넘어간다.

## Result
- 2026-10-09 배포. 결과 확인 2026-10-14~10-16.
