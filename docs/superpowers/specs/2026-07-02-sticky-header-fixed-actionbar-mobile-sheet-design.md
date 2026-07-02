# 스티키 헤더 + 하단 고정 액션바 + 모바일 파일 액션 시트 설계

## 배경

룸 화면([RoomScreen.vue](../../../frontend/src/components/RoomScreen.vue))에서 세 가지 사용성 문제가 제기됐다:

1. [AppHeader.vue](../../../frontend/src/components/AppHeader.vue)의 "스캔해서 같은 공간 열기" QR 칩을 포함한 헤더 전체가 일반 문서 흐름 안에 있어, 스크롤하면 화면 밖으로 사라진다. 다른 기기와 룸을 공유하려면 다시 맨 위로 스크롤해야 한다.
2. [DownloadControls.vue](../../../frontend/src/components/DownloadControls.vue)(전체 선택/다운로드/QR 코드/선택 삭제/저장소 초기화)는 `flex-wrap` 버튼 그룹으로 파일 리스트 위에 위치해, 리스트를 스크롤하면 같이 스크롤되어 사라지고, 좁은 화면에서는 줄바꿈되어 정렬이 흐트러진다.
3. [FileCard.vue](../../../frontend/src/components/FileCard.vue)의 파일 행 액션 버튼(공유/QR/다운로드/삭제)이 모바일에서 `w-7 h-7`(28px)로 터치하기엔 작다.

## 범위

- `AppHeader.vue`: `<header>`를 스크롤 시 상단에 고정.
- `DownloadControls.vue`: 레이아웃을 `flex-wrap` 버튼 그룹 → 화면 하단에 고정된 5열 그리드 바로 전환.
- `FileCard.vue`: `sm` 미만(모바일)에서 개별 아이콘 버튼 행을 "⋯" 버튼 하나로 교체하고, 탭하면 액션 목록을 담은 하단 시트를 연다. `sm` 이상(태블릿/데스크톱)은 기존 아이콘 버튼 행 그대로 유지.
- `RoomScreen.vue`: 파일이 있을 때 하단 고정 바에 콘텐츠가 가리지 않도록 페이지 하단 여백 추가.
- `DESIGN.md` Layout 섹션 갱신 + Decisions Log 추가.
- **범위 밖**: `DownloadControls.vue`/`FileCard.vue`의 버튼 동작·이벤트·핸들러 로직 변경(위치·레이아웃만 변경, 기능은 100% 동일), i18n 라벨 문구 변경(기존 키 그대로 재사용 — 텍스트 축약이 아니라 폰트 크기만 축소), `AppFooter.vue` 내부 변경, 파일 카드 QR 모달([FileQRCodeModal.vue](../../../frontend/src/components/FileQRCodeModal.vue)) 자체 디자인 변경.

## UI/배치 설계

### 1. 스티키 상단 헤더 (`AppHeader.vue`)

- `<header>` 엘리먼트에 `sticky top-0 z-40 bg-background border-b border-transparent` 추가. 스크롤 여부와 무관하게 `border-b`는 항상 옅게 유지(스크롤 감지 로직 없이 CSS만으로 처리 — 상단에 있을 때도 옅은 구분선이 보이는 것은 허용 가능한 트레이드오프).
- 현재 `<header>`는 `mb-8`만 있고 자체 padding이 없다. 고정 시에도 좌우는 부모 `max-w-[1600px] mx-auto p-6`의 padding을 그대로 물려받으므로 별도 처리 불필요. 다만 sticky 상태에서 콘텐츠가 상단 바로 아래에 바짝 붙지 않도록 `py-3` 정도의 자체 padding을 추가하고 `mb-8`은 유지(고정 여부와 무관하게 헤더와 다음 요소 사이 간격 유지).
- 로고/타이틀/ConnectedDevices/언어·테마 토글/도움말/QR 칩 등 헤더 내부 구성은 변경하지 않는다 — "스캔해서 같은 공간 열기" QR 칩만 별도로 떼어내지 않고 헤더 전체를 하나의 고정 바로 취급한다(사용자 요청의 "이 부분 header로"는 QR 칩이 포함된 헤더 자체를 고정 헤더로 보라는 의미로 해석).
- 다크모드: `bg-background`가 이미 다크 팔레트 대응 CSS 변수이므로 별도 처리 불필요.

### 2. 하단 고정 액션바 (`DownloadControls.vue`)

- 루트 `<div>`를 `fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border`로 전환하고, iOS 홈 인디케이터 겹침 방지를 위해 `pb-[env(safe-area-inset-bottom)]` 추가.
- 내부 레이아웃을 `flex flex-wrap` → `grid grid-cols-5`로 변경. 5개 항목(전체 선택/다운로드/QR 코드/선택 삭제/저장소 초기화)이 항상 균등 폭 열로 배치되어 폭에 관계없이 가로 스크롤이 생기지 않는다.
- 각 열(버튼)의 내부 구조: 아이콘(기존 이모지 그대로, `text-base`) 위, 그 아래 라벨(기존 i18n 텍스트 그대로, `text-[11px] leading-tight text-center`, 2줄 wrap 허용)과 카운트(기존과 동일하게 괄호 표기, 같은 라인 또는 그 아래 한 줄 더). 즉 **텍스트 내용은 바꾸지 않고 폰트 크기만 축소**해 5열 그리드 안에 들어가게 한다.
- 색상 구분(파랑/초록/보라/빨강/회색)은 배경색 풀칠 대신 아이콘·텍스트 색상으로 축소(`text-blue-600` 등) — 5개 버튼이 나란히 있는 좁은 열에서 배경색 블록이 부담스럽지 않도록. 선택된 상태가 없는 단순 액션 버튼이므로 hover/active는 `bg-black/5`(라이트)/`bg-white/5`(다크) 정도의 옅은 배경만 추가.
- `disabled` 상태(카운트 0 등)는 기존과 동일한 조건 유지, 텍스트/아이콘 `opacity-40`으로 표시.
- `RoomScreen.vue`: `files.length > 0`일 때 루트 컨테이너(또는 `<main>`)에 하단 padding(예: `pb-20`, 실제 값은 구현 시 바 실측 높이에 맞춰 조정)을 추가해 하단 고정 바가 마지막 파일 행이나 `AppFooter`를 가리지 않도록 한다.
- 모바일 파일/텍스트 탭 전환 시 동작: `DownloadControls`는 `FileGallery.vue` → `FileCard`가 속한 `<section>`의 자손이므로, 해당 섹션에 `hidden` 클래스가 걸리면(텍스트 탭 활성 시) `fixed` 엘리먼트라도 함께 사라진다(조상에 `display:none`이 걸리면 후손의 `position:fixed`도 렌더링되지 않음) — 별도 처리 없이 기존 `hidden`/`md:block` 토글 로직만으로 올바르게 동작.

### 3. 모바일 파일 액션 시트 (`FileCard.vue`)

- 기존 아이콘 버튼 그룹(`<div class="flex gap-1 sm:gap-2 ...">`)의 클래스를 `hidden sm:flex`로 변경 — `sm`(640px) 이상에서만 기존 아이콘 버튼 행 노출, 그 아래 기존 버튼 마크업·핸들러(`handleShare`/`openQRModal`/`handleDownload`/`handleDelete`)는 전혀 수정하지 않는다.
- 같은 위치에 `sm` 미만에서만 보이는 트리거 버튼 추가: `<button class="flex sm:hidden w-9 h-9 ...">⋯</button>` (터치 영역 36px, 아이콘 버튼보다 큼), `aria-label`은 새 i18n 키 `file.moreActions`("더 보기") 하나만 21개 로케일 파일에 추가.
- 클릭 시 `isActionsSheetOpen = true`로 로컬 state 토글, `Teleport to="body"`로 하단 슬라이드업 시트를 렌더링:
  - 구조는 [FileQRCodeModal.vue](../../../frontend/src/components/FileQRCodeModal.vue)와 동일한 백드롭 패턴(`fixed inset-0 bg-black/70`, 배경 클릭 시 닫힘) 재사용, 다만 패널은 화면 중앙이 아니라 `fixed inset-x-0 bottom-0 rounded-t-2xl`로 하단에서 슬라이드업.
  - 목록 항목(각 `min-h-[48px]`, `flex items-center gap-3 px-4`): 공유(`v-if="canShare"`, 기존 SVG 아이콘 재사용) / QR 코드 / 다운로드 / 삭제(`text-red-500`). 각 항목 클릭 시 기존 핸들러(`handleShare`/`openQRModal`/`handleDownload`/`handleDelete`)를 호출한 뒤 `isActionsSheetOpen = false`로 시트를 닫는다.
  - `z-50`(기존 `FileQRCodeModal`과 동일한 z-index 관례) — 하단 고정 액션바(`z-40`)보다 위에 그려져야 하므로.
- `DESIGN.md:48`의 "always-visible action buttons (no hover-only reveal)" 원칙과 모바일에서 충돌하는 의도적 예외 — DESIGN.md Decisions Log에 사유를 기록한다(아래 참조).

## 컴포넌트별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `AppHeader.vue` | `<header>`에 `sticky top-0 z-40 bg-background border-b border-border py-3` 추가. 내부 마크업 변경 없음. |
| `DownloadControls.vue` | 루트 컨테이너를 `fixed bottom-0` 5열 그리드 바로 전환. 버튼 이벤트·props·emit은 동일하게 유지, 표시(아이콘/라벨/카운트) 마크업과 크기만 축소. |
| `FileCard.vue` | 기존 액션 버튼 행에 `hidden sm:flex` 추가, `sm` 미만 전용 "⋯" 트리거 + 하단 시트(Teleport) 신규 추가. 기존 핸들러 로직 재사용, 새 로직은 시트 open/close state뿐. |
| `RoomScreen.vue` | 파일이 있을 때 하단 고정 바 높이만큼 페이지 하단 padding 추가. |
| `DESIGN.md` | Layout 섹션에 헤더/하단바 고정 동작 설명 추가, Decisions Log에 모바일 액션 시트 예외 기록. |
| `i18n/locales/*.json` (21개) | `file.moreActions` 키 1개 추가(더 보기 버튼 aria-label). |

## DESIGN.md 갱신 내용

- `## Layout`에 문장 추가:
  > Header sticks to the top of the viewport on scroll (`sticky top-0`), and the file-list action bar (select-all/download/QR/delete/reset) sticks to the bottom of the viewport as an evenly-spaced 5-column bar, always visible while any file-list view is active. On mobile (`<sm`), per-file row actions collapse behind a single "⋯" trigger that opens a bottom action sheet, instead of the row's inline icon buttons.
- Decisions Log에 행 추가:
  | 2026-07-02 | 모바일 파일 행 액션을 아이콘 버튼 4개 상시 노출 대신 "⋯" 트리거 + 하단 시트로 전환 | 28px 아이콘 버튼이 좁은 화면에서 터치하기 부담스럽다는 사용자 피드백 — `sm` 이상에서는 기존 상시 노출 버튼 유지, 모바일에서만 예외적으로 축소 |

## 테스트 계획

### 프론트엔드
- `AppHeader.test.js`: 기존 테스트가 특정 위치 스타일(비고정)에 의존하지 않는지 확인, 필요 시 `sticky`/`z-40` 클래스 존재 여부 스냅샷만 추가.
- `FileGallery.test.js` / `FileCard`(전용 테스트 없음, 기존 관례 유지): `DownloadControls`가 `fixed` 클래스를 받는지, 모바일 텍스트 탭 전환 시 `hidden` 조상 아래에서 사라지는지 로직 자체는 CSS 의존이라 유닛 테스트로는 클래스 존재만 검증.
- 신규 "⋯" 트리거 클릭 → 시트 오픈 → 각 액션 클릭 시 대응 이벤트(`download-file`/`delete-file`/QR 모달 오픈) emit 여부를 테스트로 추가할지는 구현 시 `FileCard.vue` 전용 테스트 파일 신설 여부와 함께 판단(현재 전용 테스트 없음 — 이번 스펙에서 신설을 강제하지 않음).
- `i18n.test.js`: 신규 키 `file.moreActions`가 21개 로케일 모두에 존재하는지 확인하는 기존 검증 루틴에 자동 포함.

### 수동 QA
- 데스크톱: 스크롤 시 헤더 고정 확인(로고~QR 칩까지 전체), 하단 액션바 고정 및 각 버튼 동작(전체선택/다운로드/QR/삭제/초기화) 동일하게 작동하는지, `AppFooter`가 하단바에 가려지지 않는지.
- 모바일 폭(≤639px): 파일 행 "⋯" 버튼 → 시트 오픈 → 공유(지원 기기)/QR/다운로드/삭제 각 동작, 시트 배경 클릭 시 닫힘. 하단 액션바 5열이 가로 스크롤 없이 한 화면에 들어오는지, 라벨 2줄 wrap 시 잘림 없는지. "파일"/"텍스트" 탭 전환 시 하단 액션바가 텍스트 탭에서 사라지는지.
- 다크모드: 고정 헤더/하단바 배경·테두리 대비, 시트 배경·텍스트 대비 확인.

## 오픈 이슈 / 명시적으로 다루지 않는 것

- 하단 고정 바의 정확한 높이(px)와 그에 맞춘 페이지 하단 padding 값은 스펙에서 고정하지 않는다 — 구현 시 실제 렌더링 결과를 보고 조정.
- 헤더가 고정된 상태에서 스크롤 방향에 따라 숨김/재노출(예: 아래로 스크롤 시 숨기고 위로 스크롤 시 재노출)하는 스마트 헤더 패턴은 다루지 않는다 — 항상 고정 노출만 구현.
- 데스크톱에서 하단 고정 바가 화면을 항상 차지하는 것에 대한 대안(예: 파일 리스트에 포커스가 있을 때만 노출)은 다루지 않는다 — 사용자가 "늘 항상" 고정을 명시적으로 요청했으므로 항상 노출로 확정.
