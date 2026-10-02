# Metrics collection

모두 읽기 전용. 설정 변경 금지.

## daily.csv 한 행 (각 값 = 오늘 기준 최근 7일 롤링, au28만 28일)
| 열 | 출처 |
|---|---|
| au28 | GA4 활성 사용자, 지난 28일 |
| au7, sessions7 | GA4 활성 사용자·세션, 지난 7일 |
| organic7, referral7, direct7, social7 | GA4 세션 기본 채널 그룹별 세션, 지난 7일 (Organic Social은 social7) |
| file_upload7, text_share7, file_download7 | GA4 이벤트 수, 지난 7일. conversions7 = 셋의 합 |
| gsc_clicks7, gsc_impr7 | Search Console `sc-domain:clipboardapp.org` 지난 7일 (2~3일 지연된 값 그대로) |
| naver_clicks7, naver_impr7 | 네이버 서치어드바이저 www.clipboardapp.org 최근 7일 |
| note | 그날 배포·발행 1줄 (효과 추적용) |

GA4 속성: `a215937843p519550737` (Clipboard Share - Production). GA4 Data API나 탐색 화면에서 같은 기간으로 읽는다.

## 월요일 주간 심층 리포트 (ops/reports/YYYY-MM-DD.md 에 추가 섹션)
- 지난 7일 vs 그 전 7일: 채널별 세션 표, 상위 리퍼러, 국가 상위 3
- GSC 상위 쿼리 10, 상위 페이지 5, "노출 100+ & CTR < 2%" 쿼리 → 각각 intent 후보로 제목 개선안 작성
- 네이버 서치어드바이저: 유입 키워드, 상위 웹문서, 사이트 진단 이슈
- 블로그 조회수: 네이버 lgodl1598 관리자 통계, velog @ch_kang 통계 (clipboardapp 관련 글)
- 지난주 배포한 intent들의 7일 결과
