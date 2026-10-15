# Intent: 한국어 가이드 "파일 비밀번호 걸어서 보내기"

Author: owner (2026-10-15 지시, 에이전트 작성). Status: shipped (2026-10-16). Created: 2026-10-15.
Trigger: owner 아이디어 — 비밀번호 잠금·QR 공유 출시(PR #52~#55)를 유입 각도로 쓰기. ops/playbooks/lock-campaign.md.

## Problem
- 10-15에 비밀번호 잠금이 나왔지만 이를 설명하는 착지 페이지가 없다. 가이드 22개와 faq는 "민감한 파일은 잠그기를 켜라"는 한 문장만 있다.
- 공용 PC·공유 와이파이에서 신분증·서류를 옮기려는 검색 의도("파일 비밀번호 걸어서 보내기", "파일 암호화 전송", "공용 PC 파일 전송")를 받을 페이지가 없다.

## Proposed outcome
잠금 기능 전용 한국어 착지 페이지. 28일 안에 이 URL 네이버 또는 GSC 노출 50 이상, 클릭 1 이상.

## Change (자동 머지 허용 경로)
- frontend/public/guide/send-file-with-password.html (slug는 키워드 확인 후 조정 가능). 구성: 언제 쓰나(공용 PC, 같은 와이파이를 여러 사람이 쓰는 곳) → 잠그는 법(탭 선택 → 비밀번호로 잠그기 → 올리기) → 받는 법(비밀번호 입력 또는 QR) → 잠기지 않는 것(텍스트·기기 정보) → 비밀번호 분실 시 복구 불가 → FAQ.
- HowTo + FAQPage JSON-LD, 허브·sitemap·llms.txt 추가, 노출 있는 기존 가이드 1곳(pc-bang-file-transfer)의 관련 글에서 링크.
- 캡처: 잠금 칩, 비밀번호 시트, 잠긴 파일 카드, QR 창 (internal=1로 열고, 테스트 파일은 작은 더미, 캡처 후 삭제).
- 사실은 lock-campaign.md 1절, 금지 표현은 2절과 content-rules.json.

## Constraints
과장 금지("최초", "완벽한 보안"). 텍스트·기기 정보가 보호된다고 쓰지 않는다.

## Measure
선행: 7일 뒤 이 URL GSC/네이버 노출, GA4 locked_upload_complete 사용자 수 변화.
후행: 28일 이 URL 클릭.

## Result
- 2026-10-16 배포: https://www.clipboardapp.org/guide/send-file-with-password.html (master b376768, auto 게이트 통과, 라이브 title 확인). 허브 "파일 옮기기"·ItemList 19, pc-bang 관련 글, sitemap, llms.txt. 배포 당일 GSC 색인 생성 요청(요청됨), 네이버 웹 페이지 수집 요청. 같은 날 네이버 블로그 L1 글에서 링크.
- 기준값: 배포 전 GSC 28일 "비밀번호·암호·password·encrypt" 포함 쿼리 노출 0. GA4 10-09–10-15 locked_upload_complete 5회(1명), locked_download_complete 2회(1명), locked_link_download_complete 1회(1명) = 10-15 출시 테스트분.
- 판독: 7일 10-23, 28일 11-13.
