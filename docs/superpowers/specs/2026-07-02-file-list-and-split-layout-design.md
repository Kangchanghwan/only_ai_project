# 파일 리스트 뷰 전환 + 좌 파일 / 우 텍스트 분할 레이아웃 설계

## 배경

현재 [FileGallery.vue](../../../frontend/src/components/FileGallery.vue)는 [FileCard.vue](../../../frontend/src/components/FileCard.vue)를 `grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`로 배치하는 카드 그리드다. [RoomScreen.vue](../../../frontend/src/components/RoomScreen.vue)는 이 파일 갤러리를 `<main>` 위쪽에, [TextShareBox.vue](../../../frontend/src/components/TextShareBox.vue)를 `mt-8`로 그 아래에 배치해 파일↔텍스트가 상하 구조다.

사용자가 참고 이미지(모바일 클라우드 스토리지 앱의 리스트 UI)를 제시하며 다음을 요청했다:
1. 파일 그리드 → 리스트 형식으로 전환
2. 파일↔텍스트 상하 배치 → 좌(파일)/우(텍스트) 배치로 전환

브레인스토밍 과정에서 비주얼 목업으로 확정한 사항:
- 레이아웃 분할: 데스크톱은 좌(파일) 60% / 우(텍스트) 40%, 모바일은 세로 스택 대신 "파일/텍스트" 탭 전환.
- 리스트 행 스타일: 파일명과 용량·시간을 두 줄로 나눈 구성(참고 이미지에 가장 가까움).
- 이미지 파일은 컬러 아이콘 대신 실제 썸네일을 리스트 행에 표시.
- 업로드/붙여넣기 드롭존은 리스트 안에 섞지 않고 리스트 위 독립 영역으로 유지.

[DESIGN.md:47-48](../../../DESIGN.md)에는 현재 "피드는 그리드 3열(데스크톱)/1-2열(모바일)"로 명시돼 있어, 이번 변경과 충돌한다 — 이 문서도 함께 갱신한다.

## 범위

- `FileGallery.vue`: 내부 그리드를 리스트(세로 스택)로 전환. `FileUploadSection`/`PasteSection`은 리스트 밖 상단으로 분리.
- `FileCard.vue`: 카드형 마크업을 리스트 행(row) 마크업으로 재작성. 기존 기능(체크박스 다중선택, 공유/QR/다운로드/삭제 버튼, 파일명 마퀴, 랜딩 애니메이션) 전부 유지.
- `RoomScreen.vue`: `<main>` 내부를 좌(파일)/우(텍스트) 2컬럼 flex 레이아웃으로 변경. 모바일 폭에서는 탭 전환 UI 추가(새 로컬 상태).
- `DESIGN.md`의 Layout 섹션 및 Decisions Log 갱신.
- **범위 밖**: `TextShareBox.vue` 내부 아이템 마크업 변경(이미 리스트형이라 폭만 좁아짐, 내용 변경 없음), `ShareScopeTabs`/`DownloadControls`의 기능 로직 변경(배치 위치만 유지), 이미지 썸네일 lazy-loading 전략 변경(기존 `loading="lazy"` 그대로 재사용), 백엔드 변경 없음.

## UI/배치 설계

### 데스크톱 (`md` 이상)

```html
<main class="bg-surface rounded-xl p-8 border border-border">
  <div class="flex flex-col md:flex-row gap-8">
    <section class="md:w-[60%]">
      <!-- 업로드/붙여넣기 드롭존 (기존 FileUploadSection/PasteSection, 2열 유지) -->
      <!-- DownloadControls -->
      <!-- 파일 리스트 -->
    </section>
    <section class="md:w-[40%]">
      <!-- TextShareBox -->
    </section>
  </div>
</main>
```

- 좌측 컬럼 폭 60%, 우측 40% — `md:w-[60%]`/`md:w-[40%]` (Tailwind 임의값, DESIGN.md의 max-content-width 1040px 안에서 좌 ~600px/우 ~400px 수준).
- 두 컬럼 사이 gap은 `lg`(24px, DESIGN.md spacing 스케일) 이상 확보 — `gap-8`(32px)로 xl 단위 사용, 시각적으로 명확히 분리.
- 우측 컬럼(`TextShareBox`)은 기존처럼 자체 `max-h-[400px] overflow-y-auto` 내부 스크롤 유지. 좌측 컬럼은 페이지 전체 스크롤을 따름(기존과 동일).
- 이 너비에서는 모바일 탭 버튼(`파일`/`텍스트`) 자체를 렌더링하지 않음(`md:hidden`) — 데스크톱은 항상 두 컬럼 동시 노출.

### 모바일 (`md` 미만)

- `<main>` 상단에 세그먼트 탭 2개 추가: `파일 (N)` / `텍스트 (N)` (N은 각각 `files.length`/`texts.length`).
  - 스타일은 기존 `ShareScopeTabs.vue`의 pill 세그먼트 패턴 재사용(`rounded-full`, `border border-border`, `bg-surface`, 활성 탭 `bg-primary text-white`) — 단, 이 탭은 scope 색상 구분이 필요 없으므로 항상 coral(primary) 하나만 사용.
  - 로컬 상태 `mobilePanel = ref('files')` (컴포넌트 내부, 상위로 전달할 필요 없음 — 서버 상태나 URL과 무관한 순수 뷰 전환).
  - `mobilePanel === 'files'`일 때 좌측 섹션에 `block md:block`, 우측 섹션에 `hidden md:block`. 반대는 그 반대.
  - 기본값은 `'files'`.
- `md` 이상에서는 이 탭 바 자체가 `md:hidden`으로 숨겨지고, 두 섹션 모두 `md:block`이 강제 적용되어 항상 둘 다 보임.

### 파일 리스트 행 (`FileCard.vue` 재작성)

한 행 구조 (좌→우):
1. 선택 체크박스 (기존 기능 그대로, `w-5 h-5 accent-primary`)
2. 아이콘/썸네일 40px 정사각형, `rounded-md`(8px):
   - 이미지 파일(`fileMetadata.isImage`): `<img>` 썸네일 (`object-cover`, 기존과 동일하게 `loading="lazy"`, `file.url` 재사용).
   - 그 외: 기존 `getFileIcon` 이모지를 컬러 배경 원형/라운드 박스 안에 표시(`bg-primary/10`, `text-primary`).
3. 파일 정보 (`flex-1 min-w-0`):
   - 1번째 줄: 파일명 — 기존 마퀴 오버플로 애니메이션(`.file-name` 관련 CSS) 로직 그대로 이식, 다만 카드 하단 오버레이가 아닌 행 안에서 동작하도록 컨테이너만 변경.
   - 2번째 줄: `{{ size }} · {{ uploadTime }}` (`text-xs text-text-secondary`).
4. 액션 버튼 그룹 (`flex gap-2 ml-auto flex-shrink-0`): 공유(Web Share API 지원 시만)/QR/다운로드/삭제 — 기존 4개 버튼 마크업·핸들러(`handleShare`/`openQRModal`/`handleDownload`/`handleDelete`) 그대로 재사용, 배치만 오버레이 → 인라인으로 변경. **호버 시에만 노출하지 않고 항상 노출**(현재도 이미 항상 노출 상태이므로 변경 없음 — 모바일에 호버가 없어 항상 노출이 유지되어야 함을 재확인).
5. 선택 상태(`isSelected`) 시각화: 기존 `border-primary border-[3px]` 대신 행 배경을 `bg-primary/5` + 좌측 `border-l-4 border-primary`로 표시(리스트 행에서 3px 전체 테두리는 다른 행과 정렬이 어긋나 보이므로).
6. 행 컨테이너: `flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-primary/50 transition-all duration-200` — DESIGN.md의 `md` 반경(14px에 가까운 `rounded-lg`=8px는 카드보다 작은 컴포넌트이므로 8px 유지), 카드처럼 `hover:-translate-y-1`(공중에 뜨는 효과)은 리스트에서는 부자연스러우므로 제거하고 테두리 강조로 대체.
- 랜딩 애니메이션(`FileGallery.vue`의 `TransitionGroup` + `card-land` 클래스, `createEnterStagger`)은 그대로 유지 — 리스트 행 단위로 동일하게 stagger 적용.

### 업로드/붙여넣기 드롭존

- `FileGallery.vue`에서 그리드 밖으로 분리, 리스트 최상단에 별도 `flex flex-col sm:flex-row gap-4` 컨테이너로 배치(현재 두 카드가 `220px` 그리드 셀 크기였던 것과 달리, 컬럼 폭(60%)에 맞춰 유동 폭으로 나란히 배치).
- `FileUploadSection.vue`/`PasteSection.vue` 내부 마크업(오버레이, 드래그앤드롭, scope pill 등)은 변경하지 않는다 — 배치 컨테이너만 변경.

## 컴포넌트별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `FileGallery.vue` | 그리드 컨테이너 제거 → 세로 리스트(`space-y-2` 또는 `divide-y`) 컨테이너로 교체. 드롭존을 별도 flex row로 분리. `TransitionGroup`은 리스트에 유지. |
| `FileCard.vue` | 카드 마크업 전체를 리스트 행 마크업으로 재작성. `script setup`의 로직(computed, 핸들러, QR 모달)은 거의 그대로 유지. |
| `RoomScreen.vue` | `<main>` 내부에 좌/우 2컬럼 flex + 모바일 탭 상태(`mobilePanel`) 추가. |
| `DESIGN.md` | Layout 섹션의 그리드 설명을 리스트+분할 레이아웃 설명으로 교체, Decisions Log에 항목 추가. |

## DESIGN.md 갱신 내용

- `## Layout`의 "Grid: feed cards in a 3-column grid..." 문장을 다음으로 교체:
  > Feed: file list is a single-column row list (not a card grid) — icon/thumbnail + two-line name/meta + always-visible action buttons per row. On desktop (`md`+), file list and text feed sit side-by-side (60/40 split); below `md`, a two-tab switcher ("파일"/"텍스트") replaces the split, defaulting to the file tab.
- Decisions Log에 행 추가:
  | 2026-07-02 | 파일 피드를 카드 그리드에서 리스트로, 파일/텍스트를 상하에서 좌우 분할로 변경 | 참고 이미지(리스트형 파일 관리 UI) 기반 사용자 요청 — 리스트가 스캔성이 높고, 좌우 분할이 텍스트 공유를 파일과 동등한 1차 콘텐츠로 격상시킴 |

## 테스트 계획

### 프론트엔드
- `FileGallery.test.js`: 기존 스텁 기반 테스트는 그리드 클래스에 의존하지 않으므로 대부분 그대로 통과할 것으로 예상. 드롭존이 리스트 밖 별도 컨테이너로 이동한 것을 반영해 DOM 순서 관련 스냅샷/셀렉터가 있다면 갱신.
- `RoomScreen.test.js`: 좌/우 컬럼 렌더링 확인 케이스 추가. 모바일 탭 전환(`mobilePanel` 상태 변경 시 `hidden`/`block` 클래스 토글) 케이스 신규 추가.
- `FileCard.vue`는 현재 전용 테스트 파일이 없음 — 이번 작업에서 새로 만들지는 않는다(범위 밖, 기존 관례 유지). 다만 `FileGallery.test.js`의 실제 파일 렌더링 경로(스텁이 아닌 케이스가 있다면) 깨지지 않는지 확인.

### 수동 QA
- 데스크톱 폭: 파일 리스트 행 클릭(이미지 복사), 체크박스 다중 선택 + Ctrl+C, 공유/QR/다운로드/삭제 버튼, 이미지 썸네일 vs 비이미지 아이콘, 파일명 긴 경우 마퀴 동작, 랜딩 애니메이션.
- 모바일 폭: 탭 전환 동작, 탭 전환 후 스크롤 위치, 드롭존 반응형 배치.
- 다크모드: 리스트 행 배경/테두리/선택 상태 대비 확인(DESIGN.md 다크 팔레트).

## 오픈 이슈 / 명시적으로 다루지 않는 것

- 리스트 행에서 파일명 마퀴 애니메이션의 트리거 영역(현재는 카드 전체 `:hover`)을 행 전체로 유지할지 파일명 텍스트 영역으로 좁힐지는 구현 시 시각적으로 판단 — 기존과 동일하게 행 전체 hover로 시작.
- 매우 많은 파일(수백 개)이 있을 때 리스트의 가상 스크롤(virtualization) 필요 여부는 이번 스펙에서 다루지 않음(기존 그리드도 동일한 이슈를 안고 있었고, 이번 변경으로 악화되지 않음).
- 모바일 탭 상태를 URL 해시나 localStorage에 영속화할지 여부는 다루지 않음 — 항상 `파일` 탭으로 시작.
