# 모바일 Share Sheet 공유 확인 시트 설계

## 배경

`DESIGN.md`의 "Open Design Question(deferred)" 항목: 모바일 OS "share to app" 흐름(Web Share Target API — [`frontend/public/manifest.json`](../../../frontend/public/manifest.json)의 `share_target`, [`frontend/public/sw.js`](../../../frontend/public/sw.js), [`useShareScope.js`](../../../frontend/src/composables/useShareScope.js))이 확인 절차 없이 마지막으로 선택된 scope(`ip`/`global`)로 자동 업로드/텍스트 공유를 실행한다. `global`은 `localStorage`에 sticky하게 남기 때문에, 다른 앱에서 공유한 콘텐츠가 사용자가 인지하지 못한 사이 ClipboardApp의 전체 사용자에게 broadcast될 수 있다.

이번 세션에서 이 흐름에 확인 시트를 추가하기로 하고, 트리거 조건·기본값·시각 디자인·설정 연동 범위를 논의해 아래와 같이 확정했다.

## 범위

- Web Share Target 진입(`?share-target=1` → [`App.vue`](../../../frontend/src/App.vue)의 `handleShareTargetData()`) 흐름에만 확인 시트를 추가한다.
- **범위 밖**: 드래그앤드롭 업로드, 붙여넣기(paste), 텍스트 공유 등 앱 내 일반 공유 흐름은 변경하지 않는다 — 이들은 이미 상단 `ShareScopeTabs`로 scope를 명시적으로 보고 있는 상태에서 발생하므로 대상이 아니다.
- 확인 시트에서 고른 scope는 이번 공유 1회에만 적용하고, 앱의 저장된 기본 scope(`localStorage`, 상단 탭)는 변경하지 않는다.

## UX 흐름

1. `onMounted`에서 `isShareTarget`가 감지되고 `connectToRoom()` 완료 후, 기존처럼 SW로부터 `pendingShareData`(files/title/text/url)를 받아온다.
2. 데이터가 존재하면(파일 또는 텍스트 중 하나 이상) 즉시 업로드/공유를 실행하는 대신 확인 시트를 연다. 데이터가 전혀 없으면(공유 콘텐츠 없음) 시트 없이 조용히 종료(기존 동작 유지).
3. 사용자가 시트에서 "같은 네트워크" 또는 "전체 공유"를 선택하고 "공유하기"를 누르면, 그 scope 값을 `targetScope`로 사용해 기존 업로드/`handleAddText` 로직을 그대로 실행한다.
4. "취소"를 누르거나 백드롭을 클릭하면 `pendingShareData`를 폐기하고 아무 것도 업로드하지 않는다. 시트만 닫히고 평소 룸 화면이 남는다.
5. 매번 예외 없이 시트가 뜬다 — scope가 `ip`든 `global`이든 조건 분기 없음.

## 시트 UI 설계

- 패턴은 [`FileCard.vue`](../../../frontend/src/components/FileCard.vue)의 기존 모바일 액션 시트(`Teleport to="body"`, `Transition name="sheet"`, `fixed inset-0 bg-black/70` 백드롭, `rounded-t-2xl` 하단 패널)를 그대로 재사용한다.
- **상단 요약**: 개수/종류만 표시, 파일명은 노출하지 않는다. 조합 규칙:
  - 파일만: "파일 N개를 공유합니다"
  - 텍스트만: "텍스트를 공유합니다"
  - 파일+텍스트: "파일 N개와 텍스트를 공유합니다"
- **스코프 리스트 (2행)**: "같은 네트워크" / "전체 공유"를 세로로 나열한 라디오 리스트. **선택된 행은 체크마크뿐 아니라 행 배경 전체를 스코프 색상으로 옅게 틴트**한다(coral `#FF6B4A` / sage `#4F8767`, 각각 tint 배경 — 기존 `ShareScopeTabs`/`useScopeAccent`가 쓰는 톤과 동일). 체크마크 단독 채색 대비 스코프 전환이 "unmissable"해야 한다는 `DESIGN.md` 원칙을 더 잘 만족한다.
  - 기본 선택은 `localStorage`에 저장된 값과 무관하게 항상 "같은 네트워크"(`ip`).
  - 시트 내부 선택 상태는 로컬 `ref`이며, `useShareScope`의 `setScope()`를 호출하지 않는다.
- **하단 버튼 2개**: "취소"(중립 스타일) / "공유하기"(현재 선택된 scope 색상으로 채워짐 — coral 또는 sage).
- 색상 계산은 신규 로컬 `ref`를 `useScopeAccent(() => localScope.value)`에 넘겨 재사용한다.

## 컴포넌트별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `frontend/src/components/ShareConfirmSheet.vue` (신규) | 확인 시트 UI. Props: `summary`(파일 개수/텍스트 유무), Emits: `confirm(scope)` / `cancel`. 내부에 로컬 scope 선택 상태와 `useScopeAccent` 사용. |
| `App.vue` | `handleShareTargetData()`를 두 단계로 분리: (1) SW에서 데이터 fetch, (2) 데이터가 있으면 `ShareConfirmSheet`를 열고 사용자 선택을 `await`(Promise 기반 confirm/cancel)한 뒤에만 기존 업로드/`handleAddText` 로직 실행. 취소 시 조기 반환. |
| `i18n/locales/*.json` (21개) | 신규 키: 시트 타이틀 3종(파일만/텍스트만/파일+텍스트, 개수 interpolation 포함), 취소/공유하기 버튼 라벨. 스코프 라벨은 신규 키를 만들지 않고 기존 `scope.ip`("같은 네트워크")/`scope.global`("전체 공유") 키를 그대로 재사용한다. |
| `DESIGN.md` | "Open Design Question" 섹션을 제거하고 Decisions Log에 확정된 결정 1행 추가 (아래 참조). |

## DESIGN.md 갱신 내용

- `## Open Design Question (deferred)` 섹션 삭제.
- Decisions Log에 행 추가:
  | 2026-07-03 | 모바일 Share Sheet(Web Share Target) 진입 시 매번 "같은 네트워크"/"전체 공유" 확인 시트를 강제 노출, 취소 시 공유 데이터 전체 폐기 | 마지막 선택 scope가 `localStorage`에 sticky하게 남아 있어 다른 앱에서 공유한 콘텐츠가 인지 없이 `global`로 broadcast될 위험 — 매번 명시적 선택을 요구해 제거. 선택은 이번 공유 1회에만 적용하고 앱의 저장된 기본값은 건드리지 않음 |

## 테스트 계획

### 프론트엔드
- `ShareConfirmSheet.test.js` (신규): 요약 문구가 파일/텍스트/파일+텍스트 조합에 따라 올바르게 렌더링되는지, 기본 선택이 항상 `ip`인지, "전체 공유" 클릭 시 로컬 선택 상태와 버튼 색상이 sage로 바뀌는지, "공유하기" 클릭 시 현재 선택된 scope 값으로 `confirm` 이벤트가 emit되는지, "취소"/백드롭 클릭 시 `cancel` 이벤트만 emit되고 `confirm`은 emit되지 않는지.
- `App.test.js` 또는 기존 share-target 관련 테스트(있다면): 시트에서 `cancel` 시 `uploadFiles`/`handleAddText`가 호출되지 않는지, `confirm(scope)` 시 해당 scope로 정확히 호출되는지, `shareScope.setScope()`가 이 경로에서 절대 호출되지 않는지.
- `i18n.test.js`: 신규 키가 21개 로케일 모두에 존재하는지 기존 검증 루틴에 자동 포함.

### 수동 QA
- Android Chrome(Web Share Target 지원 기기)에서 다른 앱(사진 앱 등)으로부터 파일 1개/여러 개/텍스트/파일+텍스트 조합으로 공유 → 시트가 매번 뜨는지, 기본 선택이 "같은 네트워크"인지, "전체 공유" 전환 시 색상이 즉시 바뀌는지.
- "공유하기" 후 실제로 선택한 scope의 룸에 콘텐츠가 올라가는지, 상단 `ShareScopeTabs`가 여전히 이전 저장값(변경되지 않음)을 보여주는지.
- "취소" 후 아무것도 업로드/공유되지 않고 평소 룸 화면으로 남는지.
- 다크모드에서 시트 배경·틴트 대비 확인.

## 오픈 이슈 / 명시적으로 다루지 않는 것

- Web Share Target을 지원하지 않는 브라우저(iOS Safari 등)에 대한 대체 흐름은 다루지 않는다 — 기존과 동일하게 해당 브라우저에서는 이 진입 경로 자체가 발생하지 않는다.
- 확인 시트를 다시 보지 않도록 하는 "다시 보지 않기" 옵션은 다루지 않는다 — 매번 확인이 이번 설계의 핵심 요구사항이므로 우회 옵션을 두지 않는다.
- `handleShareTargetData`의 3초 SW 타임아웃(`SW timeout`) 처리 로직 자체는 변경하지 않는다 — 타임아웃 시 기존과 동일하게 조용히 종료(시트도 뜨지 않음).
