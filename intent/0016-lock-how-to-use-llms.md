# Intent: how-to-use·llms.txt·가이드 허브에 비밀번호 잠금 반영

Author: owner (2026-10-15 지시, 에이전트 작성). Status: rejected (2026-11-15 28일 판독, 유입 효과 없음. 사용법 내용은 유지). Shipped 2026-10-18, master 96e6706. Created: 2026-10-15.
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
- 2026-10-25 7일 판독: how-to-use 네이버 최근 7일 43 노출 / 4 클릭(CTR 9.3%, 기준 41/1) → 선행 조건(클릭 유지 이상) 충족. GSC 10-18–10-24 노출 0(이 페이지는 원래 구글 노출이 거의 없음). AI Assistant 7일 12세션(기준 11). 28일 판독 11-15에 계속.
- 2026-11-15 28일 판독 (rejected): how-to-use GSC 정확일치 10-18–11-13 노출 3, 클릭 0, 6.7위. 네이버 30일 웹문서 362 노출 / 5 클릭(7일 116/0). AI Assistant 28일(10-18–11-14) 41세션 = 주 10 정도로 기준(7일 11)과 같다. 잠금 절 추가로 늘어난 유입은 보이지 않는다. 이 페이지는 그 뒤 0032(영상)·0040(방 문구)·11-15 e2ee E1(방 절)로 계속 바뀌어 잠금 절만의 효과는 분리할 수 없다. 내용은 사용법 문서로 유지.
