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

## 보정 28일 사용자 (owner 결정 2026-10-27, 매일)
자동화·크롤러 접속이 섞여 au28이 부풀 수 있어, 원본 au28 옆에 보정 수치를 같이 적는다. GA 원본·bands.mjs 입력(daily.csv)은 건드리지 않는다. **목표 1,000 판단과 보고의 "페이스"는 보정 수치 기준으로도 함께 적는다.**
- 출처: GA4 인구통계 세부정보(국가), au28과 같은 28일 범위. URL `explorer?params=_u..nav%3Dmaui%26_u.date00%3DA%26_u.date01%3DB%26_r.explorerCard..seldim%3D%5B%22country%22%5D%26_r.explorerCard..rowShow%3D50&r=user-demographics-detail`, `table` innerText.
- **제외 국가** = 한국이 아니고, 28일 활성 사용자 10명 이상이고, 세션 기준 주요 이벤트 비율(주요 이벤트 수 ÷ 세션 수) **10% 이하**인 국가. 보정 au28 = 원본 au28 − 제외 국가 활성 사용자 합. (2026-11-21 owner 승인 개정: "미만" → "이하")
  - 측정: 트래픽 획득(lifecycle-traffic-acquisition-v2, 같은 28일) → 보조 측정기준 국가 → 표 검색에 국가명 → 합계 행의 세션·주요 이벤트 수로 직접 나눈다. 인구통계 국가 표의 비율 열은 사용자 기준이라 판정에 쓰지 않는다(15% 미만인 국가만 세션 기준으로 다시 잰다).
  - **한 번 제외된 나라는 2주 연속(월요일 주간 리포트 2회 연속) 세션 기준 15% 이상일 때만 다시 포함**한다. 그 전까지는 매일 값이 10%를 넘어도 계속 뺀다(경계값에서 오락가락하지 않게). 주간 리포트에 제외 중인 나라의 그 주 값을 적는다.
- **제외 국가 2** (owner 결정 2026-11-03): 한국이 아니고, 28일 활성 사용자 10명 이상이고, 사용자당 이벤트 수가 **한국을 뺀 나라들의 평균**(한국 외 이벤트 합 ÷ 한국 외 활성 사용자 합, 2026-11-21 owner 승인 개정)의 3배 이상이고, 기기 카테고리가 **desktop 100%**인 국가. 소수 기기의 반복 사용·자동화로 보고 뺀다. 기기 비율은 GA 기술 > 기기 카테고리 보고서에 보조 측정기준 국가(또는 국가 보고서 보조 측정기준 기기 카테고리)로 확인. 실제 단체 사용으로 확인되면 owner 승인 후 되돌린다.
- **관찰 국가**(제외하지 않고 note만): 한국 외, 사용자 10명 이상, 사용자당 이벤트 수가 한국 외 평균 3배 이상이지만 모바일이 섞인 국가.
- 기록: `ops/metrics/adjusted.csv` 1행 (date,range,au28_raw,au28_adj,excluded,watch,note). 보고 "지표" 줄: "28일 사용자 N (보정 M)".
- 규칙을 바꾸려면 owner 승인. 바꾸면 이전 행도 새 규칙으로 다시 계산해 note에 표시.
