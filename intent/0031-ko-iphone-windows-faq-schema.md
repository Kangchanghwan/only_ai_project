# Intent: 아이폰→윈도우 사진 가이드에 HowTo·FAQ 구조화 데이터와 5GB·약 1일 사실

Author: growth-operator (agent). Status: accepted. Created: 2026-11-05.
Trigger: bands.mjs 최고 등급 diagnose(referral7 3, intent 0028에서 홍보 슬롯으로 처리 중) → 개선 슬롯은 ai-visibility.md 3절 우선순위. 0024 2단계는 11-06 사전 승인 슬롯, 새 URL은 보류 중이라 이미 색인된 페이지 보강.

## Problem
- 한국어 가이드 중 HowTo/FAQPage JSON-LD가 없는 4개(android-mac-airdrop-alternative, copy-text-phone-to-pc, iphone-to-windows-photo-transfer, pc-bang-file-transfer) 가운데 GSC 28일(10-06–11-02) 노출이 가장 큰 페이지: iphone-to-windows 196 노출 3 클릭 (copy-text 68/1, pc-bang 20/0, 페이지 부분일치 필터).
- 본문 "업로드 카드에 표시된 최대 용량"이 모호하고, 파일 보관 기간이 없다.

## Change
- 본문 5단계 중 핵심 4단계를 HowTo JSON-LD로, 본문 질문 2개 + 새 질문 1개("파일 크기와 보관 기간 제한이 있나요?")를 FAQPage JSON-LD로.
- "업로드 카드에 표시된 최대 용량" → "파일 하나는 5GB까지". 삭제 문장에 "파일은 최대 약 1일까지만 보관" 추가.
- 제목·설명은 바꾸지 않음. dateModified·sitemap lastmod 2026-11-05.

## Measure
기존 페이지 수정이라 배포일(11-05)부터. 7일 판독 11-12 (GSC 페이지 노출·클릭, 기준 28일 196/3), 28일 판독 12-03.

## Result
- 2026-11-05 배포.
