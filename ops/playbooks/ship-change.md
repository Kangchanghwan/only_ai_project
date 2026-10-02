# Ship a change

## 공통
1. 오늘 worktree에서 브랜치 생성: `git switch -c auto/YYYYMMDD-<slug>` (허용 경로 밖이면 `pr/...`).
2. 변경 → `node ops/scripts/check-seo.mjs` → `node ops/scripts/check-allowlist.mjs origin/master` 로 로컬 확인.
   (로컬 샌드박스는 rollup 네이티브 모듈이 막혀 vitest를 못 돌린다. 테스트는 Actions에 맡긴다.)
3. 커밋 메시지: `<type>(<scope>): <요약> (intent NNNN)`. 본문에 근거 수치 1줄.
4. `git push origin HEAD`. auto/* 는 Actions가 게이트 통과 시 master로 머지하고 브랜치를 지운다.
5. 3~5분 뒤 Actions 결과와 라이브 URL을 확인한다. 실패면 로그를 읽고 같은 브랜치에 수정 커밋 (최대 2회). 그래도 실패면 브랜치를 남기고 보고.

## 가이드 페이지 새로 만들기
- `frontend/public/guide/`(한국어) 또는 `frontend/public/en/guide/`(영어). 기존 페이지와 `<style>` 블록을 바이트 단위로 동일하게 복사한다.
- 필수: title 70자 이하, meta description 50자 이상, canonical(자기 URL), og 태그, HowTo/FAQPage JSON-LD, 허브(`guide/index.html` 또는 `en/guide/index.html`) 링크 추가.
- 같은 커밋에서 `sitemap.xml`과 `llms.txt`에 URL 추가 (check-seo가 둘의 일치를 검사한다).
- 키워드 선택: 서치어드바이저/GSC 실제 유입 키워드 중 아직 페이지가 없는 것 > 주간 리포트 제안 > 영어권 대체재 키워드(snapdrop, pairdrop, airdrop for windows, online clipboard).
- 제품 사실은 라이브 사이트와 코드에서 확인한 것만. 금지 문구는 ops/content-rules.json.

## 메타·카피 수정
- 앱 화면 메타는 `frontend/src/i18n/locales/*.json`의 메타 키. 영어만 바꿔도 되지만 키를 지우거나 새로 만들면 21개 로케일 모두에 넣어야 i18n 테스트가 통과한다.

## PR (허용 경로 밖)
- 브라우저로 `https://github.com/Kangchanghwan/only_ai_project/compare/master...pr/<branch>` 에서 PR 생성. 본문: 연결 intent, 변경 이유, 위험, 롤백 방법.
- 머지는 owner만 한다.

## 롤백
- 배포 후 라이브 사이트가 깨지면 즉시 `git revert <sha>` 를 auto/YYYYMMDD-revert 로 푸시 (원래 변경이 auto였다면 revert도 같은 경로라 게이트 통과, PR 변경이면 owner에게 즉시 알림). 보고에 최우선으로 적는다.
