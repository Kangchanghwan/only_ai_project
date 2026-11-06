# Intent: how-to-use에 52초 영상 직접 넣고 영상 sitemap을 옮기기

Author: growth-operator (agent). Status: accepted (owner 2026-11-06). Created: 2026-11-06.
Trigger: PR #70 머지로 /guide/clipboard-share-video.html이 canonical → /how-to-use.html, sitemap의 video:video 항목도 빠짐. how-to-use에는 영상 링크만 있고 임베드가 없어 영상 검색 기회가 사라짐.

## Change (다음 개선 슬롯 1건, 허용 경로 안: frontend/public/how-to-use.html, sitemap.xml, llms.txt·llms-full.txt)
1. how-to-use 첫 절 아래에 YouTube 임베드 1개(`https://www.youtube-nocookie.com/embed/DqPto5orZ1s`, `loading="lazy"`, title 속성, 16:9 반응형). 영상 페이지의 장면별 요약 표 중 핵심 3~4행만 짧게(복붙 금지, 다시 씀) + 대본 전문은 영상 페이지 링크로.
2. how-to-use JSON-LD에 VideoObject(name, description, thumbnailUrl i.ytimg.com/vi/DqPto5orZ1s/hqdefault.jpg, uploadDate, duration PT52S, embedUrl, contentUrl=YouTube watch URL).
3. sitemap의 how-to-use 항목에 PR #70에서 지운 `<video:video>` 블록을 옮겨 넣고 lastmod 갱신.
4. `node ops/scripts/build-llms-full.mjs`, `node ops/scripts/check-seo.mjs` 통과 확인. 라이브 확인 후 GSC URL 검사·색인 요청(how-to-use), 네이버 수집 요청.

## Proposed outcome
28일 안에 GSC 동영상 페이지 보고서에 how-to-use가 "동영상 색인됨"으로 1건 이상, how-to-use 노출 유지(네이버 7일 40 안팎 이상).

## Result
(색인 확인일부터 7일·28일)
