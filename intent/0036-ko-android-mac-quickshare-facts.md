# Intent: 안드로이드↔맥 가이드의 "AirDrop이 없다" 서술을 2026년 사실로 고치고 HowTo·FAQ 구조화 데이터

Author: growth-operator (agent). Status: shipped (2026-11-10). Created: 2026-11-10.
Trigger: bands.mjs 최고 등급은 0033(gsc_impr7 diagnose, proposed) 진단 계속. 개선 슬롯은 ai-visibility.md 3절 순서(0024 판독 12-04 대기, 잠금 캠페인 일정 소진) → 색인된 페이지 보강(0030·0031·0034·0035와 같은 방식). 11-09 리포트가 다음 후보로 지정.

## Problem
- /guide/android-mac-airdrop-alternative.html (09-12 생성, 11-08 URL 검사 색인됨): GSC 28일 정확일치(10-11–11-07) 노출 47, 클릭 0, 평균 순위 9.2. HowTo/FAQPage JSON-LD 없음.
- 첫 문단·설명·FAQ가 "AirDrop은 애플 기기끼리만, 퀵 공유는 안드로이드와 윈도우까지", "안드로이드 폰과 맥 사이에는 AirDrop이 없습니다"라고 단정한다. 사실과 다르다: 2025-11-20 픽셀 10부터 퀵 공유가 AirDrop과 호환되고, 구글 도움말(support.google.com/android/answer/9286773, 2026-11-10 확인)은 "Pixel 8a or later, certain Samsung, Oppo, OnePlus, Vivo, Xiaomi, Honor, Transsion, and Motorola devices"가 iPhone·iPad·macOS로 보낼 수 있고, 받는 쪽은 AirDrop을 "Everyone for 10 minutes"로 바꿔야 한다고 적는다.
- 보관 서술 "모든 기기가 떠나면 항목은 곧 사라집니다"는 텍스트 10분 보관(textQueue.ts, ko.json text.storagePlainIp)·파일 최대 약 1일(help.limit4)과 맞지 않는다.

## Change
- 첫 두 문단: 퀵 공유 AirDrop 지원 사실(기준일·구글 도움말 링크) + 지원 기종이 아니거나 윈도우 PC가 섞일 때 브라우저 방법.
- meta/og/Article description의 "AirDrop이 없습니다" 문장 교체. 제목은 그대로.
- 알아두면 좋은 것: 파일은 모두 나가면 잠시 뒤 삭제·접속 중이어도 최대 약 1일, 잠그지 않은 텍스트 10분.
- FAQ 1 답변 사실 수정, 새 질문 "갤럭시로 찍은 큰 동영상도 보낼 수 있나요?"(파일당 5GB, 끊겨도 이어서 — ko.json upload.limitResume·help.limit1).
- 본문 6단계 → HowTo, 질문 3개 → FAQPage JSON-LD. dateModified·sitemap lastmod 2026-11-10, llms.txt 설명 문장 수정, llms-full.txt 재생성.

## Constraints
제목 변경 없음. 퀵 공유 지원 기종은 구글 도움말 표현 범위만(기종 목록을 나열하지 않음). "최초·유일·완벽" 없음.

## Measure
기존 페이지 수정이라 배포일(11-10)부터. 7일 판독 11-17: GSC 정확일치 노출·클릭·순위(기준 28일 47/0/9.2, 7일 평균 약 12). 28일 판독 12-08.

## Result
- 2026-11-10 배포.
