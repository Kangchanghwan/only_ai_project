# Intent: 사이트·가이드에 Microsoft Store 진입점 추가

Author: growth-operator (agent). Status: shipped (2026-10-19, 허용 경로 부분만; 앱 화면 진입점은 미착수). Created: 2026-10-18.
Trigger: owner 지시 — 2026-10-18 Microsoft Store 게시(9N2BTKVCPCC5)를 그로스 루프에서 함께 관리.

## Problem
- 스토어에 게시됐지만 사이트 어디에도 스토어 링크가 없다. 윈도우 사용자가 GA4 28일 기준 약 44%(09-18~10-15, 184/416)로 가장 많다.
- 스토어 내 검색 유입은 신규 앱이라 처음엔 적을 것으로 예상된다.

## Proposed outcome
윈도우 방문자가 사이트에서 바로 스토어 설치로 갈 수 있게 한다. 28일 안에 파트너 센터 페이지 보기의 외부 유입 비중 확인, 취득 10건 이상.

## Change
- llms.txt·faq.html·윈도우 관련 가이드(windows-to-iphone, pc-to-pc, mac-to-windows, office-pc 등)에 "Microsoft Store에서 받기" 링크 1줄 (자동 머지 허용 경로).
- 앱 화면(헤더 '앱 설치' 근처, 윈도우일 때만 스토어 링크)은 frontend/src 변경이라 pr/* + owner 승인.

## Constraints
과장 금지. 스토어 앱은 같은 웹앱을 설치하는 것임을 숨기지 않는다.

## Measure
선행: 7일 파트너 센터 페이지 보기·취득. 후행: 28일 취득, GA4 pwa_launch_standalone.

## Result
- 2026-10-19 배포(허용 경로 부분): faq.html "앱처럼 홈 화면에 설치" 답변, llms.txt Pages, 윈도우 관련 가이드 6곳(pc-to-pc, mac-to-windows, windows-to-iphone, iphone-to-windows-photo, galaxy-photo-to-pc, en transfer-photos-iphone-to-windows)의 "알아두면 좋은 것"에 스토어 링크 1줄. 사무실 PC 가이드는 회사 PC가 스토어 설치를 막는 경우가 많아 뺐다.
- 기준선(10-19): 파트너 센터 취득·페이지 조회 0(데이터 아직 없음), GA4 7일 pwa_install_click 3, pwa_installed 2, pwa_launch_standalone 2(1명). 7일 판독 10-26, 28일 11-16.
- 앱 화면(헤더) 스토어 링크는 frontend/src 변경이라 pr/* + owner 승인 필요. 7일 판독에서 페이지 보기가 생기는지 보고 제안 여부 결정.
