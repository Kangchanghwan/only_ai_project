# Intent: 영어 Snapdrop/PairDrop 대안 글의 제목·요약 바꾸기 (제목 실험 1번)

Author: owner 세션 (강창환 승인, 2026-11-17). Status: shipped (2026-11-17). Created: 2026-11-17.
Trigger: owner와 정한 구글 검색 전략. 영어 첫 화면(/en/) 제목을 건드리기 전에, 0001·0008의 교훈대로 작은 안내 글에서 제목 변경에 대한 구글 반응을 먼저 본다.

## Problem
- 이 글은 GSC 28일(10-18–11-14) 노출 456, 클릭 8, CTR 1.8%, 평균 10.4위다. 첫 쪽 끝에 걸려 있는데 클릭이 거의 없다.
- 걸린 검색어(28일): snapdrop alternative 70노출·14.0위·클릭 0, snapdrop & pairdrop 55·9.4위·0, snapdrop pairdrop 48·8.8위·0, pairdrop alternative 26·10.0위·0, snapdrop and pairdrop 14·8.9위·0, snapdrop text 4·9.2위·1.
- 본문 '알아두면 좋은 것'이 "다른 네트워크면 Everyone 탭으로"라고 안내한다. 지금은 방(＋ Room → Create a new room)이 있어 공개 탭을 권할 이유가 없다.

## Change
- title/og:title/headline: "Snapdrop / PairDrop Alternative That Also Shares Clipboard Text" → "Snapdrop / PairDrop Alternative: 5GB Files, Text, Across Networks" (앞부분 "Snapdrop / PairDrop Alternative"는 그대로).
- 메타 설명 4곳(meta, og, JSON-LD 2곳): "A Snapdrop or PairDrop alternative in the browser: send files up to 5GB (interrupted uploads resume), share clipboard text, and use a room when your devices are on different networks. An honest comparison."
- 본문 한 문장: 다른 네트워크일 때 Everyone 탭 대신 방을 먼저 안내. 제목의 "Across Networks"와 본문을 맞추기 위한 변경이다.
- dateModified·sitemap lastmod 11-17. URL·h1·비교 표·타사 서술은 그대로.

## Constraints
- 판독이 끝날 때까지 이 글의 제목·요약과 /en/ 의 seo.title·seo.description 을 바꾸지 않는다(다른 실험과 섞이지 않게).
- 타사(Snapdrop, PairDrop)에 대한 새 주장은 넣지 않았다. 우리 기능만 적었다.

## Measure
- 기준값: 위 Problem의 28일 값. 주간으로는 노출 약 114.
- 판독: 7일 11-24, 14일 12-01, 28일 12-15 (GSC 페이지 정확일치).
- 목표(28일): CTR 1.8% → 4% 이상, 평균 순위 10.4 → 8 이내.
- 되돌리는 기준: 7일 노출이 57(기준의 절반) 미만이거나 평균 순위가 3 이상 나빠지면 제목·요약을 이전 값으로 원복한다(본문 문장은 사실 정정이라 유지).
- 다음 단계: 14일 판독(12-01)에서 순위 이탈이 없으면 owner에게 /en/ 제목 A안("Online Clipboard – Share Text, Images & Files | Clipboard Share")을 다시 제안한다. owner 승인 없이 /en/ 제목을 바꾸지 않는다.

## Result
- 2026-11-17 배포. 색인 생성 요청·네이버 수집 요청은 이 세션에서 하지 않았다. 다음 루틴 실행에서 요청한다.
- 확인하지 못한 것: 방이 서로 다른 네트워크의 실제 기기 두 대 사이에서 동작하는지는 코드와 화면으로만 확인했다(실기기 시험 없음).
