# Intent: 갤럭시→맥북 가이드의 "퀵쉐어는 맥 미지원" 서술을 2026년 사실로 고치고 FAQ 추가

Author: growth-operator (agent). Status: shipped (2026-11-11). Created: 2026-11-11.
Trigger: bands.mjs 최고 등급은 0033(gsc_impr7 diagnose, proposed) 진단 계속. 개선 슬롯은 ai-visibility.md 3절 순서(0024 판독 12-04 대기, 잠금 캠페인 일정 소진) → 11-10 리포트 피드백의 "타사 서술 점검" 후보 중 네이버 유입이 있는 페이지.

## Problem
- /guide/galaxy-to-macbook-photo-transfer.html (09-13 생성, 색인됨): 네이버 7일(11-10 기준) 노출 533, 클릭 6. GSC 28일(10-12–11-08) 정확일치 노출 2, 클릭 0 → 네이버 중심 페이지.
- 설명·첫 문단·"알아두면 좋은 것"이 "퀵쉐어는 맥을 지원하지 않는다/맥용이 없다"고 단정한다. 구글 퀵 공유 도움말(support.google.com/android/answer/9286773, 2026-11-11 확인)은 "Pixel 8a or later, certain Samsung, Oppo, OnePlus, Vivo, Xiaomi, Honor, Transsion, and Motorola devices"가 macOS로 보낼 수 있고, 받는 쪽 AirDrop은 "Everyone for 10 minutes"여야 한다고 적는다.
- "Android File Transfer는 최신 macOS에서 아예 실행되지 않는다"는 근거 없는 단정. 확인된 사실은 2024년 android.com에서 내려받기가 사라졌다는 것(9to5Google 2024-02-16, Android Police 2024-02-19, 이후 다운로드 불가 보도).
- 보관 서술 "모든 기기가 페이지를 닫으면 파일과 텍스트는 곧 삭제"는 텍스트 10분 보관(ko.json text.storagePlainIp)·파일 최대 약 1일(help.limit4)과 맞지 않는다.
- 오타 "맥북를" 2곳.

## Change
- meta/og/Article/HowTo description 문장 교체(제목 그대로). 첫 문단: 퀵 공유 AirDrop 호환 사실(기준일·구글 도움말 링크) + Android File Transfer 다운로드 중단. 둘째 문단: 지원 기종이 아닐 때 브라우저 방법.
- "알아두면 좋은 것" 첫 항목과 보관 항목을 사실로. 새 FAQ "퀵쉐어로 맥에 바로 보낼 수는 없나요?"(본문+FAQPage JSON-LD). dateModified·sitemap lastmod 2026-11-11, llms.txt 설명 수정, llms-full.txt 재생성.

## Constraints
제목 변경 없음. 지원 기종은 구글 도움말 표현 범위만. "최초·유일·완벽" 없음. 0036과 같은 문장 사용.

## Measure
기존 페이지 수정이라 배포일(11-11)부터. 7일 판독 11-18: 네이버 서치어드바이저 7일 이 웹문서 노출·클릭(기준 533/6), GSC 정확일치(기준 28일 2/0). 28일 판독 12-09.

## Result
- 2026-11-11 배포.
