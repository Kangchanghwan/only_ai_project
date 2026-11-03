# Intent: 영어 "Share clipboard between phone and PC" 가이드에 HowTo·FAQ 구조화 데이터와 구체 사실

Author: growth-operator (agent). Status: shipped (2026-11-04). Created: 2026-11-04.
Trigger: 개선 슬롯. 이번 주 0027·0029가 "첫 문단 기준일 문단" 패턴이라 같은 패턴 3번째 대신 다른 종류(구조화 데이터 + 사실 갱신)로, 이미 색인된 노출 상위 페이지를 고른다.

## Problem
- GSC 28일(10-04–10-31) /en/guide/share-clipboard-between-phone-and-pc.html 노출 491, 클릭 16. 영어 가이드 노출 2위.
- 영어 가이드 12개 중 이 페이지와 허브만 HowTo·FAQPage JSON-LD가 없다(본문에는 단계 5개와 질문 2개가 이미 있음).
- "Good to know"의 파일 크기 줄이 "업로드 카드에 표시된 한도"로 모호하고, 보관 기간(최대 약 1일)·비밀번호 잠금이 없다. 2026-09-12 작성 뒤 갱신 없음.

## Change
- HowTo(본문 단계 5개 그대로) + FAQPage(본문 질문 3개 그대로) JSON-LD 추가.
- 본문: 파일 크기 줄 → "Each file can be up to 5GB", 삭제 줄에 "files are kept for at most about a day", 잠금 한 줄, 질문 "How big can a file be, and how long is it kept?" 추가.
- 제목·설명·첫 두 문단은 그대로. Article dateModified·sitemap lastmod 2026-11-04, llms-full 재생성.

## Constraints
사실은 사이트 공통 문장(ai-visibility.md 3절)과 lock-campaign.md 1절만. 잠금은 "직접 켜야" 하고 "같은 비밀번호를 입력해야 연다"까지만 쓴다. 금지 문구 없음(check-seo 통과).

## Measure
기존 페이지 수정이라 배포일 기준. 7일(11-11): 이 URL GSC 노출·CTR (기준 28일 491/16, 7일 평균 약 123/4). 28일(12-02): 클릭, AI 언급표에서 이 URL 인용 여부, GSC 개선사항(FAQ/HowTo 인식) 오류 0.

## Result
