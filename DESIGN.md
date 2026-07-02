# Design System — ClipboardApp

## Product Context
- **What this is:** Real-time file/image/text sharing web app. Users auto-join a shared room over Socket.IO and exchange files, photos, and text snippets instantly, no login.
- **Who it's for:** People who need to move a file between their own devices or hand something to someone physically nearby, right now, without setting up an account.
- **Space/industry:** Local file-transfer utilities (Snapdrop, ShareDrop, AirDroid) and quick-share tools (Wormhole.app).
- **Project type:** Web app (utility tool), Vue 3 + Vite SPA.
- **The one thing to remember:** Handing someone a file feels as physical and instant as tossing it across a table — and the tool itself feels like a light, playful gadget, not a serious security vault.

## Research Notes
- Snapdrop and ShareDrop both use a radar/concentric-ripple UI with a single circular "Upload Files" CTA — this visualizes "discover nearby peer devices," which doesn't match this app's actual model (auto-joined shared room, no peer discovery). Deliberately not reusing this metaphor.
- Wormhole.app: dark mode, gradient headline, casual copy tone ("drag stuff here"). Reference for playful tone; gradient accent avoided per anti-slop guidance.

## Aesthetic Direction
- **Direction:** Playful/toy-like, restrained (not childish, not maximalist).
- **Decoration level:** Intentional — subtle texture/illustration on empty states so the feed feels like a living tray, not a bare form.
- **Mood:** Warm, casual, physical — items "land" in the feed like they were tossed there. Explicitly not "encrypted vault" or "enterprise security tool" in feel.
- **Reference sites:** snapdrop.net, sharedrop.io, wormhole.app

## Typography
- **Display/Hero:** Cabinet Grotesk — rounded, characterful grotesk that reinforces the toy-like mood without being cute.
- **Body:** Plus Jakarta Sans — humanist, highly legible, not overused (avoids Inter/Roboto convergence).
- **UI/Labels:** same as body.
- **Data/Tables:** Geist (tabular-nums) — for file sizes, timestamps, counts.
- **Code:** JetBrains Mono (if code/text snippets need monospace treatment).
- **Loading:** Google Fonts CDN for Plus Jakarta Sans + Geist; Cabinet Grotesk requires a licensed/self-hosted webfont (Fontshare) — confirm license before shipping.
- **Scale:** hero 40-56px / section heading 20-24px / body 15-16px / data 13-14px / caption 11-12px.

## Color
- **Approach:** Restrained — one brand accent, one secondary "scope" accent for a specific functional meaning (see Scope Color below).
- **Primary accent (brand, actions):** `#FF6B4A` coral — warm, close, "handoff" feeling. Deliberately not blue (every competitor — Snapdrop, ShareDrop, AirDroid, Dropbox — uses blue as the trust/tech color).
- **Neutrals (light):** background `#FAF8F5`, surface `#FFFFFF`, border `#E9E3DA`, text `#2A2622`, muted text `#8A8178`. Warm-toned, not cold slate/gray.
- **Neutrals (dark):** background `#1C1917`, surface `#262220`, border `#3A3430`, text `#F2EDE7`, muted text `#A69A8D`.
- **Page letterbox (outside the phone frame):** fixed `#F7F7F7` in both themes, independent of `--color-background` above. The phone frame's interior keeps switching between the light/dark neutrals as normal; only the margin the frame floats in in desktop viewports (and any edge briefly exposed by mobile overscroll) is pinned to this neutral gray. See Decisions Log 2026-07-02.
- **Semantic:** success `#4A9C6D`, warning `#D9A441`, error `#D9534F`.
- **Scope color (functional, not brand):** the app has two sharing scopes — `ip` (same public IP / same network, auto-joined) and `global` (visible to everyone using the app). These carry different privacy blast radii and must be visually distinguishable wherever the user picks or sees a scope:
  - `ip` scope uses the primary coral accent (`#FF6B4A`) — close, local, low-risk, and it's the default.
  - `global` scope uses a dedicated sage-green (`#4F8767` light / `#6FAE8A` dark, tint `#E4EEE7` light / `#223026` dark) — deliberately different from coral so switching scope is visually unmissable, not just a label change.
  - `global` is never the default selection in any UI; the user must explicitly switch to it.
  - The scope accent is not limited to the tab pill — every accent touch below it (upload dropzone border/icon, paste box hover, file card selection highlight/icon/action buttons, sticky bottom action bar icons, text-share hover accents) must switch between coral and sage together with the active scope, so the screen never shows a mismatched mix of the two accents at once. Destructive actions (delete) stay red regardless of scope — that's semantic, not scope color.
- **Dark mode:** redesign surfaces (not just invert), warm near-black background, slightly desaturate accent by ~5-10%.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — quick utility tool, but not cramped.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** The file feed is a single-column row list (not a card grid); the upload entry point is allowed to break the list with an oversized, playful drop-zone/pill above it.
- **App shell — phone frame:** the entire app (all screens: room, download page) renders inside a single "phone frame" container capped at `max-width: 30rem` (480px), centered on the page. Below 480px (real mobile) this is invisible — the frame simply fills the viewport, unchanged from before. Above 480px (desktop/tablet), the frame floats centered with the page background visible as a letterbox on both sides, so the app always looks and behaves like its mobile layout regardless of screen size. The frame uses `contain: layout` so it becomes the containing block for its `position: fixed` descendants (bottom action bar, notification toast, modals) — they anchor to the frame's edges, not the browser viewport.
  - **Letterbox backdrop:** fixed `#F7F7F7` regardless of light/dark theme (not the themed `--color-background` token, which stays reserved for in-frame surfaces like the header) — a neutral light-gray "photo mockup" backdrop that makes the frame read as an object floating on the page, not part of the app's own color system.
  - **Frame shadow:** `box-shadow: 0 0 3.125rem rgba(22, 28, 1, 0.1)` on the frame itself, so it visually lifts off the gray backdrop.
- **Feed layout:** file list rows: icon/thumbnail + two-line name/meta + always-visible action buttons (no hover-only reveal — must work on touch). The file feed and text feed always use the mobile stacked/tab layout ("Files" / "Text" tab switcher, defaulting to the file tab) at every screen size — there is no side-by-side split, since the phone frame keeps the content column mobile-width everywhere.
- **Border radius:** sm 8px (chips, small controls), md 14px (cards), lg 22px (frames, dropzone), full 999px (pills, tabs, primary buttons).
- **Scope tabs:** a segmented pill control (`우리 네트워크` / `전체 공유`) sits above the feed; active tab fills with the scope color (coral for ip, sage for global). Default active tab is always `ip`.
- **Sticky/fixed chrome:** the header (`AppHeader`) sticks to the top of the phone frame on scroll (`sticky top-0`). The file-list action bar (select-all/download/QR/delete/reset) is a floating rounded card (`rounded-2xl`, shadow, inset ~1rem from the frame's left/right/bottom edges, safe-area aware) rather than an edge-to-edge bar, always visible whenever the file list is showing — its icons are custom inline SVG (matching `FileCard.vue`'s stroke style), not emoji. On mobile (`<sm`), per-file row actions collapse behind a single "⋯" trigger that opens a bottom action sheet, instead of the row's inline icon buttons (which remain inline at `sm` and above).

## Motion
- **Approach:** Intentional — feed items animate in with a soft spring-bounce ("land" animation: translateY + scale with slight overshoot, ~500ms, staggered ~80ms per card) so new shares feel tossed onto the tray rather than silently appearing.
- **Easing:** enter `cubic-bezier(.34,1.56,.64,1)` (overshoot), exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 50-100ms, short 150-250ms, medium 250-400ms (card land), long 400-700ms.
- **Presence indicator:** replaces the "radar ping" convention with a simple overlapping avatar row (who's currently connected) — no scanning/searching animation, since there is no peer discovery step in this app.

## Open Design Question (deferred)
The mobile OS "share to app" flow (Web Share Target API, see `frontend/public/manifest.json` share_target + `frontend/public/sw.js` + `frontend/src/composables/useShareScope.js`) currently auto-publishes to whatever scope (`ip`/`global`) was last selected in-app, with zero confirmation. Because `global` is sticky in localStorage, a stale preference could silently broadcast content shared from another app to everyone using ClipboardApp. A confirmation-sheet design (using the scope colors above, sage-emphasized when resolved scope is `global`) was proposed but deferred — to be designed in a follow-up session before implementation.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-01 | Rejected radar/concentric-ripple UI used by every direct competitor | App has no peer-discovery step (auto-joined shared room), so the metaphor would misrepresent how the product works |
| 2026-07-01 | Coral accent instead of category-standard blue | Differentiates from Snapdrop/ShareDrop/AirDroid/Dropbox; reinforces warm/playful/physical mood over "secure vault" mood |
| 2026-07-01 | Dedicated sage-green color reserved for `global` scope only | `ip` and `global` scopes carry very different privacy blast radii; color must make the switch impossible to miss, and `global` must never be visually or behaviorally default |
| 2026-07-01 | Share Sheet confirmation UX deferred | Needs its own product discussion on default behavior/friction tradeoffs before a design commitment |
| 2026-07-02 | 파일 피드를 카드 그리드에서 리스트로, 파일/텍스트를 상하에서 좌우 분할(모바일은 탭)로 변경 | 참고 이미지(리스트형 파일 관리 UI) 기반 사용자 요청 — 리스트가 스캔성이 높고, 좌우 분할이 텍스트 공유를 파일과 동등한 1차 콘텐츠로 격상시킴 |
| 2026-07-02 | 모바일 파일 행 액션을 아이콘 버튼 4개 상시 노출 대신 "⋯" 트리거 + 하단 시트로 전환 | 28px 아이콘 버튼이 좁은 화면에서 터치하기 부담스럽다는 사용자 피드백 — `sm` 이상에서는 기존 상시 노출 버튼을 그대로 유지하고, 모바일에서만 예외적으로 축소 |
| 2026-07-02 | 스코프 색상(coral/sage)을 탭 이외의 하위 컴포넌트(업로드 드롭존, 파일 카드, 하단 액션바, 붙여넣기 박스, 텍스트 공유)까지 전체 전파 | 사용자가 "전체공유 탭의 색상 프로파일이 하단 컴포넌트들과 통일이 안됨"을 지적 — 탭만 sage로 바뀌고 나머지가 coral로 고정돼 있던 것이 원인. `useScopeAccent` composable로 스코프별 Tailwind 클래스를 중앙화 |
| 2026-07-02 | 앱 전체를 max-width 480px "폰 프레임"으로 감싸고, 데스크톱 파일/텍스트 60/40 좌우 분할을 완전히 제거 (항상 모바일 탭 레이아웃) | 사용자가 데스크톱에서 하단 액션바가 화면 전체 폭에 퍼져 잘 안 보인다고 지적, 참고 사이트(모바일 전용 웹앱을 max-width:30rem 프레임으로 데스크톱에 렌더링하는 패턴)를 근거로 요청. 프레임 폭이 항상 480px이므로 `md:` 좌우 분할은 트리거돼도 표시할 공간이 없어 함께 제거 |
| 2026-07-02 | 하단 액션바를 엣지-투-엣지 바에서 좌우/하단에 여백을 둔 `rounded-2xl` 카드형으로 변경, 아이콘을 이모지에서 `FileCard.vue`와 동일한 스타일의 커스텀 인라인 SVG로 교체 | 폰 프레임 도입에 맞춰 액션바도 "떠 있는" 모바일 앱 느낌으로 통일. 이모지(특히 QR코드를 나타내던 📱, 저장공간 비우기를 나타내던 ⚠️)가 실제 기능을 직관적으로 전달하지 못한다는 사용자 피드백 |
| 2026-07-02 | 폰 프레임 바깥 레터박스 배경을 (라이트 테마 기준) 흰색에 가까운 `#FAF8F5`에서 테마 무관 고정값으로 전환 — `#666666` → `#FFFFFF` → 최종 `#F7F7F7`로 반복 조정. 프레임 자체에 `box-shadow: 0 0 3.125rem rgba(22, 28, 1, 0.1)` 추가. 별도로 `FileUploadSection.vue`/`PasteSection.vue`의 상하단 오버레이에 하드코딩돼 있던 `bg-black/80`+`text-white` 버그를 `bg-surface`+`text-text-primary` 계열로 교체 | 사용자가 배경이 "너무 하얗다"고 지적해 회색(`#666666`)으로, 이후 재요청으로 밝은 회색(`#F7F7F7`)으로 재조정. 중립 배경 위에 그림자로 프레임을 띄워 사진 목업처럼 보이게 함. `--color-background` 토큰은 헤더 등 프레임 내부 서피스에서 재사용 중이라 값 대신 `body` 배경만 직접 오버라이드. `frontend/index.html`의 LCP용 critical CSS `<style>` 블록(레이어 미지정)이 `frontend/src/style.css`의 `@layer base` 규칙보다 캐스케이드 우선순위가 높아 실제로는 index.html 쪽 `body` 규칙도 함께 바꿔야 반영됨 — 두 파일의 `body` 배경색은 항상 같이 수정할 것. 별개로, 라이트 테마에서 업로드/붙여넣기 카드 오버레이가 검은 배경에 흰 텍스트로 렌더링돼 안 보이는 버그도 같은 조사 과정에서 발견 — 오버레이 그라디언트가 테마 변수 대신 리터럴 black/white를 사용해 라이트 테마에서 반전되지 않던 것이 원인 |
