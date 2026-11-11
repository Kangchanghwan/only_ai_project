# Intent: 영어 AirDrop 대안 비교 가이드의 퀵 공유 서술을 2026년 11월 사실로 고치기

Author: growth-operator (agent). Status: shipped (2026-11-12). Created: 2026-11-12.
Trigger: bands.mjs 최고 등급은 0033(gsc_impr7 diagnose, proposed) 진단 계속. 개선 슬롯은 ai-visibility.md 3절 순서(0024 판독 12-04 대기, 잠금 캠페인 일정 소진) → 11-10·11-11 리포트 피드백의 "타사 서술 점검" 후보 중 마지막 페이지(0036·0037과 같은 근거).

## Problem
- /en/guide/airdrop-alternative-android-windows-mac.html (intent 0026 비교표 페이지, AI 언급표 q3 대상): 첫 문단이 "Quick Share for Android phones and Windows PCs, so a mixed pair like an Android phone and a Mac often has no simple built-in option"이라고 쓰고, 비교표·"When another option is better"·FAQ 2개도 퀵 공유를 Android·Windows 전용으로 적는다.
- 구글 퀵 공유 도움말(support.google.com/android/answer/9286773, 2026-11-12 확인): Pixel 8a 이후와 "certain Samsung, Oppo, OnePlus, Vivo, Xiaomi, Honor, Transsion, and Motorola devices"가 AirDrop으로 iPhone·iPad·macOS에 보낼 수 있고(받는 쪽 "Everyone for 10 minutes"), 그 밖의 기기는 QR 코드 링크로 보내며 파일은 구글 서버에서 24시간 받을 수 있다(양쪽 인터넷 필요).
- "Good to know"의 "Files and text are deleted shortly after every device leaves"는 보관 사실(파일 최대 약 1일, 잠그지 않은 텍스트 10분)과 맞지 않는다.

## Change
- 첫 문단: 기준일 November 2026, 퀵 공유의 AirDrop 지원 기종과 QR 링크(구글 도움말 링크), 브라우저 방법이 여전히 맞는 경우(Windows PC와 애플 기기, 목록에 없는 폰, 받는 사람이 나중에 열 때).
- 비교표 Quick Share 행 3칸(대상 기기, 네트워크, 보관 24시간), 출처 줄에 구글 도움말과 11-12 확인일, "When another option is better" Quick Share 항목, FAQ 2개(본문 + FAQPage JSON-LD), 보관 문장. dateModified·sitemap lastmod 2026-11-12, llms-full.txt 재생성. 제목·설명 그대로.

## Constraints
제목·메타 설명 변경 없음. 지원 기종은 구글 도움말 표현 범위만. Clipboard Share 장점을 부풀리지 않고 퀵 공유가 되는 경우를 그대로 적는다. "최초·유일·완벽" 없음.

## Measure
기존 페이지 수정이라 배포일(11-12)부터. 7일 판독 11-19: GSC 정확일치 노출·클릭(0026 판독 기준 28일 10-10–11-06 1/66, 7일 0/9). 다음 월요일 AI 언급표 q3. 주의: 같은 페이지의 intent 0026 28일 판독(11-28)과 기간이 겹치므로 0026 판독에는 "11-12 사실 수정 포함"을 적는다.

## Result
