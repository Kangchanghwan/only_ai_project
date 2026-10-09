# Intent: 신규 가이드 발견 경로 보강 (색인된 기존 가이드 → 새 가이드 내부 링크)

Author: growth-operator (agent). Status: shipped (2026-10-10). Created: 2026-10-10.
Trigger: intent 0002 7일 판독 — 새 가이드 노출 0, GSC URL 검사 "Google에는 아직 알려지지 않은 URL"

## Problem
- 10-03~10-08에 배포한 가이드 6개(0002~0007)가 GSC URL 검사에서 전부 "URL이 Google에 등록되어 있지 않음: 아직 알려지지 않은 URL". 참조 사이트맵·참조 페이지 모두 감지 없음.
- GSC 사이트맵 마지막 읽은 날짜가 2026-10-02(발견 24개, 지금 sitemap은 30개). IndexNow는 Bing·Yandex·Naver 대상이라 구글에는 닿지 않는다.
- 네이버 서치어드바이저 7일 웹문서 목록에도 6개 모두 없음(노출 0). 수집 요청 내역은 09-14 이후 비어 있었다.
- 새 가이드는 허브(/guide/, /en/guide/)에서만 링크되고, 허브의 sitemap lastmod는 2026-09-13으로 남아 있었다.
- 그동안 "가이드 1개 추가 = 개선 1건"으로 셌지만, 실제로는 검색엔진이 모르는 페이지를 쌓고 있었다.

## Proposed outcome
새 가이드 6개가 14일 안에 GSC "색인 생성됨" + 네이버 웹문서 노출 1 이상.

## Change
- 이미 노출이 있는 기존 가이드 6개의 "관련 글" 맨 위에 주제가 이어지는 새 가이드 링크 1개씩 추가:
  phone-video-to-pc → large-file-transfer, galaxy-to-macbook → iphone-galaxy, office-pc → pc-to-pc,
  android-mac-airdrop-alternative → airdrop-not-working, en online-clipboard-copy-paste → en online-clipboard-for-files-and-images,
  en snapdrop-pairdrop-alternative → en send-large-files.
- sitemap.xml lastmod: 수정한 6개 2026-10-10, /guide/ 허브 2026-10-07(실제 마지막 수정일).
- 같은 날 수동 조치(코드 아님): GSC 사이트맵 재제출, 새 가이드 6개 GSC 색인 생성 요청, 네이버 웹 페이지 수집 요청 6건.

## Constraints
카피는 각 가이드 h1 그대로. 새 문구 없음.

## Measure
선행: GSC 사이트맵 마지막 읽은 날짜 갱신, URL 검사 상태(10-13, 10-17 확인).
후행: 6개 URL의 GSC/네이버 노출(10-17 7일, 10-24 14일).

## Follow-up
- 루프 개선 제안: 가이드 배포 다음 날 GSC URL 검사로 "알려진 URL"인지 확인하고, 아니면 색인 요청 + 네이버 수집 요청을 하는 단계를 ship-change.md에 넣는다 (ops/playbooks는 자동 머지 경로).

## Result
- 2026-10-10 배포. 7일 결과 확인: 2026-10-17.
