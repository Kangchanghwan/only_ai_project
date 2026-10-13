# Intent: 한국어 갤럭시→윈도우 PC 사진 옮기기 가이드

Author: growth-operator (agent). Status: shipped (2026-10-14). Created: 2026-10-14.
Trigger: bands.mjs 최고 등급 log (GSC 7일 노출 -74%, 원인은 0008로 이미 회복 중). 진단·propose 대상 없음, 열린 proposed/accepted intent 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- 네이버 서치어드바이저 7일(10-14 기준) 키워드 "핸드폰 사진 컴퓨터로 옮기는 방법" 노출 16·클릭 0. 사이트 노출 1위 웹문서는 허브 /guide/ (7일 297 노출, CTR 0.7%)로, 구체적인 답 페이지가 없는 일반 검색이 허브로만 들어온다.
- 한국어 가이드 17개 중 사진 옮기기 조합은 아이폰→윈도우, 아이패드→윈도우, 갤럭시→맥북뿐이다. 국내 스마트폰 다수인 갤럭시→윈도우 PC 조합 페이지가 없다.

## Proposed outcome
"갤럭시 사진 컴퓨터로 옮기기", "핸드폰 사진 컴퓨터로 옮기는 방법" 계열 검색에 직접 답하는 페이지.
28일 안에 이 URL 네이버+구글 노출 100 이상, 클릭 3 이상.

## Change
- frontend/public/guide/galaxy-photo-to-pc-transfer.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD, style 블록은 galaxy-to-macbook과 동일).
- guide/index.html 허브(사진 옮기기), sitemap.xml, llms.txt 추가. 노출이 있는 iphone-to-windows-photo-transfer 관련 글에서 링크 (sitemap lastmod 갱신).
- 사실 근거: 기존 가이드와 같은 범위(파일 5GB, 100MB 이상 이어올리기, 최대 1일 정리, 서버를 한 번 거쳐 전달, 같은 네트워크 탭, 홈 화면 추가 시 공유 대상, 원본·EXIF 유지). 타사 앱은 이름·수치 없이 "설치·계정·블루투스가 필요한 경우가 많다"로만 언급.

## Measure
선행: 배포 당일 GSC 색인 요청·네이버 수집 요청, 7일 뒤 URL 검사 색인 여부와 노출.
후행: 28일 이 URL 클릭, "핸드폰 사진 컴퓨터" 계열 네이버 키워드 클릭.

## Result
- 2026-10-14 배포. 7일 결과 확인 2026-10-21, 28일 2026-11-11.
