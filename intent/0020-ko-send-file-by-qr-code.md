# Intent: 한국어 가이드 "QR코드로 파일 보내기" (잠금 캠페인 QR 각도)

Author: growth-operator (agent). Status: shipped (2026-10-21). Created: 2026-10-21.
Trigger: bands.mjs 최고 등급 ok (일곱째 날). proposed/accepted intent 없음 → 우선순위 4 "새 가이드 페이지 1개". lock-campaign.md 3절 후보 키워드 "QR코드로 파일 보내기".

## Problem
- QR 공유는 일반 파일(⋯ → QR 코드로 공유), 여러 파일(선택 → QR 코드), 잠긴 파일(열쇠가 # 뒤에 든 QR)까지 있는데, 이를 주제로 한 페이지가 없다. 0014(비밀번호 잠금)에서 QR은 5단계 중 선택 단계 1줄이다.
- GA4 qr_open 이벤트(10-18 기준 7일 76회·39명)는 QR이 이미 많이 쓰이는 기능임을 보여 준다.
- GSC·서치어드바이저 28일에 QR 관련 노출은 0 → 기존 페이지와 겹치는 쿼리가 없어 0001처럼 기존 순위를 흔들 위험이 작다.
- 기존 한국어 가이드 3개(0002·0004·0006)가 "발견됨-미색인"이라 비슷한 대용량·사진 주제를 또 만드는 대신, 겹치지 않는 주제를 고른다.

## Change (자동 머지 허용 경로)
- 새 페이지 frontend/public/guide/send-file-by-qr-code.html (style 블록은 send-file-with-password.html과 동일, Article·Breadcrumb·HowTo 5단계·FAQPage 4문항).
- guide/index.html 허브 목록·ItemList, sitemap.xml(새 URL, /guide/·pc-bang lastmod), llms.txt.
- 관련 글 링크: pc-bang-file-transfer.html(네이버 노출 있음), send-file-with-password.html.
- 제품 사실(코드 확인): 일반 파일 QR = R2 공개 파일 주소(FileQRCodeModal, r2Service getPublicUrl) → 다른 네트워크·휴대폰 데이터로도 받음. 여러 파일 QR = `#/download?r=<room>&f=...`(MultiFileQRCodeModal, 너무 길면 나누라는 안내). 잠긴 파일 QR = 파일 하나의 열쇠를 # 뒤에. 보관은 모두 나가면 곧 삭제, 최대 약 1일.
- 쓰지 않은 것: 경쟁 QR 생성 서비스 이름·보관 기간(공식 문서 미확인), 여러 파일 QR이 다른 네트워크에서도 되는지(실기기 미확인).

## Measure
- 선행: GSC URL 검사 색인 여부(10-24), 네이버 웹문서 노출.
- 7일(10-28): GSC·네이버 새 URL 노출 > 0, "qr" 포함 쿼리 노출.
- 28일(11-18): 새 URL 클릭 ≥ 3, GA4 qr_open(qr_type=file|multi_file) 7일 사용자 수 변화.
- 10-23 네이버 L2 글에서 이 페이지로 링크할 수 있다.

## Result
- 2026-10-21 배포. 7일 판독 10-28.
