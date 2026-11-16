# Intent: 영어 새 페이지 "Secure online clipboard: end-to-end encrypted rooms"

Author: growth-operator (agent). Status: shipped (2026-11-17). Created: 2026-11-17. Trigger: 정기 (e2ee-campaign.md 3절 E3, owner 2026-11-13 캠페인 승인)

## Problem
방 통합(#76)·그림 코드(#77)로 방 안 파일·텍스트가 기기에서 암호화되지만, 이를 설명하는 영어 착지 페이지가 없다.
- GSC 28일(11-16 주간 리포트 기준값): `암호|종단|보안|encrypt|e2e|secure|private` 포함 검색어 노출 0.
- 영어 자동완성은 있다(11-13 조사): "end to end encrypted file transfer", "e2ee file transfer", "secure online clipboard", "encrypted pastebin".
- 11-17 상위 결과(웹 검색): sharedclipboard.com, SaferDrop, Transfr, anon.li, HexaTransfer, beTransfer 등 "E2EE 파일 전송" 전용 서비스가 차지. 대부분 "zero-knowledge"·"never touches our servers" 류 주장. 우리 차별점은 '같은 와이파이 자동 연결 + 텍스트도 + 설치 없음 + 방 범위를 솔직히 밝힘(서버가 보는 것·웹앱 한계)'.

## Proposed outcome
`/en/guide/end-to-end-encrypted-online-clipboard.html`이 색인되고, 28일 안에 암호화 관련 영어 검색어 노출이 생긴다(기준 0).

## Change
- 새 파일 `frontend/public/en/guide/end-to-end-encrypted-online-clipboard.html` (Article·BreadcrumbList·HowTo·FAQPage JSON-LD, style 블록은 firefox-send-alternative와 동일).
  - 첫 문단: 기준일(2026년 11월), 3단계, 파일당 5GB, 방 파일 약 1일·텍스트 10분, 가입·설치 없음.
  - 암호화되는 것 / 서버가 보는 것 / 기본 탭은 잠금 없으면 평문(e2ee-campaign 1절).
  - 열쇠 전달 3경로(ECDH P-256 + 그림 4개 확인, QR·링크 # 뒤 열쇠, SPAKE2 RFC 9382), 한계(웹앱, 초대 10분, 내보내기 없음, 브라우저 데이터 삭제).
  - "다른 도구가 나은 경우": Wormhole(wormhole.app/security: 브라우저에서 AES-GCM, 열쇠는 링크 # 뒤), LocalSend(localsend.org: 설치형·오픈소스·인터넷 없이 로컬 네트워크). 11-17 공식 페이지 확인.
- 허브 `en/guide/index.html`(ItemList 12번 + 목록), `sitemap.xml`, `llms.txt`, `llms-full.txt` 재생성, 관련 글 링크 1곳: `en/guide/send-large-files-free-no-sign-up.html`(측정 중 intent 없음).
- 자동 머지 허용 경로(frontend/public).
- 버튼 이름은 11-17 07:04 화면 전환(#89) 뒤 master의 en.json 기준: ＋ Room(group.createShort), Create a new room, Invite, Join with pictures, Let in, 기기 줄의 Connect(pair.buttonShort).

## Constraints
- e2ee-campaign 2절: "end-to-end"는 "inside a room" 범위와 함께만. "zero-knowledge", "운영자도 볼 수 없", "by default", "완벽" 금지. 경쟁 서비스는 공식 페이지 확인 내용만, 날짜 표기.
- 하루 개선 1건.

## Measure
새 URL → 색인 확인일(`Indexed:`)부터 7일·28일. GSC 정확일치 노출·클릭·순위 + 이 URL의 검색어 목록.
중단 기준(e2ee-campaign 4절): 11-24 기준 7일 노출 0이면 영어 새 페이지를 더 만들지 않는다.

## Open questions
- 색인 속도: 0025(영어 비교 가이드)는 21일 미색인이었다. 허브·관련 글 링크 + GSC 색인 요청으로 보완.

## Result
(배포 후 에이전트가 채움)
