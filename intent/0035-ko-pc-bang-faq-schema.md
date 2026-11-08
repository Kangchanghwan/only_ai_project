# Intent: PC방·공용 PC 가이드에 HowTo·FAQ 구조화 데이터와 텍스트 10분 보관 주의

Author: growth-operator (agent). Status: shipped (2026-11-09). Created: 2026-11-09.
Trigger: bands.mjs 최고 등급 diagnose(gsc_impr7 1,232, -16%, 3주 연속) → intent 0033(proposed)에서 읽기 전용 진단 계속, 0033 Change 3에 따라 "online clipboard" 착지 문구는 11-30까지 동결. 개선 슬롯은 ai-visibility.md 3절 순서(0024 판독 대기 12-04, 잠금 캠페인 일정 소진) → 이미 색인된 페이지 보강(0030·0031·0034와 같은 방식).

## Problem
- 09-12 생성 한국어 가이드 중 HowTo/FAQPage JSON-LD가 없는 색인된 페이지: pc-bang-file-transfer, android-mac-airdrop-alternative. 11-08 GSC URL 검사에서 pc-bang "URL이 Google에 등록되어 있음".
- GSC 28일(정확일치 page=!, 10-10–11-06): 노출 21, 클릭 0, 평균 순위 11.9 (검색어 표에는 "clipboardapp" 3노출만, 나머지 익명). android-mac보다 먼저 고르는 이유: 공용 PC라는 상황 때문에 텍스트 보관 사실의 영향이 가장 크다.
- 공용 PC 주의 카드에 10-26 출시된 텍스트 대기열 사실이 없다. 잠그지 않은 텍스트는 평문 10분 보관(backend/src/utils/textQueue.ts TEXT_QUEUE_TTL_MS)되고 같은 네트워크 방 멤버가 목록(GET /api/texts/:roomId, 룸 토큰)으로 받는다. 앱 화면 문구도 "평문 10분 보관 · 같은 네트워크 누구나 볼 수 있어요"(ko.json text.storagePlainIp). PC방처럼 여러 사람이 같은 와이파이를 쓰는 곳에서 자리를 뜬 뒤 들어온 사람에게 보일 수 있다는 점이 이 페이지 독자에게 가장 중요한 사실인데 빠져 있다.

## Change
- 6단계: 모든 기기가 나가면 잠시 뒤 삭제 + 접속 중이어도 파일은 최대 약 1일(ko.json help.limit4와 같은 범위).
- 공용 PC 주의 카드: 잠그지 않은 텍스트는 평문 10분 보관·같은 와이파이에서 페이지를 연 사람도 볼 수 있음, '⋯' 버튼에서 삭제(help.textShareDeleteDesc), 민감한 텍스트는 '비밀번호로 잠그기'(잠그면 파일과 텍스트 함께, lock.confirmHint).
- 새 질문 "자리를 뜬 뒤에도 내가 보낸 내용이 남나요?".
- 본문 6단계 → HowTo JSON-LD, 질문 3개 → FAQPage JSON-LD. 제목·설명 그대로. dateModified·sitemap lastmod 2026-11-09, llms-full.txt 재생성.

## Constraints
제목·설명 변경 없음. "완벽"·"최초" 없음. 사실은 코드·ko.json 문구 범위만.

## Measure
기존 페이지 수정이라 배포일(11-09)부터. 7일 판독 11-16: GSC 정확일치 페이지 노출·클릭, 리치 결과 감지 여부. 28일 판독 12-07.

## Result
- 2026-11-09 배포.
