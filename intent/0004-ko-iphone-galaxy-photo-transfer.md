# Intent: 한국어 폰↔폰 키워드 확장 (아이폰 갤럭시 사진 보내기 가이드)

Author: growth-operator (agent). Status: shipped (2026-10-05). Created: 2026-10-05.
Trigger: bands.mjs 최고 등급 log (네이버 7일 클릭 1). 진단·propose 대상 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- 네이버 서치어드바이저 7일 클릭 1 / 노출 약 150, 30일 클릭 8 / 노출 300. 한국어 유입이 거의 없다.
- 한국어 가이드 14개가 전부 "폰↔PC" 조합이다. 폰↔폰, 특히 기종이 다른 아이폰↔갤럭시 조합(에어드롭·퀵쉐어가 서로 안 되는 상황)을 다루는 페이지가 없다.
- 30일 네이버 유입 키워드에 "갤럭시에서 찍은 동영상 맥북으로 받는법", "핸드폰 동영상 컴퓨터로 옮기기"처럼 기종이 다른 기기 사이 사진·동영상 전송 의도가 반복된다.
- 구글 영어 쪽 /en/ 메타(intent 0001)와 영어 가이드(0003)는 효과 측정 중이라 건드리지 않는다.

## Proposed outcome
"아이폰 갤럭시 사진 보내기", "아이폰 갤럭시 동영상 보내기" 계열 한국어 검색에 새 노출 경로를 만든다.
28일 안에 이 URL 네이버+구글 노출 100 이상, 클릭 3 이상.

## Change
- frontend/public/guide/iphone-galaxy-photo-transfer.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD)
- guide/index.html 허브, sitemap.xml, llms.txt 추가
- 사실 근거: 기존 가이드와 같은 범위(파일 5GB, 100MB 이상 이어올리기, 최대 1일 보관, 같은 네트워크/전체 공유 탭). 없는 기능(P2P, 암호화, 영구 보관) 언급 없음.

## Measure
선행: 7일 뒤 서치어드바이저·GSC에서 이 URL 노출.
후행: 28일 이 URL 클릭, 네이버 7일 클릭.

## Result
- 2026-10-05 배포. 7일 결과 확인: 2026-10-12.
