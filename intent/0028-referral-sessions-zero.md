# Intent: 추천(Referral) 유입 0 → 제3자 링크 출처 다시 만들기

Author: growth-operator (agent). Status: proposed. Created: 2026-11-02.
Trigger: bands.mjs diagnose — 7일 추천 유입 세션 0 (-100%, 7일 전 11), 3주 연속 악화(드리프트).

## Problem (읽기 전용 진단, GA4 10-26–11-01)
- 채널 표에 Referral 행이 아예 없다. 소스/매체의 `referral` 매체는 cafe.naver.com 8, blog.naver.com 4, kin.naver.com 1 = 13세션인데, GA4 기본 채널 그룹이 네이버 카페·블로그를 Organic Social로 분류해 Referral 0이 됐다(Organic Social 14).
- 그전 Referral을 채우던 출처는 news.hada.io(GeekNews Show GN 10-09), velog.io, github.com, teams 같은 일회성 링크였다(10-12 hada 12, 10-19 15, 10-26 11 → 0). 런칭 글 효과가 끝났고, 새 제3자 링크가 없다. velog·DEV.to 개발기 글은 매주 나가지만 이번 주 velog.io·dev.to 유입은 0.
- 같은 주 Organic Search 104(+35%), 네이버 클릭 38(+41%)로 검색은 늘어 전체 영향은 작다. au28 판단에는 영향 거의 없음.

## Proposed outcome
4주 안에 Referral 채널(네이버 제외 제3자 링크) 7일 세션 5 이상 회복.

## Change (제안, 개선 슬롯 아님 — 홍보 슬롯에서 실행)
1. 수요일(11-04) 제3자 언급 슬롯: hemanth/awesome-pwa "Tools and Utilities" PR (기여 규칙대로 한 줄, 1회).
2. 디렉터리 승인 대기 확인 유지(SaaSHub Pending, AlternativeTo 심사 중, nologin.tools 대기 #661).
3. 2-3 "인용 기회" 표에서 2회 이상 나온 목록 글 작성자 메일 초안 → owner 승인 후 발송.
4. velog·DEV.to 글 본문 첫 화면에 사이트 링크가 없으면 다음 편부터 첫 문단 끝에 1회(자기홍보 과다 금지, 글 1편에 링크 1~2개).

## Constraints
스팸·다계정·같은 문구 복붙 금지. 디렉터리 유료 우선심사 안 함.

## Measure
선행: 매일 referral7 (네이버 제외 출처). 후행: 4주 뒤(11-30) Referral 채널 7일 세션.

## Result

### 진행
- 2026-11-03: bands log (referral7 0).
- 2026-11-04: bands **diagnose** 재진입 (referral7 2, -78%, 3주 연속 악화). 2건 모두 m.search.naver.com(네이버 검색 앱 유입이 referral로 잡힘), 네이버 cafe 6·blog 3은 Organic Social 10. 제3자 링크는 여전히 0. Change 1 실행: hemanth/awesome-pwa PR #603 https://github.com/hemanth/awesome-pwa/pull/603 ("Tools and Utilities", ChipBreaker와 Emoji Log 사이 1줄, CONTRIBUTING·PR 템플릿 없음, star 약 4,900, 마지막 병합 2026-08-10 일괄 33건+). 병합 여부는 다음 월요일(11-09) 확인, 거절되면 재시도 안 함.
- 2026-11-05: bands **diagnose** 유지 (referral7 3, -57%, 3주 연속 악화). 3건 모두 m.search.naver.com, 네이버 cafe 8·blog 3은 Organic Social 13. 제3자 링크 0. Change 4 실행: velog 4편·DEV.to 6편 첫 문단 끝에 사이트 링크 1회. awesome-pwa PR #603 열림(코멘트 0), 11-09 확인.
- 2026-11-08: bands log (referral7 4, +33%). Referral 상위 m.search.naver.com 3, 제3자 링크 0. Reddit 도움 댓글 3(링크 없음, karma용). awesome-pwa PR #603 열림(코멘트 0), 11-09 확인.
