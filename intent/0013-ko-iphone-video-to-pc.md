# Intent: 한국어 아이폰 동영상 윈도우 컴퓨터로 옮기기 가이드

Author: growth-operator (agent). Status: shipped (2026-10-15). Created: 2026-10-15.
Trigger: bands.mjs 최고 등급 ok. 진단·propose 대상 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- 네이버 서치어드바이저 7일 검색 키워드에서 "아이폰 동영상 컴퓨터로 옮기기"가 2주 연속 노출 상위 0클릭이다 (10-14 기준 노출 20, 10-15 기준 19, 클릭 0).
- 이 의도를 받는 페이지는 아이폰·갤럭시를 함께 다루는 phone-video-to-pc-transfer 하나뿐이고, 네이버 7일 노출 11로 이 키워드에 거의 걸리지 않는다. 아이폰 전용(아이튠즈·아이클라우드·신뢰 확인 대신, HEVC 재생 문제) 페이지가 없다.

## Proposed outcome
"아이폰 동영상 컴퓨터로 옮기기", "아이폰 동영상 pc로 옮기기", "아이폰 영상 윈도우" 계열 네이버·구글 검색에 아이폰 전용 착지 페이지를 만든다.
28일 안에 이 URL 네이버 또는 GSC 노출 50 이상, 클릭 1 이상.

## Change
- frontend/public/guide/iphone-video-to-pc-transfer.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD, style 블록은 기존 가이드와 동일).
- guide/index.html 허브(ItemList position 18 + 목록), phone-video-to-pc-transfer 관련 글, sitemap.xml, llms.txt 추가.
- 사실 근거: 기존 가이드와 같은 범위 (파일 5GB, 룸 10GB, 100MB 초과 조각 업로드·이어올리기, 페이지 닫으면 곧 삭제, 같은 네트워크/전체 공유 탭). HEVC·호환성 우선 설명은 phone-video 가이드와 같은 내용. 타사 수치 없음.
- 주의: intent 0010(/guide/·phone-video 제목, 10-19 판독)과 같은 키워드군이라, 0010 판독 때 이 페이지 노출을 따로 떼어 본다.

## Measure
선행: 7일 뒤(10-22) 이 URL GSC/네이버 노출, 네이버 키워드 "아이폰 동영상 컴퓨터로 옮기기" 클릭.
후행: 28일(11-12) 이 URL 클릭.

## Result
- 2026-10-15 배포. 7일 결과 확인: 2026-10-22.
