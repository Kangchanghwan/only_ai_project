# 성공 직후 "다음엔 더 빨리" 안내 (설계)

작성 2026-11-12. owner 승인("구현해도 좋을 것 같다", 2026-11-12). 프론트만 변경.

## 목적
재방문 계기가 없다(GA4 28일: 새 사용자 844, 재방문 199, 유지율 1~2%대). 첫 전송이 성공한 순간에 다음 방문을 쉽게 만드는 길 하나를 권한다.

## 동작
전송이 성공하면(아래 4곳) 화면 아래에 닫을 수 있는 한 줄을 보여 준다. 토스트(`notificationService`, 단일 슬롯·3초)는 쓰지 않는다. `ArrivalNotifyPrompt.vue`와 같은 모양·위치의 별도 컴포넌트를 만든다.

### 종류(variant) 결정: 보여 줄 때 계산
1. standalone(설치 앱으로 실행 중) 또는 `isInstalled` → 보여 주지 않음
2. iOS(`isIOS()` named export, iPadOS 데스크톱 UA 포함) → `ios_shortcut`
3. `canInstall`(beforeinstallprompt 확보됨) → `install`
4. 모바일 UA가 아니고 `canInstall`도 아님(Firefox, macOS Safari 등) → `bookmark`
5. 그 밖(설치 못 하는 안드로이드 인앱 브라우저 등) → 보여 주지 않음

### 문구 (ko 기준, 21개 로케일 번역)
| variant | 문장 | 버튼 |
|---|---|---|
| ios_shortcut | 다음엔 사진 앱 공유 버튼에서 바로 보낼 수 있어요 | 단축어 추가 |
| install | 앱으로 설치하면 다음엔 더 빨리 열 수 있어요 | 설치 |
| bookmark | {key}로 즐겨찾기에 추가하면 다음에 바로 열 수 있어요 | (없음) |
- `{key}`: Mac은 `⌘D`, 그 외 `Ctrl+D`.
- 닫기 버튼 aria-label: 닫기.

### 버튼 동작
- ios_shortcut: `<a>` 링크. ko는 `/how-to-use.html#ios-shortcut`, 그 외 언어는 파일 보내기 단축어 iCloud 링크. 두 상수는 지금 `ConnectionCard.vue` 25~27행에 있다 → `frontend/src/utils/iosShortcut.js`로 옮기고 ConnectionCard는 import만 바꾼다(**ConnectionCard의 다른 부분은 건드리지 않는다**).
- install: `usePWAInstall().promptInstall()`.

### 노출 규칙
- 저장: localStorage `cs_next_time_hint` = JSON `{shows:number, done:boolean}`. 저장 실패는 무시.
- 조건: `!done && shows < 3 && variant != null`, 페이지 로드당 1회, `ArrivalNotifyPrompt`가 떠 있으면 건너뜀.
- 성공 후 1.2초 뒤에 표시(성공 토스트가 먼저 보이게). 표시하면 `shows += 1`.
- 20초 뒤 자동으로 숨김(done 아님, 다음 방문에 다시 보일 수 있음).
- 닫기 또는 버튼 클릭 → `done = true`.

### 성공 지점 (App.vue, 한 줄 호출 `nextTime.markSuccess(kind)`)
- 업로드 묶음 성공(`summary.successCount > 0`, 545~550행 근처): kind `upload` (1:1 방 업로드 포함)
- 다운로드 성공(단일 594행 근처, 병렬 640행 근처): kind `download`
- 텍스트 보내기 성공(751~752행 근처): kind `text`
- 텍스트 복사 성공(`handleCopyText`, 892행 근처): kind `copy`
App.vue 수정은 이 호출들과 컴포넌트 마운트(`ArrivalNotifyPrompt` 옆)로 한정한다.

### 분석
`next_time_hint_view {variant, kind}`, `next_time_hint_click {variant}`, `next_time_hint_dismiss {variant}`.

## 파일
- 새: `frontend/src/composables/useNextTimeHint.js`(+test), `frontend/src/components/NextTimeHint.vue`(+test), `frontend/src/utils/iosShortcut.js`
- 수정: `App.vue`, `ConnectionCard.vue`(import만), 로케일 21개, `i18n.test.js`
- data-testid: `next-time-hint`, `next-time-hint-action`, `next-time-hint-close`

## i18n 삽입 위치
새 최상위 블록 `"nextTime"`을 **`"identity"` 블록 바로 앞**에 넣는다. 키: `iosText`, `iosAction`, `installText`, `installAction`, `bookmarkText`, `close`.

## 테스트
- composable: variant 5가지, shows 3회 상한, done 뒤 미표시, 페이지당 1회, 20초 자동 숨김(가짜 타이머), 저장소 예외 무시
- 컴포넌트: variant별 문구·버튼·링크(ko/en), 클릭·닫기 이벤트와 분석 호출
- 기존 `ConnectionCard.emptyState.test.js` 통과 유지

## 하지 않는 것
알림 권한 요청(별도 작업), 새 라우트, 백엔드 변경.

## 구현 메모
- 분석 이벤트(`next_time_hint_click`, `next_time_hint_dismiss`)와 `promptInstall()` 호출은 컴포넌트가 아니라 `useNextTimeHint`의 `act()`/`dismiss()`에서 한다. `NextTimeHint.vue`는 `visible`, `variant` props와 `action`, `dismiss` 이벤트만 가진 표시 전용 컴포넌트다. 이벤트 테스트는 composable 테스트에 있다.
- 도착 알림 안내가 떠 있어서 건너뛴 경우는 "표시"로 세지 않는다(shows 증가 없음, 페이지 1회 소진 없음). 같은 페이지에서 다음 성공 때 다시 시도한다.
- 지연(1.2초) 중 연속 성공은 한 번만 예약하고, 종류(kind)는 첫 성공 기준이다.
- 링크 해석은 `iosShortcut.js`의 `iosShortcutHrefFor(locale)`로 두었다. ConnectionCard는 상수 import만 바꿨다.
- 안내 링크는 ko에서는 같은 탭, 그 외 언어는 iCloud 링크라 새 탭(`rel="noopener noreferrer"`)으로 연다.
