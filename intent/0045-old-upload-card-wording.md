# Intent: 가이드의 옛 화면 문구("파일 업로드 카드", "붙여넣기 카드", "Upload File card", "Paste card")를 지금 버튼 이름으로

Author: growth-operator (agent). Status: shipped (2026-11-16, owner 지시 "판독중인 페이지는 제외하고 다른곳은 고쳐주세요"). Created: 2026-11-16.
Trigger: 11-16 주간 리포트 피드백(기능 바뀐 뒤 옛 문장이 가이드에 남음) 검토 중 master 전체 검색에서 66줄 발견.

## Problem
- 지금 보내기 화면은 "파일 선택"(en "Choose files") 버튼 + "붙여넣기"(en "Paste") 버튼이다(FileUploadSection.vue data-testid=choose-files, PasteSection.vue). 잠금 칩 "비밀번호로 잠그기"는 파일 선택 버튼 아래. 창 전체 끌어다 놓기는 WindowDropOverlay.
- 가이드·FAQ·llms-full.txt 다수가 없어진 "카드"를 안내한다. 11-16 0044에서 영어 iPhone→Windows 가이드 한 곳만 고쳤다.

## Change (판독 중이 아닌 페이지만)
- faq.html, guide/galaxy-photo-to-pc-transfer, ipad-to-windows-photo-transfer, iphone-video-to-pc-transfer, office-pc-file-transfer-without-messenger, pc-to-pc-file-transfer-without-usb, phone-video-to-pc-transfer, send-file-with-password, send-link-from-pc-to-phone, windows-to-iphone-file-transfer, en/guide/send-text-from-phone-to-pc: 본문과 JSON-LD 같은 문장에서 "카드" → "버튼", 버튼 이름은 화면 그대로. faq "업로드 카드에 표시된 최대 용량" → "파일 하나에 5GB".
- 제목·설명·URL·dateModified 변경 없음. llms-full.txt 재생성.

## 남겨 둔 곳 (판독 끝난 날 같은 방식으로 고친다)
| 페이지 | 막는 판독 | 고칠 날 |
|---|---|---|
| en/online-clipboard-for-files-and-images | 0019 28일 11-17 | 11-17 판독 뒤 |
| guide/android-mac-airdrop-alternative | 0036 28일 12-08 (0024 12-04) | 12-08 |
| guide/galaxy-to-macbook-photo-transfer | 0037 28일 12-09 | 12-09 |
| en/firefox-send-alternative, en/best-online-clipboards-compared | e2ee E2 7일 11-23 | 11-23 |
| guide/kakaotalk-video-to-pc, guide/same-wifi-file-share | 0021·0023 28일 11-27 | 11-27 |
| en/airdrop-alternative-android-windows-mac | 0026 28일 11-28 (0039) | 11-28 |
| en/online-clipboard-copy-paste-between-devices | 0027 28일 11-30 (0033 동결) | 11-30 |
| en/snapdrop-pairdrop-alternative | 0029 28일 12-01 | 12-01 |
| en/share-clipboard-between-phone-and-pc | 0030 28일 12-02 | 12-02 |
| guide/iphone-to-windows-photo-transfer | 0031 28일 12-03 | 12-03 |
| guide/airdrop-not-working-iphone-mac, guide/iphone-galaxy-photo-transfer, guide/large-file-transfer-free-no-signup, en/send-large-files-free-no-sign-up | 0024 12-04 | 12-04 |
| guide/copy-text-phone-to-pc | 0034 28일 12-06 | 12-06 |
| guide/pc-bang-file-transfer | 0035 28일 12-07 | 12-07 |
| how-to-use.html | 0038 12-09, 0044 12-14 | 12-14 |

## Measure
본문 낱말 수정이라 검색 지표 판독 대상이 아니다(0040과 같음). 확인: 라이브에서 고친 11개 페이지에 옛 문구 0건.
