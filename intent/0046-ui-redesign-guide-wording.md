# Intent: 화면 전환(#89) 뒤 가이드에 남은 "텍스트 탭" 문구 정정

Author: growth-operator (agent). Status: accepted (1차 배포 2026-11-18, 나머지는 판독 뒤). Created: 2026-11-17. Trigger: 정기 (11-16 피드백 "기능 PR 머지 날 옛 문구 검색" 첫 적용)

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
- 2026-11-18 1차 배포 (master c65202a, Actions auto-merge 성공, 라이브 반영 확인). 4개 페이지: guide/ask-ai-to-send-to-phone, en/guide/ask-ai-to-send-text-to-your-phone, guide/send-file-with-password, guide/send-file-by-qr-code + llms-full.txt 재생성. clipboard-share-video는 grep 결과 "텍스트 탭" 문구가 없어 대상에서 뺐다.
  - 바꾼 것: "텍스트 탭의 입력란" → "목록 위 입력 상자('여기에 입력하거나 파일을 끌어다 놓으세요')", "텍스트 탭의 목록에서 항목을 탭하면 복사" → "글 오른쪽의 복사 버튼(좁은 화면은 겹친 네모 아이콘)". 근거: 11-18 master TextShareBox.vue(placeholder send.placeholder, 보내기 버튼 file.share '공유', 링크 안내 text.prefillNote), TextItemRow.vue(행 클릭은 펼치기, 복사는 text-copy 버튼). dateModified 2026-11-18.
  - 남은 대상: copy-verification-code-phone-to-pc(0042 7일 판독 11-21 뒤), how-to-use(E1 7일 11-22 뒤), copy-text-phone-to-pc(0034 28일 12-06 뒤). 남은 grep 수: 각 8·1·5.
  - 측정: 4개 페이지 7일 노출(네이버·GSC)이 정정 전과 비슷한지 11-25에 확인.
- 2026-11-18 추가 점검(11-16 피드백 절차: 머지된 화면 PR의 사라진 ko/en 키 값을 공개 페이지에서 grep, fd52926 → 1ad543b): **"파일 업로드" 카드/버튼(file.upload·file.uploadTitle 삭제, 지금은 입력 상자의 '파일 선택'/en 'Choose files')을 누르라는 안내가 17개 페이지**(`<strong>파일 업로드</strong>`·`<strong>Upload File</strong>` 기준, 한국어 상위 유입 가이드 포함). "클립보드에 복사"(file.copyToClipboard 삭제) 6개 페이지, "공유 범위"(help.scopeTitle) 2개. 텍스트 탭보다 범위가 커서 2차로 묶는다: 판독 중이 아닌 페이지부터 하루 1건(여러 페이지 한 번에), 버튼 이름은 라이브 화면과 대조.

- 2026-11-18 (owner 대화 세션): send-file-with-password의 "파일 선택 버튼 아래 \"비밀번호로 잠그기\"" → "입력 상자 아래 도구 줄(파일 선택·붙여넣기 옆)의 \"비밀번호로 잠그기\"" (11-17 #89로 잠금 칩이 통합 보내기 상자 도구 줄로 옮겨짐, TextShareBox.vue LockChip). 0045에서 고친 문장이 화면 전환으로 다시 틀린 경우.
