# Daily loop (growth-operator)

매일 1회 실행. 목표와 제약은 `intent/goal.md`가 최우선이다. 이 문서와 충돌하면 goal.md를 따른다.
작업 디렉터리는 항상 origin/master에서 새로 만든 worktree다 (로컬 기능 브랜치를 건드리지 않는다).

## 0. 준비
1. `git fetch origin` → `git worktree add /tmp/cs-ops-YYYYMMDD origin/master --detach`
2. 읽기: intent/goal.md, 최근 ops/reports/ 3개, 상태가 proposed/accepted인 intent/*.md, 루틴 메모리.
3. 어제 연 PR·auto 브랜치 결과 확인: GitHub Actions(https://github.com/Kangchanghwan/only_ai_project/actions)에서 auto-merge 성공/실패. 실패면 원인을 읽고 오늘 고치거나 intent에 기록.

## 1. 수집 (metrics.md)
GA4·GSC·네이버 서치어드바이저 값을 읽어 `ops/metrics/daily.csv`에 오늘 행 1개 추가.
접근 불가 소스는 빈 칸으로 두고 보고에 "접근 불가: 재로그인 필요"로 적는다.

## 2. 판단 (모델 미개입)
`node ops/scripts/bands.mjs` 실행. 출력 등급을 그대로 따른다.
- ok/log: 정기 작업만 (아래 4, 5).
- diagnose: 해당 지표의 원인을 읽기 전용으로 진단(어느 채널·페이지·쿼리가 빠졌나) → intent 작성(status proposed).
- propose: diagnose + 오늘 그 intent를 실행.

## 3. 개선 1건 (ship-change.md)
매일 최대 1건만 배포한다 (효과 측정을 위해 변경을 섞지 않는다).
우선순위: propose 등급 intent > accepted intent > 효과 큰 proposed intent(가장 오래된 것부터) > 새 가이드 페이지 1개.
- 자동 머지 허용 경로면 `auto/YYYYMMDD-<slug>` 브랜치로 푸시 → Actions가 게이트 통과 시 머지·배포.
- 허용 경로 밖이면 `pr/YYYYMMDD-<slug>` 브랜치로 푸시하고 GitHub에서 PR을 연다. 보고에 "승인 필요"로 올린다. 머지하지 않는다.
- 배포 7일·28일 뒤 해당 intent의 Result 칸에 수치를 채운다. 효과가 없으면 rejected로 바꾸고 이유를 적는다.

## 4. 홍보 (요일별, 한 번에 하나)
| 요일 | 작업 | 플레이북 |
|---|---|---|
| 월 | 주간 심층 리포트 (지난 7일 vs 전 7일, 저CTR 쿼리 표) + 지난주 커뮤니티 글 댓글 확인·답글 | metrics.md, community.md |
| 화, 금 | 네이버 블로그 1편 발행 | naver-blog.md |
| 수 | 커뮤니티 1곳 (카페 큐 또는 런칭 큐에서 다음 차례) | community.md |
| 목 | velog 개발기 1편 발행 (매주) | velog.md |
| 토 | 디스콰이엇 메이커 로그 1개 (이번 주 배포·실험 결과 요약) | community.md |
| 일 | 홍보 없음 | |

지식iN은 2026-10-02부로 중단 (적합 질문 부족, 홍보성으로 보일 위험). kin.md는 참고용으로만 남긴다.

로그인 만료·CAPTCHA·가입 필요 시 그 작업만 건너뛰고 보고에 적는다. 다른 수단으로 우회하지 않는다.

## 5. 기록과 보고
1. `ops/reports/YYYY-MM-DD.md` 작성: 지표 밴드 표, 오늘 한 일(링크), 새 intent, 승인 필요 목록, 막힌 것.
2. daily.csv, 리포트, intent 변경을 `auto/YYYYMMDD-ops` 브랜치로 푸시 (개선 변경과 같은 브랜치에 섞어도 됨).
3. owner에게 알림 1개. 형식 (5줄 이내, 변동사항만):
   - 지표: 28일 사용자 N (어제 대비 ±n, 페이스 n%), 특이 등급
   - 배포: 오늘 머지된 것 1줄
   - 홍보: 발행한 글/답변 링크 수
   - 승인 필요: 있으면 PR 링크, 없으면 생략
   - 막힘: 재로그인 필요 등, 없으면 생략
4. worktree 정리: `git worktree remove /tmp/cs-ops-YYYYMMDD`.

## 안전 규칙
- `.github/`, `ops/auto-merge-allowlist.txt`, `ops/content-rules.json`, `ops/scripts/`는 자동 머지 대상이 아니다. 고치려면 PR.
- 하루 auto 브랜치 푸시는 최대 2회 (개선 1 + ops 기록 1).
- 테스트를 끄거나 금지 문구 목록을 줄여서 게이트를 통과시키지 않는다.
- 사용자 파일·텍스트 내용은 절대 열람하지 않는다. 테스트 업로드는 직접 만든 작은 파일만, 끝나면 삭제.
