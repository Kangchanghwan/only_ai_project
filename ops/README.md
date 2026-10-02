# ops: AI 에이전트 자율 운영 하네스

Clipboard Share를 "MAU 1,000" 목표까지 AI 에이전트(growth-operator)가 매일 스스로 개선·배포·홍보하도록 만든 장치.
Anthropic Academy의 [AI 네이티브 SDLC 플레이북](https://academy.claude.com/ko/courses/ai-native-sdlc-playbook) 구조를 1인 사이드 프로젝트에 맞게 줄였다.

```
매일 1회
 ① 수집   GA4 / Search Console / 네이버 서치어드바이저 → ops/metrics/daily.csv
 ② 판단   node ops/scripts/bands.mjs  (결정론적, 모델 미개입) → ok / log / diagnose / propose
 ③ 진단   diagnose 이상이면 intent/NNNN-*.md 작성
 ④ 실행   auto/* 브랜치 푸시 → Actions 게이트(허용목록 + SEO eval + 테스트 + 빌드) → master → Vercel 배포
          허용목록 밖 변경은 pr/* → owner 승인
 ⑤ 홍보   요일별 블로그 / 지식iN / 커뮤니티 1건
 ⑥ 보고   ops/reports/YYYY-MM-DD.md + owner에게 5줄 알림
```

| 플레이북 단계 | 이 저장소 |
|---|---|
| 1 계획: intent.md | `intent/goal.md`(최상위 목표·제약), `intent/NNNN-*.md`(개선 단위), `intent/TEMPLATE.md` |
| 3 빌드: 스킬·CLAUDE.md | `ops/playbooks/*.md` (에이전트가 매일 읽는 절차), 루트 `CLAUDE.md` |
| 4 테스트: 지속적 eval | `ops/scripts/check-seo.mjs` + `ops/content-rules.json`(사실과 다른 카피 금지 목록), vitest |
| 5 배포: hooks/게이트 | `ops/auto-merge-allowlist.txt` + `ops/scripts/check-allowlist.mjs`, `.github/workflows/auto-merge.yml` |
| 6 유지보수: 지표 루프 | `ops/bands.json` + `ops/scripts/bands.mjs`, `ops/metrics/daily.csv`, `ops/reports/` |

## 위험도 등급
- 자동 머지: 가이드 페이지, sitemap/llms.txt, FAQ, i18n 카피, intent·리포트·지표 기록.
- owner 승인: 그 외 전부 (앱 로직, 백엔드, 인증, 비용이 드는 설정, 워크플로·게이트 자체).
- 게이트 파일(`.github/`, allowlist, content-rules, scripts)은 에이전트가 스스로 넓힐 수 없다.

## 성과 측정
- 선행: intent 생성 → 배포까지 걸린 시간, 일일 루프 완료율, 게이트 실패율.
- 후행: 28일 활성 사용자(목표 1,000), 배포된 intent 중 7일 지표가 개선된 비율.
