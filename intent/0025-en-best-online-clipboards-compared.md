# Intent: 영어 온라인 클립보드 비교 가이드 (Best online clipboards in 2026, compared)

Author: growth-operator (agent). Status: accepted. Created: 2026-10-25.
Trigger: ai-visibility.md 3절 큐 B·AI 2번째 항목.

## Problem
- ai-visibility B 묶음 "online clipboard" 평균 순위가 10-20 9.0위에서 10-23 13.2위로 내려갔다(ops/metrics/keywords.csv). 기존 /en/ 홈과 online-clipboard-copy-paste-between-devices.html 은 "사용법" 의도라 "비교·선택" 의도(best online clipboard, online clipboard comparison)에 답하는 페이지가 없다.
- AI 질문 q2("Best online clipboard to copy text between phone and computer"), q9 답변에 우리 언급이 늘 필요하다(ai-mentions.csv).

## Proposed outcome
비교 의도 전용 착지 페이지를 만들어 B 묶음 순위를 회복하고 q2·q9 언급을 늘린다. 첫 문단에 답과 기준일("As of October 2026")을 둔다.

## Change
- frontend/public/en/guide/best-online-clipboards-compared.html (Article + Breadcrumb + FAQPage JSON-LD, style 블록은 snapdrop-pairdrop-alternative와 동일). 비교 대상: Clipboard Share, cl1p.net, clipboard.im, ClipSync, PairDrop. 경쟁 수치는 2026-10-25에 공식 페이지에서 확인한 것만, 확인 못 한 칸은 "Not stated". 각 서비스가 나은 경우와 우리 단점(파일 최대 약 1일 보관, 텍스트·기기 정보는 잠금 대상 아님)을 적는다.
- en/guide/index.html 허브(목록 + ItemList position 11), online-clipboard-copy-paste-between-devices 관련 글, sitemap.xml, llms.txt, llms-full.txt 재생성. 자동 머지 허용 경로.

## Constraints
- 사실과 다른 카피 금지(ops/content-rules.json). 자기 최상급 금지, 타사 비하 금지, 확인 못 한 수치 금지.

## Measure
선행: 7일 뒤(11-01) 이 URL GSC 노출·색인, keywords.csv B 순위, ai-mentions q2·q9.
후행: 28일(11-22) 이 URL 클릭, B 순위, ai-mentions q2·q9 점수.

## Open questions
- 없음.

## Result
- 2026-10-25 배포 (master f990450, auto 게이트 통과, 라이브 200·title 확인). 경쟁 수치 중 clipboard.im(100MB/파일·300MB 합계·7일)과 ClipSync(25MB/파일·24시간)는 공식 페이지에서 다시 확인. 기준값: "online clipboard" 10-18–10-24 노출 563·평균 9.9위(일별 10-24 13.6위 잠정), AI Assistant 7일 12세션. 7일 판독 11-01, 28일 11-22.
- 2026-10-26 수정: 비교표 min-width 46rem → 34rem, 글자 13px, 셀 단어 쪼개짐 방지(overflow-wrap normal). 데스크톱 본문 폭 608px 안에 7열이 모두 들어감(가로 스크롤 없음, 모바일은 가로 스크롤). GSC 10-17~10-23 노출 0, "online clipboard" 착지 URL에도 아직 안 나옴.
- 2026-10-30 GSC URL 검사: "Google에 아직 알려지지 않은 URL" (배포 5일). 10-25 색인 요청 이미 함 → 재요청 없이 실행마다 1회 확인. 21일 미색인 기준일 11-15.
