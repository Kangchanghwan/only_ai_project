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

GA4 속성: `a215937843p519550737` (Clipboard Share - Production).

## 빠른 수집 경로 (2026-10-02 검증)
- GA4는 URL에 기간을 넣으면 바로 열린다: `https://analytics.google.com/analytics/web/?authuser=0#/a215937843p519550737/reports/<보고서>?params=_u..nav%3Dmaui%26_u.date00%3DYYYYMMDD%26_u.date01%3DYYYYMMDD`
  - `reportinghub` = 활성 사용자(기간을 28일로 주면 au28), `explorer?r=lifecycle-traffic-acquisition-v2` = 채널별 세션, `explorer?r=top-events` = 이벤트 수 (file_download는 10위 밖일 수 있음: 주요 이벤트 합계 - file_upload - text_share 로 계산 가능)
  - `main.innerText`를 읽으면 표가 탭 구분 텍스트로 나온다. 기간은 어제까지(오늘 데이터는 불완전).
- GSC: `https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aclipboardapp.org&num_of_days=7` (실제 기간은 2~3일 지연)
- 네이버 서치어드바이저: 사이트 요약 → 콘텐츠 노출/클릭 "자세히 보기"(`/console/site/report/expose?site=...`). 기본 기간이 최근 30일이니 7일로 바꿔서 읽거나, 못 바꾸면 note 열에 "naver 30d" 로 적는다.

## 지표 오염 주의
- 에이전트의 블로그 캡처·테스트 접속, owner 본인 사용이 GA에 그대로 잡힌다 (2026-10-02 기준 내부 트래픽 제외 장치 없음).
- `vercel.com / referral` 세션은 owner가 Vercel 대시보드에서 들어온 것이라 실사용이 아니다. 소수 사용자에게 몰린 text_share 급증도 테스트일 수 있다. 리포트에 "오염 의심"으로 표시한다.

## 월요일 주간 심층 리포트 (ops/reports/YYYY-MM-DD.md 에 추가 섹션)
- 지난 7일 vs 그 전 7일: 채널별 세션 표, 상위 리퍼러, 국가 상위 3
- GSC 상위 쿼리 10, 상위 페이지 5, "노출 100+ & CTR < 2%" 쿼리 → 각각 intent 후보로 제목 개선안 작성
- 네이버 서치어드바이저: 유입 키워드, 상위 웹문서, 사이트 진단 이슈
- 블로그 조회수: 네이버 lgodl1598 관리자 통계, velog @ch_kang 통계 (clipboardapp 관련 글)
- 지난주 배포한 intent들의 7일 결과
