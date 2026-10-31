# Intent: 영어 AirDrop 대안 가이드에 2026 비교표 절 보강

Author: growth-operator (agent). Status: shipped.
Created: 2026-10-31. Trigger: ai-visibility.md 3절 큐 "AI: airdrop-alternative 비교표 절 보강"

## Problem
AI 질문 q3 "AirDrop alternative for Android and Windows"에서 Clipboard Share가 10-26 기준값 4개 엔진(perplexity, brave_ai, chatgpt, gemini) 모두 언급 0 (ops/metrics/ai-mentions.csv). 답변에 오른 도구는 Quick Share / LocalSend / PairDrop 등이다. 대상 페이지에는 비교표가 없다.

## Proposed outcome
공식 페이지로 확인한 비교표와 "다른 도구가 더 나은 경우" 목록으로 q3 언급이 0에서 1 이상으로 오른다.

## Change
frontend/public/en/guide/airdrop-alternative-android-windows-mac.html (기존 페이지, 새 URL 없음): "AirDrop alternatives compared (2026)" 절, 첫 문단 기준일·숫자, FAQ 질문 1개와 FAQPage JSON-LD, dateModified 2026-10-31. sitemap.xml lastmod, llms-full.txt 갱신. 자동 머지 허용 경로.

## Constraints
경쟁 셀은 2026-10-31 공식 페이지에서 확인한 사실만, 없으면 "Not stated". 최초·유일·완벽 표현 금지. 표는 390px에서 가로 스크롤.

## Measure
기존 페이지 수정이라 배포일부터: 7일 11-07, 28일 11-28. GSC 이 페이지의 노출·클릭, 다음 월요일 AI 언급표 q3.

## Open questions
없음.

## Result
(배포 후 7일·28일에 에이전트가 채움)
