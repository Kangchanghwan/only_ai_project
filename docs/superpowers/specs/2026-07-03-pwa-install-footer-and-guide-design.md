# 푸터 PWA 설치 안내 + 사용 가이드 상세화 설계

## 배경

앱은 이미 PWA(설치형 웹앱)로 구성되어 있다 — [`frontend/public/manifest.json`](../../../frontend/public/manifest.json)에 `share_target`이 정의되어 있어, 설치 후에는 다른 앱(사진첩, 파일 앱 등)에서 "공유" → 이 앱을 선택하면 [`ShareConfirmSheet.vue`](../../../frontend/src/components/ShareConfirmSheet.vue) 흐름으로 바로 파일이 전달된다. 하지만 사용자에게 "설치하면 이런 게 가능하다"는 안내가 어디에도 없다. 이번 세션에서 푸터에 짧은 설치 유도 문구/버튼을, 사용 가이드([`HelpModal.vue`](../../../frontend/src/components/HelpModal.vue))에 상세 설치 방법과 공유 연동 설명을 추가하기로 했다.

## 범위

- 푸터([`AppFooter.vue`](../../../frontend/src/components/AppFooter.vue))에 PWA 설치 유도 문구 + 설치 버튼을 추가한다.
- 사용 가이드([`HelpModal.vue`](../../../frontend/src/components/HelpModal.vue))에 설치 방법(플랫폼별) + 설치 후 공유 연동 설명 섹션을 추가한다.
- 신규 composable `usePWAInstall.js`로 `beforeinstallprompt` 캡처, 설치 여부 판별, 설치 트리거를 구현한다.
- **범위 밖**: 서비스워커([`sw.js`](../../../frontend/public/sw.js))나 `manifest.json`의 `share_target` 로직 자체는 변경하지 않는다 — 이미 동작하는 기능을 노출/안내하는 것이 목적이다.

## 설치 감지 및 트리거 — `usePWAInstall.js`

- **상태**: `canInstall`(설치 프롬프트를 띄울 수 있는지), `isInstalled`(이미 standalone으로 실행 중인지). 둘 다 모듈 스코프 공유 `ref`로 관리한다 (`useTheme.js`와 동일한 패턴 — 여러 컴포넌트에서 동일 인스턴스 참조).
- **초기화**: 컴포저블이 처음 사용될 때 한 번 `window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true` 를 확인해 `isInstalled` 초기값을 설정한다.
- **`beforeinstallprompt` 이벤트**: 리스너 등록 시 `event.preventDefault()` 후 이벤트 객체를 모듈 스코프 변수(`deferredPrompt`, non-reactive)에 저장하고 `canInstall.value = true`로 설정.
- **`appinstalled` 이벤트**: `isInstalled.value = true`, `canInstall.value = false`, `deferredPrompt = null`로 리셋.
- **`promptInstall()`**: `deferredPrompt`가 없으면 아무 것도 하지 않음. 있으면 `deferredPrompt.prompt()` 호출 후 `await deferredPrompt.userChoice` 결과(accepted/dismissed)와 무관하게 `deferredPrompt = null`, `canInstall.value = false`로 리셋(네이티브 프롬프트는 1회성이므로).
- **미지원 브라우저(iOS Safari, Firefox 등)**: `beforeinstallprompt`가 애초에 발생하지 않으므로 `canInstall`은 계속 `false` → 푸터에 아무것도 노출되지 않는다(사용자 확정 사항).

## 푸터 — `AppFooter.vue`

- `canInstall && !isInstalled`일 때만 보이는 행을 기존 링크 행 위에 추가한다.
- 내용: 안내 문구 한 줄("앱으로 설치하면 공유하기 기능으로 파일을 바로 보낼 수 있어요") + 그 옆에 작은 "앱 설치" 버튼(기존 `primary` 색상 텍스트/버튼 스타일 재사용, 링크들과 톤을 맞춘 텍스트 크기).
- 버튼 클릭 → `promptInstall()` 호출. 별도 로딩/에러 상태는 두지 않는다(네이티브 브라우저 프롬프트가 즉시 뜨거나 무시되는 것으로 충분).

## 사용 가이드 — `HelpModal.vue`

"⚠️ 제한사항" 섹션과 "💡 팁" 섹션 사이에 새 섹션 "📲 앱으로 설치하기"를 추가한다. 구성:

1. **인트로**: 설치하면 홈 화면 아이콘으로 바로 실행되고, 다른 앱(사진첩, 파일 앱 등)에서 공유 버튼을 눌러 이 앱을 대상으로 선택하면 파일이 자동으로 이 룸에 업로드된다는 설명 (기존 `help.fileShareTitle` 카드와 같은 `bg-background border border-border rounded-lg p-4` 스타일 재사용).
2. **Android / 데스크톱 Chrome·Edge**: 브라우저 하단/주소창에 뜨는 설치 배너 또는 설치 아이콘을 클릭하라는 안내.
3. **iOS Safari**: `beforeinstallprompt`를 지원하지 않으므로 수동 안내 — 공유 버튼(⬆️) → "홈 화면에 추가" 선택.

이 섹션은 `canInstall`/`isInstalled` 상태와 무관하게 항상 정적으로 노출된다(가이드이므로 플랫폼 무관하게 방법을 설명).

## i18n

신규 키 (21개 로케일 전체에 추가, `ko.json` 기준 초안):

```
"footer": {
  "installPrompt": "앱으로 설치하면 공유하기 기능으로 파일을 바로 보낼 수 있어요",
  "installButton": "앱 설치"
}
```

```
"help": {
  "pwaTitle": "앱으로 설치하기",
  "pwaIntro": "설치하면 홈 화면 아이콘으로 바로 실행하고, 다른 앱에서 공유 버튼을 눌러 이 앱을 선택하면 파일이 자동으로 업로드돼요.",
  "pwaAndroidTitle": "Android / 데스크톱 (Chrome, Edge)",
  "pwaAndroidDesc": "주소창의 설치 아이콘이나 하단에 뜨는 설치 배너를 눌러주세요.",
  "pwaIOSTitle": "iOS (Safari)",
  "pwaIOSDesc": "공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택해주세요."
}
```

각 로케일 파일에 해당 언어로 번역해 추가한다. 기존 `i18n.test.js`가 모든 로케일에 동일한 키 셋이 있는지 검증하므로, 21개 파일 전체 반영이 필수다.

## 컴포넌트별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `frontend/src/composables/usePWAInstall.js` (신규) | `beforeinstallprompt`/`appinstalled` 캡처, `canInstall`/`isInstalled` 공유 상태, `promptInstall()` |
| `frontend/src/composables/usePWAInstall.test.js` (신규) | 이벤트 캡처 후 `canInstall`이 true가 되는지, `promptInstall()` 호출 시 `deferredPrompt.prompt()`가 호출되고 이후 `canInstall`이 false로 리셋되는지, `appinstalled` 발생 시 `isInstalled`가 true가 되는지 |
| `frontend/src/components/AppFooter.vue` | `usePWAInstall` 사용, 조건부 설치 유도 행 추가 |
| `frontend/src/components/HelpModal.vue` | "📲 앱으로 설치하기" 섹션 추가 |
| `frontend/src/i18n/locales/*.json` (21개) | `footer.installPrompt/installButton`, `help.pwaTitle/pwaIntro/pwaAndroidTitle/pwaAndroidDesc/pwaIOSTitle/pwaIOSDesc` 키 추가 |

## 테스트 계획

### 프론트엔드
- `usePWAInstall.test.js`: 위 표 참조.
- `AppFooter.test.js` (신규 또는 기존 확장): `canInstall=false`일 때 설치 행이 렌더링되지 않는지, `canInstall=true && isInstalled=false`일 때 렌더링되고 버튼 클릭 시 `promptInstall`이 호출되는지.
- `i18n.test.js`: 기존 검증 루틴이 신규 키 누락 여부를 자동으로 잡아준다.

### 수동 QA
- Chrome 데스크톱에서 `beforeinstallprompt`를 인위적으로 트리거(devtools Application 패널 또는 실제 설치 가능 조건)해 푸터 문구/버튼이 뜨는지, 클릭 시 네이티브 설치 다이얼로그가 뜨는지 확인.
- 설치 후(standalone 모드) 푸터에 설치 유도 행이 사라지는지 확인.
- 사용 가이드 모달을 열어 새 섹션이 다른 섹션과 스타일이 일치하는지, 21개 언어 중 몇 개(en, ja, ko 등) 전환 시 텍스트가 깨지지 않는지 확인.
