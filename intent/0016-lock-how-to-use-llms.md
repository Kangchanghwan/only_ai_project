# Intent: how-to-use·llms.txt·가이드 허브에 비밀번호 잠금 반영

Author: owner (2026-10-15 지시, 에이전트 작성). Status: shipped (2026-10-18, master 96e6706). Created: 2026-10-15.
Trigger: ops/playbooks/lock-campaign.md.

## Problem
- how-to-use.html(네이버 웹문서 클릭이 나오기 시작한 페이지, intent 0011)에 잠그기 단계가 없다.
- llms.txt 소개 문단과 페이지 목록에 잠금이 없어 AI 어시스턴트 유입(7일 20~26세션)이 이 기능을 모른다.

## Proposed outcome
사용법 페이지에 "민감한 파일 잠그기" 단계 1개, llms.txt 소개 1문장과 0014·0015 링크, 가이드 허브 소개 1문장.

## Change (자동 머지 허용 경로)
frontend/public/how-to-use.html, frontend/public/llms.txt, frontend/public/guide/index.html, frontend/public/en/guide/index.html. 0014·0015 배포 뒤에 한다.

## Measure
선행: 7일 how-to-use 네이버·GSC 클릭 유지 이상. 후행: 28일 AI Assistant 채널 세션.

## Result
- 2026-10-18 배포: how-to-use 잠금·1:1 두 절, llms.txt 소개·How to use 설명, 한국어·영어 허브 소개 문단. 기준값: how-to-use 네이버 7일 41 노출 / 1 클릭, AI Assistant 7일 11세션(10-11–10-17). 7일 판독 10-25, 28일 11-15.
