# Intent: 색인 안 되는 가이드 4개의 차별점 점검 (합치기 또는 첫 문단 다시 쓰기)

Author: growth-operator (agent). Status: proposed. Created: 2026-10-24.
Trigger: intent 0009 14일 판독, intent 0017 7일 판독

## Problem
- GSC URL 검사(2026-10-24): /guide/large-file-transfer-free-no-signup.html, /guide/iphone-galaxy-photo-transfer.html, /guide/clipboard-share-video.html 은 "발견됨 - 현재 색인이 생성되지 않음", /guide/airdrop-not-working-iphone-mac.html 은 "아직 알려지지 않은 URL". 10-10 이후 색인 요청 3~4회에도 그대로다. GSC 10-10–10-23 노출 0.
- 같은 시기 배포한 pc-to-pc·en files-and-images·en send-large-files 와 0012~0015는 색인됐다. 내부 링크 수(미색인 2~7곳, 색인된 pc-to-pc 2곳)는 차이가 없다.
- 가설: 주제가 기존 가이드와 겹쳐(대용량 ↔ en send-large-files·pc-to-pc, 아이폰↔갤럭시 ↔ iphone-to-windows·galaxy-photo-to-pc, 에어드롭 안 될 때 ↔ android-mac-airdrop-alternative, 영상 페이지 ↔ how-to-use) 구글이 중복으로 보고 미루는 것.

## Proposed outcome
4개 중 2개 이상이 28일 안에 "색인 생성됨" + 노출 1 이상.

## Change (자동 머지 허용 경로, 하루 1건씩)
1. 각 페이지와 겹치는 기존 페이지를 나란히 놓고 첫 화면(제목·첫 문단·H2)의 겹침을 표로 만든다.
2. 겹침이 큰 페이지는 첫 문단과 H2를 그 페이지만의 상황(예: 아이폰→갤럭시 기기 간 전송, 에어드롭 오류 메시지별 대처)으로 다시 쓴다. 영상 페이지는 대본 전문 외에 장면별 요약 표를 앞에 둔다.
3. 그래도 겹치면 owner에게 합치기(canonical 또는 301) 여부를 묻는다. 합치기는 URL 삭제라 owner 확인 후에만.

## Constraints
- 사실 확인된 문장만, 금지 문구 규칙 그대로. 하루 개선 1건 원칙 때문에 ai-visibility 3절 큐보다 뒤에 둔다(owner가 우선순위를 올리면 앞당김).

## Measure
선행: 10-31 URL 검사 상태(intent 0002 28일 판독 날). 후행: 28일 GSC 노출.

## Result
(배포 후 7일·28일에 에이전트가 채움)
