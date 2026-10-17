# Intent: 사용법 영상(유튜브) + 사이트 영상 전용 페이지

Author: owner 지시, agent 실행 | Status: shipped
Created: 2026-10-17. Trigger: owner 아이디어 (광고형 사용법 영상을 만들어 유튜브와 사이트에 올리기)

## Problem
지금까지 유입은 글(가이드·블로그)뿐이고 영상 검색(유튜브, 구글 동영상 탭, 네이버 동영상)에는 노출 자산이 0개다. 폰↔PC 전송은 두 화면이 같이 보여야 이해가 빠른데, 캡처 몇 장으로는 "설치 없이 바로 연결"이 잘 전달되지 않는다.

## Proposed outcome
유튜브 본편·쇼츠와, 영상이 주 콘텐츠인 사이트 시청 페이지 1개를 갖춘다.
측정 가능한 기대치: 28일 안에 GSC 동영상 색인 보고서에서 시청 페이지가 "동영상 색인됨"이 되고, GA4에서 utm_source=youtube 세션이 20회 이상.

## Change
- 유튜브(채널 "강창환", lgodl3512@gmail.com): 본편 https://youtu.be/DqPto5orZ1s (16:9, 52초), 쇼츠 https://youtube.com/shorts/2i_LNpqvL-Y (9:16). 설명란 링크는 UTM(utm_source=youtube, utm_medium=video|shorts, utm_campaign=ad_202610).
- 사이트(자동 머지 허용 경로): frontend/public/guide/clipboard-share-video.html (임베드 + 장면 설명 + 대본 전문 + VideoObject/FAQPage/Breadcrumb JSON-LD), guide/index.html 허브·ItemList, how-to-use.html 관련 글, sitemap.xml(video 확장 태그), llms.txt.
- 이후 실행(블로그, 측정)은 ops/playbooks/video-campaign.md 를 따른다.

## Constraints
- 영상은 실제 사이트 녹화(Android 에뮬레이터 + Mac 크롬). 상태바·주소창·기기 테두리만 다시 그렸다는 사실을 페이지에 적는다.
- 나레이션은 AI 합성 음성(Qwen3-TTS, Apache-2.0)임을 유튜브 설명과 페이지에 적는다.

## Measure
- 선행(7일, 10-24): 시청 페이지 GSC 색인 여부와 동영상 색인 상태, 유튜브 조회수·평균 시청 지속률, GA4 utm_source=youtube 세션.
- 후행(28일, 11-14): 위 지표 + 시청 페이지 노출·클릭, 네이버 블로그 영상 글 조회수. video-campaign.md 3절 표 형식으로 기록.

## Open questions
- 유튜브 설명란 외부 링크는 채널 1회 인증(휴대폰) 전까지 클릭되지 않는다. owner 인증 필요.

## Result
(10-24, 11-14에 에이전트가 채움)
