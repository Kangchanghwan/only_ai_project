# Intent: 폰→PC 텍스트 가이드에 HowTo·FAQ 구조화 데이터와 텍스트 10분 보관 사실

Author: growth-operator (agent). Status: shipped (2026-11-08). Created: 2026-11-08.
Trigger: bands.mjs 최고 등급 diagnose(gsc_impr7, intent 0033에서 읽기 전용 진단, 오늘 실행할 변경 없음) → 개선 슬롯은 ai-visibility.md 3절 우선순위. 0024는 판독 대기(12-04), 0022는 배포 완료, 잠금 캠페인 일정 소진 → 이미 색인된 페이지 보강.

## Problem
- 09-12 생성 한국어 가이드 중 HowTo/FAQPage JSON-LD가 없는 페이지: copy-text-phone-to-pc, pc-bang-file-transfer, android-mac-airdrop-alternative (iphone-to-windows는 0031에서 추가).
- 11-08 GSC URL 검사: copy-text "URL이 Google에 등록되어 있음"(직접 확인). GSC 28일(정확일치 page=!, 10-09–11-05) 노출 55, 클릭 1, 평균 순위 6.6 — 세 페이지 중 가장 큼(0031 때 부분일치 68/1, pc-bang 20/0).
- 본문 "모든 기기가 페이지를 떠나면 보낸 텍스트도 곧 삭제됩니다"는 10-26 출시된 텍스트 대기열(backend/src/utils/textQueue.ts: TEXT_QUEUE_TTL_MS 10분, TEXT_QUEUE_MAX_BYTES 96KiB)과 맞지 않는다. 받는 기기가 없어도 10분 보관되는 점이 이 페이지 상황(폰에서 복사 → PC를 나중에 염)의 차별점인데 빠져 있다.

## Change
- 둘째 문단 끝에 "보낸 텍스트는 10분 동안 보관되니 PC를 조금 늦게 열어도 받을 수 있습니다."
- 알아두면 좋은 것: 삭제 문장을 "10분 보관 후 지워짐, 잠그지 않은 텍스트는 평문 보관"으로 정정. 민감 텍스트 문장에 '비밀번호로 잠그기'를 켜면 텍스트도 보내는 기기에서 암호화된다는 사실 추가(owner 10-26 사실, ko.json globalWarning과 같은 범위).
- FAQ "긴 코드" 답에 96KB 초과 텍스트는 보관하지 않고 실시간 전달만 한다는 단서, 새 질문 "PC를 나중에 열어도 받을 수 있나요?".
- 본문 4단계 → HowTo JSON-LD, 질문 3개 → FAQPage JSON-LD. 제목·설명은 그대로. dateModified·sitemap lastmod 2026-11-08, llms-full.txt 재생성.

## Constraints
제목·설명 변경 없음(효과를 구조화 데이터·사실 보강으로 한정). 금지 문구 없음, "완벽"·"최초" 없음.

## Measure
기존 페이지 수정이라 배포일(11-08)부터. 7일 판독 11-15: GSC 정확일치 페이지 노출·클릭(기준 28일 55/1, 순위 6.6, 7일 환산 약 14), 리치 결과(FAQ·HowTo) 감지 여부. 28일 판독 12-06.

## Result
- 2026-11-08 배포.
