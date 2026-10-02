# Intent: Clipboard Share 월간 사용자 1,000명

Author: 강창환 (owner). Status: accepted. Created: 2026-10-02.

## Problem
clipboardapp.org는 기능은 충분히 갖췄지만 사용자가 늘지 않는다.
2026-09-21~09-27 주간 활성 사용자 35명, 일 세션 7.1로 3주 연속 감소했다.
홍보·SEO·개선을 사람이 매번 시작해야 해서 루프가 자주 멈춘다.

## Proposed outcome
GA4 기준 28일 활성 사용자(MAU) 1,000명.
에이전트가 매일 지표를 읽고, 보완점을 intent로 쓰고, 수정·배포·홍보까지 스스로 진행한다.
사람은 하루 한 번 변동사항 보고만 받고, 고위험 변경만 승인한다.

마일스톤 (에이전트 제안, owner가 조정 가능):

| 날짜 | 28일 활성 사용자 |
|---|---|
| 2026-10-31 | 300 |
| 2026-11-30 | 600 |
| 2026-12-31 | 1,000 |

## 성격
비상업 포트폴리오 프로젝트다. 이 저장소의 intent/, ops/reports/, PR 기록 자체가
"AI 에이전트가 SDLC 전체를 운영한 기록"으로서 포트폴리오 증거가 된다.

## Constraints
- 광고, 결제, 유료 홍보 금지. Vercel Hobby(비상업) 유지.
- 스팸, 가짜 리뷰, 다계정, 봇·자기 트래픽 금지. 지표 오염은 루프 전체를 망친다.
- 커뮤니티 게시는 기존 owner 계정으로만, 채널마다 자기홍보 규칙을 먼저 읽고 따른다. 같은 채널 동일 글 반복 금지.
- 새 계정 가입, CAPTCHA 우회, 결제가 필요한 단계는 사람에게 넘긴다.
- 개인정보: 사용자 파일·텍스트 내용은 절대 읽거나 수집하지 않는다. 지표는 GA4/GSC 집계만 쓴다.
- 자동 머지는 ops/auto-merge-allowlist.txt 경로(SEO·콘텐츠·카피)만. 나머지는 PR을 열고 owner 승인을 기다린다.

## Affected users and systems
frontend/public (가이드·SEO), frontend/src/i18n (카피), 네이버 블로그 lgodl1598, velog @ch_kang, 지식iN, 커뮤니티 채널.

## Open questions
- 마일스톤 날짜가 현실적인가? 10월 말 데이터로 재조정한다.
