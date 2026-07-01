# 헤더 QR 코드 배치 변경 설계

## 배경

현재 공유 룸 화면에는 화면 중앙에 떠 있는 배경 워터마크 QR(`BackgroundQR.vue`)이 있다. 평소엔 옅게(opacity 0.18) 보이다가 호버/탭 시 또렷해지는 방식인데, 콘텐츠 위에 항상 걸쳐 있어 사용성이 떨어진다는 피드백을 받았다. 헤더가 없는 현재 레이아웃에 헤더를 새로 추가하고, QR을 헤더의 고정된 위치로 옮긴다.

## 목표

- 화면 중앙을 가리는 배경 QR을 제거한다.
- 헤더 오른쪽에 QR을 상시 노출되는 작은 카드로 배치하고, 클릭하면 확대해서 볼 수 있게 한다.
- 헤더 왼쪽에는 기존처럼 사이트명(로고 + 타이틀)을 둔다.

## 변경 범위

### 1. `frontend/src/components/AppHeader.vue`

- 우측 액션 그룹(`LanguageSelector`, `ThemeToggleButton`, 도움말 버튼) 옆에 QR 카드 버튼을 추가한다.
- QR 카드: 흰 배경의 작은 카드 안에 QR 썸네일 + 2줄 라벨("스캔해서\n입장", 기존 `qr.backgroundHint` 키 문구 재사용)을 가로로 배치한다.
- `useQRCode()`의 `generateQRCodeForUrl(homeUrl)`을 `onMounted`에서 호출해 QR 데이터 URL을 만든다. URL은 `window.location.origin + window.location.pathname` (룸 코드 없는 홈 URL, 기존 `BackgroundQR.vue`와 동일한 로직).
- 카드 버튼 클릭 시 확대 모달(`QRZoomModal.vue`)을 연다.
- 모바일 대응: 기존 헤더의 `flex-wrap` 동작을 그대로 따르며, QR 카드는 작은 크기를 유지한다(별도 반응형 분기 불필요).

### 2. 새 컴포넌트 `frontend/src/components/QRZoomModal.vue`

- props: `qrCodeDataUrl` (String), `isOpen` (Boolean)
- emits: `close`
- 내용: QR 이미지만 크게 표시하는 단순 모달. URL 텍스트, 복사 버튼, 다운로드 버튼 등은 포함하지 않는다.
- 배경 클릭 또는 닫기(×) 버튼으로 닫힘.
- 기존 `QRCodeModal.vue`의 트랜지션(`modal-enter-active` 등 페이드/스케일) 스타일을 동일하게 재사용한다.

### 3. `BackgroundQR.vue` 제거

- `frontend/src/components/RoomScreen.vue`에서 `<BackgroundQR />`과 해당 import를 삭제한다.
- `frontend/src/components/BackgroundQR.vue` 파일을 삭제한다. (다른 사용처 없음 — `RoomScreen.vue`가 유일한 사용처였음을 grep으로 확인함)

### 4. i18n

- 새 i18n 키를 추가하지 않는다. 기존 `qr.backgroundHint` 키를 헤더 QR 카드의 라벨 텍스트 및 버튼 `aria-label`로 그대로 재사용한다.

## 비목표 (Out of scope)

- QR 확대 모달에 URL 복사/다운로드 기능을 추가하지 않는다(필요해지면 추후 별도 작업).
- 룸별 QR(개별 파일 공유용 `FileQRCodeModal`, `MultiFileQRCodeModal`)은 이번 변경과 무관하며 손대지 않는다.
- 레거시 `RoomInfo.vue`/`QRCodeModal.vue`(6자리 룸 코드 기반, 현재 미사용)는 이번 작업 범위가 아니다.

## 테스트 관점

- `AppHeader.vue`에 대한 기존 테스트가 있다면 헤더에 QR 버튼이 추가됐는지, 클릭 시 모달이 열리는지 확인하는 테스트를 추가/갱신한다.
- `RoomScreen.vue` 테스트가 있다면 `BackgroundQR` 관련 어서션을 제거한다.
- `BackgroundQR.test.js`(있다면) 삭제한다.
