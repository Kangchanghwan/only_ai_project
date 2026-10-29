# Intent: 한국어 같은 와이파이 파일 공유 가이드 (공유폴더 설정 없이)

Author: growth-operator (agent). Status: shipped (2026-10-24). Created: 2026-10-24.
Indexed: 2026-10-30 (GSC URL 검사 첫 확인일)
Trigger: ai-visibility.md 3절 큐 C.

## Problem
- 목표 표 C 묶음("같은 와이파이 파일 공유", "폰 pc 파일 공유", "폰 컴퓨터 파일 옮기기 앱 없이")에서 순위권 밖이다. 상위 결과는 윈도우 공유폴더 설정 글뿐이다(ai-visibility.md 1절, 10-22 기준 표).

## Proposed outcome
C 묶음 검색어에 "설정 없이 브라우저로" 각도의 전용 착지 페이지를 만든다. 공유폴더 방법도 짧고 공정하게 소개하고, 다른 방법이 나은 경우도 적는다.

## Change
- frontend/public/guide/same-wifi-file-share.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD, style 블록은 kakaotalk-video-to-pc와 동일).
- guide/index.html 허브(ItemList position 24 + 목록), pc-to-pc-file-transfer-without-usb 관련 글 맨 위, sitemap.xml, llms.txt, llms-full.txt 재생성.
- 사실 근거: 파일당 5GB, 최대 약 1일 보관, 같은 와이파이 자동 연결(공인 IP 기준 묶음: backend/src/utils/clientIp.ts), 비밀번호 잠금, 1:1 자동 암호화(lock-campaign.md 1절).

## Constraints
- 사실과 다른 카피 금지(ops/content-rules.json). 타사 비하 금지. 확인 못 한 수치·후기 금지.

## Measure
선행: 7일 뒤(10-31) 이 URL GSC/네이버 노출과 C 묶음 순위.
후행: 28일(11-21) 이 URL 클릭, 월요일 keywords.csv C 묶음 순위.

## Open questions
- 없음.

## Result
- 2026-10-24 배포: https://www.clipboardapp.org/guide/same-wifi-file-share.html (master cc07021, auto 게이트 통과, 라이브 200·title 확인). 허브 ItemList, pc-to-pc 관련 글 맨 위, sitemap·llms.txt·llms-full.txt. GSC 색인 생성 요청됨, 네이버 웹 페이지 수집 요청(10-24 08:57). 7일 10-31, 28일 11-21.
- 2026-10-30 GSC URL 검사 "등록되어 있음" 첫 확인(28일 노출 0) → 판독 7일 11-06, 28일 11-27 (기존 7일 10-31·28일 11-21 대신).
