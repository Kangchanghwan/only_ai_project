# Intent: 일본어·러시아어 검색용 페이지 (/ja/, /ru/와 가이드 6개)

Author: owner 세션 (강창환 승인 "얀덱스와 일본어 둘다 진행", 2026-11-17). Status: proposed. Created: 2026-11-17.
Trigger: owner 아이디어(나라별 포털 공략). 조사 결과 일본 야후의 일반 검색은 구글 색인을 쓰므로 따로 등록할 곳이 없고, 막힌 곳은 포털이 아니라 "검색에 걸릴 일본어·러시아어 페이지가 없다"는 점이었다.

## Problem
- 사이트맵·hreflang에는 ko, en만 있다. 앱 화면은 21개 언어지만 검색엔진이 볼 일본어·러시아어 주소가 없다.
- GA4 28일(10-20–11-16): 러시아 15명, 일본은 상위 10개국 밖(12명 미만). GSC 28일 러시아 노출 106·클릭 6, 일본은 상위 10개국 밖.

## Change
- 앱 경로 /ja/, /ru/: pathLocale·canonical·프리렌더 라우트·hreflang(index.html, sitemap) 추가. 랜딩 링크는 그 언어 가이드로. '이 언어로 보기' 링크는 보는 사람의 언어 페이지(ko/en/ja/ru)로, 없으면 영어로.
- 가이드: ja 3개(iPhone→Windows 사진 무선, Wi-Fi 스마트폰↔PC 파일 전송, 클립보드 공유)와 목록, ru 3개(아이폰 사진 컴퓨터로 무선, Wi-Fi로 폰→PC 파일, Snapdrop 대안)와 목록. 영어 가이드를 바탕으로 쓰고 사실은 도움말(help.*) 기준으로 맞췄다.
- sitemap, llms.txt, llms-full.txt, check-seo(ja/ru 가이드 폴더), indexnow(ja.json, ru.json → /ja/, /ru/).
- 기존 한국어·영어 페이지의 제목·본문은 건드리지 않았다(0047 실험과 섞이지 않게).

## Constraints
- 일본어·러시아어 문장은 원어민 검수를 받지 않았다.
- 얀덱스 웹마스터 계정은 만들지 못했다(구글 계정 연동 가입이 "An error occurred"로 3번 실패). 얀덱스에는 IndexNow(api.indexnow.org, 기존 워크플로)와 robots.txt의 sitemap으로 알린다.

## Measure
- 색인 확인일(`Indexed:`)부터 센다. GSC에서 /ja/, /ru/ 접두사 필터.
- 선행(14일): /ja/ 계열 노출 30 이상, /ru/ 계열 노출 30 이상.
- 후행(28일): 언어별 노출 150 이상 그리고 클릭 3 이상이면 다음 언어(es, pt) 검토. 둘 다 노출 50 미만이면 확장하지 않고 멈춘다. (숫자는 owner와 정한 값이 아니라 제안값)

## Result
(배포 후 채움)
