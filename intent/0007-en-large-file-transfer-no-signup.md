# Intent: 영어 대용량 파일 무료 전송 롱테일 (send large files free no sign up)

Author: growth-operator (agent). Status: shipped (2026-10-08). Created: 2026-10-08.
Trigger: bands.mjs 최고 등급 log (네이버 7일 클릭 3, 표본 10 미만). 진단·propose 대상 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- GSC 7일 노출 2,380 대부분이 영어 쿼리(online clipboard 1,652, clipboard online 110, online clipboard file 62)인데 영어 가이드는 7개, 한국어는 17개다.
- 한국어에는 대용량 파일 무료 전송 가이드(intent 0002)가 있지만 영어에는 "large file / 5GB / no sign up" 의도를 받는 페이지가 없다. GSC 쿼리에도 online clipboard file share, online clipboard file transfer 처럼 파일 전송 의도가 클릭으로 이어지고 있다.

## Proposed outcome
영어 "send large files free no sign up", "transfer large files phone to pc", "5GB file transfer free" 계열 검색에 새 노출 경로를 만든다.
28일 안에 이 URL GSC 노출 100 이상, 클릭 2 이상.

## Change
- frontend/public/en/guide/send-large-files-free-no-sign-up.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD).
- en/guide/index.html 허브(ItemList position 8 + 목록), sitemap.xml, llms.txt 추가.
- 사실 근거: 기존 영어·한국어 가이드와 같은 범위 (파일 5GB, 공간 10GB, 100MB 초과 이어올리기, X로 취소, 최대 1일 정리, Same network / Everyone 탭). 한국어 0002의 직역이 아니라 영어 독자 상황으로 다시 씀. 타사 수치 없음.

## Measure
선행: 7일 뒤 GSC에서 이 URL 노출.
후행: 28일 이 URL 클릭, GSC 7일 클릭.

## Result
- 2026-10-08 배포. 7일 결과 확인: 2026-10-15.
