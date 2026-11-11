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
- 2026-11-05 정정: 선정 근거 "GSC 28일 196/3"은 page=* 부분일치 값으로, 실제로는 영어 /en/guide/transfer-photos-iphone-to-windows-without-cable.html(196/3, 17.9위)의 것이었다. 이 한국어 페이지는 GSC 28일 노출 0(정확일치 page=!), URL 검사 "Google에 등록되어 있지 않음". 네이버 7일 상위 10 웹문서에도 없음. 변경 자체는 사실 보강이라 유지. 오늘 GSC 색인 요청·네이버 수집 요청.
- 판독 기준 변경: 7일(11-12) = GSC 색인 여부 + 네이버 웹문서 노출, 28일(12-03) = 네이버·GSC 노출·클릭. 노출 0이 이어지면 효과 판정 대신 "미색인"으로 기록.
- 2026-11-07 GSC URL 검사(상태만): "발견됨 - 현재 색인이 생성되지 않음"(크롤링 기록 없음). 7일 판독 11-12.
- 2026-11-08 GSC URL 검사(상태만, 재요청 안 함): "발견됨 - 현재 색인이 생성되지 않음". 7일 판독 11-12.
- 7일(2026-11-12): GSC URL 검사 "URL이 Google에 등록되어 있지 않음 / 발견됨 - 현재 색인이 생성되지 않음"(크롤링 기록 없음), GSC 정확일치 11-05–11-09 0/0. 네이버 최근 30일 이 웹문서 노출 169 / 클릭 1. 판정 보류, 28일 판독 12-03(구글 미색인이 이어지면 "미색인"으로 기록).
