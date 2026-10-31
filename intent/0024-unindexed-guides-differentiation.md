# Intent: 색인 안 되는 가이드 4개의 차별점 점검 (합치기 또는 첫 문단 다시 쓰기)

Author: growth-operator (agent). Status: accepted (owner 2026-10-25). Created: 2026-10-24.
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
- 2026-10-26 (1/4): 겹침 표(상: large-file-transfer ↔ en send-large-files 번역 수준, 중: iphone-galaxy ↔ iphone-to-windows·galaxy-photo-to-pc, 하~중: airdrop-not-working ↔ android-mac, 하: 영상 ↔ how-to-use). 겹침이 가장 큰 /guide/large-file-transfer-free-no-signup.html 의 title·description·H1·첫 문단·H2를 "수 GB 파일 한 번에 보내기·끊기면 이어 올리기"(파일당 5GB, 방 합계 10GB, 100MB 초과 시 조각 업로드·같은 파일 다시 고르면 이어짐 = multipartUploader.js 확인)로 다시 씀. master ecce007. GSC URL 검사 '발견됨 - 현재 색인이 생성되지 않음'(크롤링 기록 없음) → 색인 요청, 네이버 수집 요청 완료. 다음: iphone-galaxy-photo-transfer(폰→폰 기기 간 전송 각도).
- 2026-10-27 (2/4): iphone-galaxy-photo-transfer 는 iphone-to-windows·galaxy-photo-to-pc 와 제목 틀("사진 옮기기: 케이블·앱 없이")·"보통 ~ 쓴다 → 같은 와이파이 브라우저" 도입·H2("옮기는 방법/알아두면 좋은 것/자주 묻는 질문")가 거의 같고 폰→PC 대 폰→폰 차이가 첫 화면에 안 드러났다. title·description·og·JSON-LD·H1·첫 문단·H2를 "폰→폰(아이폰↔갤럭시 직접, 앱·케이블·계정 없음, 4단계, 파일당 5GB, 최대 약 1일 보관, 2026년 10월 기준)"으로 다시 씀, sitemap lastmod 2026-10-27. 확인한 코드: backend/src/utils/uploadLimits.ts(파일당 5GB), r2Service.js(원본 파일 presigned 업로드, 재압축 없음), server.ts·textQueueStore.ts(1일 수명 주기), ko.json lock.chipHint. 다음: airdrop-not-working-iphone-mac(증상·오류별)
- 2026-10-29 (3/4): airdrop-not-working-iphone-mac 은 android-mac-airdrop-alternative 와 틀("AirDrop 대신 같은 와이파이 브라우저로 맥에 옮기기")·H2 세트(방법/알아두면 좋은 것/자주 묻는 질문)가 같았다. title·description·og·JSON-LD·H1·첫 문단·H2를 "증상·오류별 점검(목록에 안 보임 / 대기 중 / 거절·실패 / 큰 파일 실패 / 상대가 윈도우·안드로이드) → 그래도 안 되면 브라우저"로 다시 쓰고 증상별 점검표를 넣음. 애플 쪽 사실은 support.apple.com/ko-kr/119857(2026-10-05 게시, 10분 설정·iOS 26.2 AirDrop 코드)과 Mac 사용 설명서 mh35868 에서 확인한 것만. 우리 쪽 숫자는 uploadLimits.ts(파일당 5GB), multipartUploader.js(100MB 초과 조각 업로드·이어 올리기). sitemap lastmod 10-29, llms.txt 설명·llms-full.txt 갱신. master 63f4f68. 다음: clipboard-share-video(장면별 요약 표).
- 2026-10-30 (4/4): clipboard-share-video 의 장면 목록을 장면별 요약 표(시간 | 장면·화면·관련 가이드, 모바일 390px 넘침 없음)로 바꾸고 "장면별로 더 자세히" 링크를 표로 합침, 첫 문단·description에 영상+표+대본 구성 명시, VideoObject hasPart Clip 7개(키 모먼트), sitemap lastmod 10-30, llms-full.txt 갱신. 다음: 10-31 URL 검사 후 4개 페이지 합치기 여부 owner 질문 판단.
- 2026-10-30 URL 검사: iphone-galaxy-photo-transfer **색인 생성됨**(2/4 수정 10-27 후 3일). large-file-transfer(1/4)·airdrop-not-working(3/4)·clipboard-share-video(4/4)는 "발견됨 - 현재 색인이 생성되지 않음". video는 오늘 수정 후 색인 요청·네이버 수집 요청.
- 2026-10-31 URL 검사(재요청 없음): large-file-transfer "발견됨 - 현재 색인이 생성되지 않음"(수정 후 5일), clipboard-share-video 같은 상태(수정 후 1일), airdrop-not-working 은 "Google에 아직 알려지지 않은 URL"(10-30 '발견됨'에서 다르게 표시, 수정 후 2일). 4개 중 1개 색인(iphone-galaxy). 수정 후 1주가 안 된 페이지가 2개라 11-06(목, 4/4 수정 1주)까지 하루 1회 상태만 확인하고, 그때도 미색인이면 합치기 안을 실행한다. owner 질문(10-31 보고): 11-06에도 미색인이면 (1) 영상 페이지 → how-to-use.html 로 canonical, (2) 한국어 대용량 가이드 ↔ 영어 send-large-files 는 합치지 않고 hreflang 짝 연결, (3) 에어드롭 안 될 때는 android-mac-airdrop-alternative 로 canonical — 이 순서로 진행해도 되는지.
