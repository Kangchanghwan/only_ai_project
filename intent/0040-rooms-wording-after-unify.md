# Intent: 방 통합(#76) 뒤 공개 안내 문서의 "1:1" 버튼·방 서술을 지금 화면 문구로 고치기

Author: growth-operator (agent). Status: shipped (2026-11-13). Created: 2026-11-13.
Trigger: bands.mjs 최고 등급 diagnose(gsc_impr7, 0033 진단 계속)라 propose 없음. owner가 11-12에 PR #76(1:1 방과 그룹 방을 하나의 "방"으로 합치기)을 master에 머지했고 라이브 번들(assets/index-*.js)에 "방으로 연결"/"Connect in a room"이 들어간 것을 11-13 확인. 공개 안내 문서가 사라진 버튼 이름("1:1", "Connect 1:1")을 가리키고 있어 사실 수정이 새 소재보다 먼저다.

## Problem
- 설계서 docs/superpowers/specs/2026-11-12-unify-rooms-design.md 4절: 화면 문구에서 "1:1"을 없앴다. 기기 행 버튼 ko "방으로 연결"(좁은 화면 "연결"), en "Connect in a room". 1:1로 만든 방도 이제 초대 가능한 방이라 QR·링크로 다른 기기를 들일 수 있다(초대 QR 10분, i18n group.inviteExpiry).
- 공개 문서에 "1:1" 서술 22곳(llms.txt 4, how-to-use 2, guide/index 1, ask-ai ko 2·en 2, same-wifi-file-share 6, en guide index 1, firefox-send 1, best-online-clipboards 3). same-wifi-file-share FAQ "공인 IP가 다르면 기기 목록에서 1:1 연결"은 원래도 맞지 않았다(다른 IP 기기는 목록에 안 보임 → 방을 만들어 초대가 맞는 경로, i18n group.emptyCta).

## Change
- 위 파일들의 버튼 이름을 화면 그대로("방으로 연결", "Connect in a room")로, "1:1 방"을 "기기끼리 만든 방"/"private room"으로. how-to-use 방 절에 초대(QR·링크, QR 10분) 1문장, same-wifi FAQ 2개(본문+JSON-LD 같은 문장)는 "방을 만들어 QR이나 링크로 초대". llms-full.txt 재생성. ops/playbooks/ai-visibility.md 공통 사실 문장도 "기기끼리 만든 방은 자동 암호화"로.
- 그대로 둔 곳: guide/clipboard-share-video.html(녹화 영상 속 옛 화면을 설명하는 장면 표), en/guide/airdrop-alternative-android-windows-mac.html 비교표 1칸(intent 0039 7일 판독 11-19와 섞이지 않게, 판독 뒤 손질).

## Constraints
제목·메타 설명·URL 변경 없음. 암호화 규격·연결 절차(수락 → 그림 4개 확인)는 바뀌지 않았으므로 그 서술은 유지. 인원 상한 숫자는 환경변수라 쓰지 않음.

## Measure
본문 낱말 수정이라 검색 지표 판독 대상이 아니다(사실 정확도 작업). 같은 페이지의 다른 판독(0015 firefox-send, 0022 ask-ai, 0025 best-online-clipboards, how-to-use 0038)에는 "11-13 방 문구 수정 포함"으로 표시만 한다. 확인: 라이브에서 "1:1" 검색 결과가 위 두 파일만 남는지.

## Result
- 2026-11-13 배포 예정 (auto/20261113-rooms-wording).
