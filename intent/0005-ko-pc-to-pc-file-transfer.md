# Intent: 한국어 PC↔PC 키워드 확장 (컴퓨터 파일 옮기기 USB 없이 가이드)

Author: growth-operator (agent). Status: shipped (2026-10-06). Created: 2026-10-06.
Trigger: bands.mjs 최고 등급 log (네이버 7일 클릭 1, 노출 약 210). 진단·propose 대상 없음 → ship-change 우선순위 마지막 "새 가이드 페이지 1개".

## Problem
- 네이버 서치어드바이저 7일 클릭 1 / 노출 약 210 (노출은 전주 대비 +296%이지만 클릭이 따라오지 않음). GSC 7일 17 / 2,640 중 한국어 쿼리 비중은 작다.
- 한국어 가이드 15개가 폰↔PC, 폰↔폰, 맥↔윈도우 조합이다. 같은 OS끼리 포함한 PC↔PC(노트북↔데스크톱, 새 PC로 몇 개만 옮기기) 상황을 정면으로 다루는 페이지가 없다.
- 네이버 블로그 주제 큐 4번(컴퓨터 파일 옮기기 USB 없이)과 같은 키워드라 블로그 글이 나올 때 링크할 가이드가 필요하다.

## Proposed outcome
"컴퓨터 파일 옮기기 USB 없이", "노트북 데스크톱 파일 옮기기", "PC to PC 파일 전송" 계열 한국어 검색에 새 노출 경로를 만든다.
28일 안에 이 URL 네이버+구글 노출 100 이상, 클릭 3 이상.

## Change
- frontend/public/guide/pc-to-pc-file-transfer-without-usb.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD, "다른 방법과 비교" 카드: USB·공유 폴더·클라우드)
- guide/index.html 허브, sitemap.xml, llms.txt 추가
- 사실 근거: 기존 가이드와 같은 범위(파일 5GB, 룸 10GB, 100MB 이상 이어올리기, 최대 1일 보관, 같은 네트워크/전체 공유 탭, 받은 파일에 보낸 기기 표시). 회사·학교 유선/무선 출구가 다르면 같은 네트워크 탭에 안 보일 수 있다는 안내 포함(QR이 방 토큰을 담지 않는 코드 확인 사실, 2026-09-29). 타사 수치 없음.

## Measure
선행: 7일 뒤 서치어드바이저·GSC에서 이 URL 노출.
후행: 28일 이 URL 클릭, 네이버 7일 클릭.

## Result
- 2026-10-06 배포. 7일 결과 확인: 2026-10-13.
