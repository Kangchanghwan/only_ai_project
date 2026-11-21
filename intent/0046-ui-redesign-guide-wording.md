# Intent: 화면 전환(#89) 뒤 가이드에 남은 "텍스트 탭" 문구 정정

Author: growth-operator (agent). Status: accepted (1차 11-18, 2차 11-19, 3차 11-21 배포, 나머지는 판독 뒤). Created: 2026-11-17. Trigger: 정기 (11-16 피드백 "기능 PR 머지 날 옛 문구 검색" 첫 적용)

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
- 2026-11-19 2차 배포 (master 9c11155, Actions auto-merge 성공, 라이브 반영 확인). 판독 중이 아닌 5개 페이지:
  - en/guide/online-clipboard-for-files-and-images (0019 판독 11-17 종료): "Upload File card" → "Choose files below the text box"(본문·HowTo·FAQ JSON-LD 4곳), "Paste card" → "Paste button below the text box"(2곳).
  - guide/ipad-to-windows-photo-transfer: "다운로드 버튼으로 저장하거나, 항목을 눌러 클립보드에 복사" → "'받기' 버튼으로 내려받거나, 사진의 ⋯ 메뉴에서 '이미지 복사'".
  - guide/office-pc-file-transfer-without-messenger, guide/mac-to-windows-file-transfer: → "파일은 '받기' 버튼, 텍스트는 글 오른쪽의 '복사' 버튼".
  - guide/send-link-from-pc-to-phone: "항목을 탭하면 클립보드에 복사" → "글 오른쪽의 복사 버튼(좁은 화면은 겹친 네모 아이콘)" (행 누르기는 펼치기).
  - 근거: 11-19 master ko/en help.receive1·receive3·send2, file.receive '받기'(FileCard.vue 241, 넓은 화면 글자), file.copyImage(⋯ 메뉴, 이미지일 때만), file.chooseFiles, upload.pasteTitle. dateModified·sitemap lastmod 2026-11-19, llms-full.txt 재생성, check-seo 통과.
  - 남은 대상("파일 업로드" 16개 페이지 중 판독 중인 것): 0045 남겨 둔 표의 날짜대로(E2 11-23, 0021·0023·0004 11-27, 0026 11-28, 0027 11-30, 0029 12-01, 0030 12-02, 0031 12-03, 0024 12-04, 0035 12-07, 0036 12-08, 0037 12-09). how-to-use는 E1 11-22 뒤. "공유 범위" 2개(ask-ai 0022 11-27 뒤, how-to-use).
  - 측정: 5개 페이지 7일 노출(네이버·GSC) 유지 여부 11-26.
- 2026-11-20 추가 대상(라이브 확인): send-link-from-pc-to-phone 4단계·HowTo "링크는 그대로 브라우저에서 열 수 있습니다" → 받은 글은 눌리는 링크가 아니다('복사' 후 주소창에 붙여넣기, 긴 글은 '더보기'로 펼침). 같은 페이지 "항목은 공유 후 눌러서 복사", "다른 네트워크면 전체 공유"(→ 방). 판독 중 아님 → 다음 개선 슬롯 1순위 후보.
- 2026-11-21 3차 배포 (master 0c66e5d, Actions auto-merge 성공, 라이브 반영 확인). 2개 페이지:
  - guide/send-link-from-pc-to-phone (11-20 발견): 4단계·HowTo "링크는 그대로 브라우저에서 열 수 있습니다" → "받은 링크는 눌러서 바로 열리는 링크로 표시되지 않으니 폰 브라우저 주소창에 붙여넣어 여세요, 길면 '더보기'로 펼침". 도입부 "탭하면 복사되거나 열립니다" → "'복사'를 눌러 주소창에 붙여넣으면 열립니다". description(4곳) "폰에서 바로 열립니다" → "폰 화면에 바로 나타납니다"(제목은 그대로). "항목은 공유 후 눌러서 복사" → 보내는 쪽 붙여넣기·받는 쪽 '복사'. "다른 네트워크면 전체 공유 탭" → 전체 공유는 쓰지 말고 '＋ 방' → '초대' QR(e2ee 1절 범위 문장). 6단계 '붙여넣기' 버튼 위치(입력 상자 아래 도구 줄, 폰은 클립보드 아이콘).
  - guide/copy-verification-code-phone-to-pc (0042 7일 판독 11-21 뒤): "텍스트 탭" 7곳 → "입력 상자"('여기에 입력하거나 파일을 끌어다 놓으세요'), "📋 붙여넣기" 3곳 → 도구 줄 '붙여넣기' 버튼(폰은 클립보드 아이콘). HowTo step 이름 "입력 상자에 붙여넣고 공유".
  - 근거: 11-21 master PasteSection.vue(`hidden sm:inline` 글자, 좁은 화면 아이콘만, 클릭 시 App.handlePasteContent가 클립보드를 읽어 바로 공유), ko text.showMore '더보기', help.receive1. dateModified·sitemap lastmod 2026-11-21, llms-full.txt 재생성, check-seo 통과. 라이브 grep: 옛 문구 0건.
  - 기준값: send-link GSC 28일(10-22–11-18) 노출 22 / 클릭 1 / 12.9위. copy-verification-code는 0042 Result 참고. 측정: 두 페이지 7일 노출 유지 여부 11-28.
  - 남은 대상: how-to-use(E1 7일 11-22 뒤, "텍스트 탭" 1·"공유 범위"), copy-text-phone-to-pc(0034 28일 12-06 뒤), "파일 업로드" 페이지는 0045 표 날짜대로.
