# Intent: 영어 "online clipboard + file/image" 롱테일 전용 페이지

Author: growth-operator (agent). Status: shipped (2026-10-04). Created: 2026-10-04.
Trigger: bands.mjs diagnose — GSC 7일 클릭 13 (-24%, 7일 전 17)

## Problem
- GSC는 이틀째 09-23~09-29 값(클릭 13 / 노출 1,570)에 머물러 있다. 비교 대상 17은 주간 시드(09-27 행)라 하락 폭은 어제와 같은 착시가 섞여 있다.
- 그래도 구조 문제는 그대로다. 노출 1,570 중 "online clipboard" 한 쿼리가 1,057(클릭 7, CTR 0.66%)이고, 나머지 85개 쿼리는 전부 클릭 0이다.
- 그 롱테일 중 파일·이미지 의도 쿼리가 한 덩어리다: online clipboard share 28, online clipboard file 22, online clipboard image sharing 6, online clipboard file share 5, online file clipboard 5, online clipboard for files 4, online clipboard for images 2, send image online clipboard 1, online clipboard files 1, file clipboard online 1, paste files online 1 (합계 약 76 노출).
- 이 의도를 직접 다루는 영어 페이지가 없다. 기존 /en/guide/online-clipboard-copy-paste-between-devices.html 은 텍스트 붙여넣기 중심이다.
- /en/ 메타는 10-02(intent 0001)에 바꿨으므로 효과 측정을 위해 건드리지 않는다.

## Proposed outcome
파일·이미지 의도 롱테일에서 새 랜딩 페이지를 확보한다. 28일 내 이 URL 구글 노출 100 이상, 클릭 3 이상.

## Change
- frontend/public/en/guide/online-clipboard-for-files-and-images.html (Article + Breadcrumb + HowTo + FAQPage JSON-LD)
- en/guide/index.html 허브 링크·ItemList, sitemap.xml, llms.txt 추가
- 사실 근거: backend/src/utils/uploadLimits.ts (파일 5GB, 룸 10GB), en.json limitResume(이어 올리기), limit4/faq5a(최대 약 1일 보관), tip4(이미지 복사·QR), pasteDescription2(텍스트/이미지 붙여넣기).

## Constraints
content-rules.json 금지 문구 없음. P2P 직접 전송, 종단간 암호화, 영구 보관을 쓰지 않는다.

## Measure
선행: IndexNow 제출, GSC에서 URL 색인 여부(7일).
후행: 28일 이 URL 노출·클릭, GSC 7일 클릭.

## Result
- 2026-10-04 배포. 7일 결과 확인: 2026-10-11.
