# Intent: 한국어 카톡 동영상 PC로 옮기기 가이드

Author: growth-operator (agent). Status: shipped (2026-10-22). Created: 2026-10-22.
Indexed: 2026-10-30 (GSC URL 검사 첫 확인일)
Trigger: bands 최고 등급 ok, proposed 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- 네이버 유입 키워드 "카톡에서 동영상 pc로 옮기기"(10-19 주간 리포트)가 실제로 들어오는데, 이 의도를 받는 전용 페이지가 없다.
- 기존 phone-video-to-pc-transfer는 폰에서 찍은 영상 일반론이고, 카톡으로 받은 영상을 폰에 저장한 뒤 PC로 옮기는 흐름(카톡 PC 로그인·나에게 보내기 없이)은 다루지 않는다.

## Proposed outcome
"카톡 동영상 pc로 옮기기" 계열 검색에 전용 착지 페이지를 만든다.
28일 안에 이 URL 네이버 또는 GSC 노출 50 이상, 클릭 1 이상.

## Change
- frontend/public/guide/kakaotalk-video-to-pc.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD, style 블록은 iphone-video-to-pc-transfer와 동일). 자동 머지 허용 경로.
- guide/index.html 허브(ItemList position 22 + 목록), phone-video-to-pc-transfer 관련 글, sitemap.xml, llms.txt 추가.
- 사실 근거: 기존 가이드와 같은 범위 (파일 5GB, 룸 10GB, 100MB 초과 조각 업로드·이어올리기, 같은 와이파이 자동 연결, 전체 공유 탭, 모두 나가면 곧 삭제, 비밀번호 잠그기). 카카오톡 쪽 수치(용량·보관 기간·화질)는 확인 불가라 쓰지 않았고, 저장 위치는 일반적 수준으로만 적었다.

## Constraints
- 사실과 다른 카피 금지(ops/content-rules.json). 타사 비하 금지.

## Measure
선행: 7일 뒤(10-29) 이 URL GSC/네이버 노출, 네이버 키워드 "카톡에서 동영상 pc로 옮기기" 클릭.
후행: 28일(11-19) 이 URL 클릭.

## Open questions
- 없음.

## Result
- 2026-10-22 배포. 7일 결과 확인: 2026-10-29.
- 2026-10-29 7일 판독 → 판정 보류: /guide/kakaotalk-video-to-pc.html GSC(10-22–10-26, 마지막 갱신일까지) 노출 0·클릭 0, 네이버 7일 웹문서·키워드 상위 30에 없음("카톡에서 동영상 pc로 옮기기" 포함). 색인 전일 가능성 → 11-04 URL 검사 확인 목록, 28일 판독 11-19.
- 2026-10-30 GSC URL 검사 "등록되어 있음" 첫 확인 → 판독 7일 11-06, 28일 11-27 (기존 28일 11-19 대신). GSC 28일 노출 0.
