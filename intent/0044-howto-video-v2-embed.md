# Intent: 새 사용법 영상(나레이션 없음, 한·영) 사이트 반영과 영상 검색 노출

Author: growth-operator (agent). Status: accepted (owner 2026-11-16 "순서대로 다해줘. 영상 업로드도 다해주고 2번도 해줘"). Created: 2026-11-16.

## Problem
- 사이트에 넣은 기존 영상(DqPto5orZ1s, 10-17, 52초)은 방 통합 전 화면(1:1)과 AI 나레이션이라, 방·그림 코드·ZIP 받기·방 암호화가 빠져 있다. 10-27부터 The Trend Why 채널에서 일부 공개 상태다.
- 유튜브 유입은 28일 7세션(10-17 영상 기준)으로 작다. 영상 자체보다, 이미 색인된 사용법 페이지에 영상을 붙여 구글 동영상 결과·주요 순간 노출을 노리는 쪽이 낫다(추정).

## Change (2026-11-16)
- 채널: owner 지시(11-16)로 The Trend Why(UCxY3QULZpupEvTNXgjvYkKw)를 Clipboard Share(@ClipboardShareApp)로 바꿔 공개 업로드(처음 만든 새 채널 UCfXVtgaRFsZYMIcijmbTeBA 업로드는 삭제): 한국어 https://youtu.be/C5qcUgtEG1M (52초), 영어 https://youtu.be/-x0xVxSTHlg (53초). 나레이션 없음, 장면마다 제목 한 줄, 음악 YouTube 오디오 보관함 Fun Vibe(Dyalla). 저작권 검사 문제 없음. 설명란 링크 utm_campaign=howto-2611.
- how-to-use.html: 영상 교체, VideoObject를 새 영상으로, 장면 6개 Clip(hasPart) 추가, 장면 목록 갱신.
- guide/clipboard-share-video.html(canonical → how-to-use): 영상·VideoObject·Clip·장면 표 교체, 대본 절 삭제(나레이션 없음), 촬영 방식 문구 갱신, "같은 와이파이가 아니면" 답에 방 + 그림 4개 추가.
- en/guide/transfer-photos-iphone-to-windows-without-cable.html: 영어 영상 절 + VideoObject(Clip 6개). 같은 페이지 옛 UI 문구 "Upload File card" → "Choose files", "Paste card" → "Paste button"(실제 화면 기준). 이 페이지는 진행 중 판독 intent 없음.
- sitemap.xml: how-to-use 영상 태그 교체, 영어 가이드에 video 태그 추가. llms-full.txt 재생성.
- 2026-11-16 추가: 쇼츠 3편 공개(q2SRH8RpVBw, Xp5Q_VW2MIo, v2Nb9StmKts), 채널 설명·링크, galaxy-photo-to-pc-transfer.html 상단에 5초 장면 클립(/guide/media/, 0012 rejected 페이지라 측정 충돌 없음), video-campaign.md 5절(일정·측정·중단 기준).
- 개선 1건 원칙 예외: owner 지시(11-16).

## Measure
- GSC: how-to-use.html, 영어 가이드의 "동영상" 검색 노출(검색 결과 유형 = 동영상)과 동영상 색인 보고서. 7일(11-23), 28일(12-14).
- GA: source youtube.com·m.youtube.com, utm_campaign=howto-2611 세션.
- 중단 기준: 12-14까지 유튜브 경유 세션(쇼츠 포함) 20 미만이면 쇼츠 추가 제작을 멈추고 사이트 임베드만 유지.

## Result
- 2026-11-16 배포.
- 2026-11-17 owner 지시("오늘 2편, 본편도 다시")로 같은 intent 안에서 영상 교체(일일 배포 한도 예외): #89·#90·#91 뒤 새 화면으로 다시 찍은 본편 한국어 GuX1jUCkDo0(46초)·영어 tQPI6wA79OA(45초)로 사이트 3페이지·sitemap·llms-full 교체, 옛 본편 C5qcUgtEG1M·-x0xVxSTHlg은 일부 공개. 2편 "방 만들기와 비밀번호 잠금" Oy_-4OHoWdc 공개(사이트 미반영). 판독 일정은 그대로(7일 11-23, 28일 12-14).
