# Intent: 영어 가이드 "Firefox Send alternative"

Author: owner (2026-10-15 지시, 에이전트 작성). Status: accepted. Created: 2026-10-15.
Trigger: owner 아이디어 — 잠금 기능 유입 각도. ops/playbooks/lock-campaign.md.

## Problem
- 구글 노출 대부분이 영어(/en/, /en/guide/)인데 잠금 기능을 다루는 영어 페이지가 없다.
- "Firefox Send alternative"는 2020년 종료 이후 꾸준히 대체재 비교 글이 나오는 검색어다(예: transfer.zip 비교 글). 브라우저 암호화·가입 없음·만료라는 공통점이 우리 잠금 기능과 맞는다.

## Proposed outcome
영어 비교 착지 페이지. 28일 안에 GSC 노출 100 이상, 클릭 1 이상.

## Change (자동 머지 허용 경로)
- frontend/public/en/guide/firefox-send-alternative.html. 솔직한 비교: Firefox Send가 무엇이었나(2019-03 공개, 2020-09 종료) → 지금 쓸 수 있는 선택지(send.vis.ee 포크, Wormhole 등, 공식 문서로 확인된 사실만) → Clipboard Share가 맞는 경우(같은 와이파이 기기끼리, 가입 없이, 필요한 파일만 비밀번호로 잠금, QR) → 맞지 않는 경우(텍스트는 잠기지 않음, 최대 약 1일 보관, 링크 하나로 먼 사람에게 보내는 용도는 Wormhole류가 더 맞음).
- FAQPage JSON-LD, en 허브·sitemap·llms.txt, /en/guide/online-clipboard-for-files-and-images.html 관련 글에 링크.

## Constraints
경쟁사 비하·검증 안 된 수치 금지. "end-to-end encrypt"는 content-rules.json 금지 문구 — PR #56 머지 전에는 "encrypted in your browser before upload"로 쓴다.

## Measure
선행: 7일 GSC 노출. 후행: 28일 클릭, GA4 locked_upload_complete 중 en 로케일 비중(가능하면).

## Result
