# Intent: 화면 전환(#89) 뒤 가이드에 남은 "텍스트 탭" 문구 정정

Author: growth-operator (agent). Status: proposed. Created: 2026-11-17. Trigger: 정기 (11-16 피드백 "기능 PR 머지 날 옛 문구 검색" 첫 적용)

## Problem
owner가 11-17 07:04 화면을 바꿨다(#89: 파일·텍스트 한 목록, 통합 입력 상자 "여기에 입력하거나 파일을 끌어다 놓으세요", 방을 늘 보이는 탭으로; #90 혼자일 때 QR 안내).
en.json 비교(d29a819 → 1828c67): 삭제 12키 중 화면 문구에 걸리는 것 room.filesTab("Files"), text.composePlaceholder, text.receivedText, pair.tab("Room"), pair.hint. 추가 send.placeholder 등 9키.
그래서 "텍스트 탭"을 안내하는 공개 페이지 8개가 지금 화면과 다르다(11-17 grep):
guide/ask-ai-to-send-to-phone, guide/clipboard-share-video, guide/copy-verification-code-phone-to-pc(0042 7일 판독 11-21), guide/send-file-by-qr-code, guide/copy-text-phone-to-pc(0034 28일 12-06), guide/send-file-with-password, how-to-use(e2ee E1 7일 11-22), en/guide/ask-ai-to-send-text-to-your-phone.
또 네이버 E-N1 캡처 중 라이브 확인: 버튼은 "＋방"(붙여 씀), 방을 만들면 초대 창이 바로 뜨고 첫 탭은 QR, 방 나가기에 확인 창이 있다(how-to-use 방 절에 없음).

## Proposed outcome
가이드 안내가 지금 버튼 이름·위치와 같아져, 따라 하다 막히는 일이 없다(측정: 정정 대상 페이지 7일 노출 유지, 문구 grep 0).

## Change
frontend/public 가이드 문구만(자동 머지 경로). 판독 중 페이지(0042, 0034, E1 how-to-use)는 판독일 뒤로 미루고 나머지 먼저(0045 방식). 지난 대본·영상 페이지(clipboard-share-video)는 영상 화면을 설명하는 문장이면 그대로 둔다.

## Constraints
하루 개선 1건. 판독 중 페이지 문구는 판독 뒤.

## Measure
grep "텍스트 탭|Text tab" 0(판독 끝난 페이지 기준). 페이지별 7일 노출이 정정 전과 비슷하게 유지.

## Result
