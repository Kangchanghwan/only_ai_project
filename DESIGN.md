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
- **Direction:** Playful/toy-like in tone, but the shipped visual language is flat and square-cornered ("hairline-and-ink"): 0px radius, no shadows, 1-2px borders, a navy ink for primary actions. Coral stays the brand accent. (Synced to code 2026-11-26; the original rounded/soft direction was superseded.)
- **Decoration level:** Intentional — subtle texture/illustration on empty states so the feed feels like a living tray, not a bare form.
- **Mood:** Warm, casual, physical — items "land" in the feed like they were tossed there. Explicitly not "encrypted vault" or "enterprise security tool" in feel.
- **Reference sites:** snapdrop.net, sharedrop.io, wormhole.app

## Typography
- **Display/Hero:** Cabinet Grotesk (500/700/800) — loaded from Fontshare (`font-display` token; headers, landing headings). h1-h4 use weight 800, letter-spacing -0.02em.
- **Body / UI / Labels:** Pretendard Variable (jsDelivr dynamic-subset, handles Korean) — stack: Pretendard Variable, Pretendard, Plus Jakarta Sans, system sans. Plus Jakarta Sans is only a fallback in the stack, not loaded as a webfont.
- **Data/Tables:** no dedicated face; counts and badges use the body face with `tabular-nums`. (Geist and JetBrains Mono from the original plan are not loaded.)
- **Loading:** both stylesheets are async (`preload` + `onload` swap, `display=swap`) so they never block first paint; metric-adjusted local fallback `@font-face` blocks (`Cabinet Grotesk Fallback*`, `Plus Jakarta Sans Fallback*`, Arial/Roboto based) live in the `index.html` critical CSS to limit layout shift. `scripts/prerender.mjs` asserts this pattern — change both together. Keep the font stacks in `index.html` and `src/style.css` identical.
- **Scale:** hero 40-56px / section heading 20-24px / body 15-16px / data 13-14px / caption 11-12px.

## Color
- **Approach:** Restrained — one brand accent, one secondary "scope" accent for a specific functional meaning (see Scope Color below).
- **Primary accent (brand):** `#FF6B4A` coral (light) / `#FF7A5C` (dark) — warm, close, "handoff" feeling; it is the `ip` scope color and the logo/icon color. Primary buttons, selection and focus use the navy **ink** token instead (see Neutrals), not coral. Deliberately not blue (every competitor — Snapdrop, ShareDrop, AirDroid, Dropbox — uses blue as the trust/tech color).
- **Theme default:** dark (`:root` / `[data-theme="dark"]`); light via `[data-theme="light"]`. Tokens are defined in `frontend/src/style.css` (and mirrored in the `index.html` critical CSS).
- **Neutrals (light):** background `#FFFFFF`, surface `#FFFFFF`, tint `#F1F5FA`, border `#E1E5EC`, text `#0B1F4D`, muted text `#5A6B8C`. Cool navy-tinted (the earlier warm cream palette was replaced).
- **Neutrals (dark):** background `#0A1430`, surface `#0F1D40`, tint `#13234A`, border `#24335A`, text `#EEF2F8`, muted text `#9AA8C4`.
- **Ink (primary buttons, selection, focus, active tab underline, badges):** light `#0B1F4D` / `ink-2` `#2D4270`, dark `#DCE4F2` / `#B7C4DC`; text on ink `--color-on-ink` (`#FFFFFF` / `#0A1430`). Text on accent-colored buttons `--color-on-accent` (`#FFFFFF` light / `#0A1430` dark).
- **Page background:** the page, the app frame and the header all use the themed background/surface tokens; the room view is a single column (see Layout).
- **Semantic:** danger `#DC2626` light / `#F87171` dark (delete and other destructive actions). Success/warning have no dedicated tokens in code.
- **Scope color (functional, not brand):** the app has three kinds of sharing scope — `ip` (same public IP / same network, auto-joined), `global` (visible to everyone using the app) and private rooms (`prv:<roomId>`: 1:1 pairing rooms and group rooms, each shown as its own tab). These carry different privacy blast radii and must be visually distinguishable wherever the user picks or sees a scope:
  - `ip` scope uses the primary coral accent (`#FF6B4A`) — close, local, low-risk, and it's the default.
  - `global` scope uses a dedicated sage-green (`#4F8767` light / `#6FAE8A` dark, tint `#E4EEE7` light / `#223026` dark) — deliberately different from coral so switching scope is visually unmissable, not just a label change.
  - Private rooms (1:1 / group) use a dedicated blue (`--color-scope-private`: `#2F66D0` light / `#5B8DEF` dark, tint `#E3ECFB` light / `#1F2A40` dark) — distinct from coral and sage because the audience is a specific paired device or invited group.
  - `global` is never the default selection in any UI; the user must explicitly switch to it.
  - The scope accent is not limited to the tab pill — every accent touch below it (upload dropzone border/icon, paste box hover, file card selection highlight/icon/action buttons, sticky bottom action bar icons, text-share hover accents) must switch between coral, sage and blue together with the active scope (`useScopeAccent` returns the class set for all three), so the screen never shows a mismatched mix of the two accents at once. Destructive actions (delete) stay red regardless of scope — that's semantic, not scope color.
- **Dark mode:** redesigned surfaces (deep navy, not inverted light); the coral accent shifts to `#FF7A5C` (brighter, not desaturated) and ink flips to a light tone so primary buttons stay high-contrast.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — quick utility tool, but not cramped.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** The room view is one centered column (`page-shell`: max 760px, 880px from 768px up). The file feed is a single-column row list (not a card grid); the upload entry point is allowed to break the list with an oversized, playful drop-zone/pill above it.
- **App shell:** `.app-frame` is full width with the themed surface background and no shadow. The 480px "phone frame" with letterbox only survives on the download page (`app-frame--narrow`, `max-width: 30rem`); the room screen is no longer phone-framed (the 2026-07-02 phone-frame decision is superseded). `position: fixed` chrome is centered by each element itself rather than via `contain`.
- **Feed layout:** file list rows: icon/thumbnail + two-line name/meta + always-visible action buttons (no hover-only reveal — must work on touch). Files and text share one column with a Files / Text switcher at every screen size — no side-by-side split.
- **Border radius:** square. Theme tokens: xs/sm 2px (count badges), md and larger 0px; components use `rounded-none`. Only avatars (`rounded-full`) and the mobile bottom sheets (`rounded-t-2xl`) stay round. **Shadows:** all shadow tokens are `none`; separation comes from 1px `--color-border` lines and 2px `--color-ink` frames (menus, action bar, selected row).
- **Scope tabs:** an underline tab bar (`ShareScopeTabs`, min-height 44px, horizontally scrollable) above the feed: `같은 네트워크` (ip), `전체 공유` (global), then one tab per private room (1:1 peer name or group name, group tabs get a people icon), plus a trailing "＋ 방" create button. The active tab is bold ink text with a 2px ink underline — the scope color is not the tab fill. Scope is shown by an 8px square mark before the label (sage for global, blue for 1:1 rooms; ip has none) and a lock icon when the scope is password-locked; a newly connected room's tab gets a small blue dot. Default active tab is always `ip`.
- **Sticky/fixed chrome:** the header (`AppHeader`, `bg-surface`, bottom border) sticks to the top (`sticky top-0`), content width max 880px; it holds the 📋 logo + title, a "more" menu (install / push / 사이트 주소 QR — the site-address QR lives here, opening `QRZoomModal` captioned "휴대폰에서 이 사이트 열기"), help, theme toggle and the connected-devices avatar row. There is no QR thumbnail button in the header. The file-list action bar (`DownloadControls`) is a fixed card centered at the bottom (max 28rem, inset 1rem, safe-area aware) with a 2px ink border and square corners — not rounded or shadowed — grid of icon buttons with an ink count badge (`selected/total`); delete uses danger red. Icons are custom inline SVG. On mobile (`<sm`), per-file row actions collapse behind a single "⋯" trigger that opens a bottom action sheet.
- **Selected row:** inset 2px ink box-shadow; keyboard focus is a separate 2px blue outline.
- **Footer / help:** `AppFooter` (privacy, install, push, GitHub, credit) and `LandingContent` live inside the header's help modal (teleported, DOM kept for SEO) and are moved below the main view when the list is empty; the download page also renders `AppFooter` at the bottom.
- **Invite entry (one per screen state):** the same-network tab shows a dashed "휴대폰 초대" card as the 2nd device card (right after "나"), only when another device is present, opening a `PhoneConnectSheet`; with 0 devices the empty-state QR remains. Devices on other networks collapse into one muted text line "다른 네트워크에도 N대가 있어요 · 보기". Room tabs have no QR row: the room strip's 초대 button opens the invite sheet whose first tab "내 휴대폰" (default when alone) holds the room-wake QR; legacy 1:1 rooms show it inside `LegacyInviteSheet`. The site-address QR lives in the ··· menu.

## Motion
- **Approach:** Intentional — feed items animate in with a soft spring-bounce ("land" animation: translateY + scale with slight overshoot, ~500ms, staggered ~80ms per card) so new shares feel tossed onto the tray rather than silently appearing. As built (`FileGallery` `card-land`): 350ms transform+opacity with the same overshoot curve; avatars use a short `avatar-enter` transition; reduced-motion is respected.
- **Easing:** enter `cubic-bezier(.34,1.56,.64,1)` (overshoot), exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 50-100ms, short 150-250ms, medium 250-400ms (card land), long 400-700ms.
- **Presence indicator:** replaces the "radar ping" convention with a simple overlapping row of animal avatars (`ConnectedDevices`, 32px circles with `ring-2` in the background color, "+N" overflow chip, tap opens a device list — bottom sheet on mobile, popover on `sm+`) — no scanning/searching animation, since there is no peer discovery step in this app.

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
| 2026-07-02 | 폰 프레임 바깥 레터박스 배경을 테마 무관 고정값(`#F7F7F7`)에서 다시 `var(--color-background)`로 되돌림 (`frontend/index.html`, `frontend/src/style.css` `body` 규칙 동시 수정) | 사용자가 고정 중립 배경 대신 테마별 배경을 다시 쓰도록 요청 |
| 2026-07-02 | 룸 화면/다운로드 화면 하단의 `AppFooter`(개인정보 처리방침·GitHub 링크·제작자 크레딧)를 제거하고, 그 내용을 헤더의 도움말 모달(`HelpModal.vue`) 하단 "정보" 섹션으로 이전 | 사용자가 푸터 없이 화면이 더 깔끔하다고 판단, 항상 노출되는 하단 바 대신 필요할 때 여는 도움말 안에 링크를 보존하도록 요청 |
| 2026-07-03 | `AppHeader.vue`의 헤더 배경을 `bg-background`에서 `bg-surface`로 변경. 룸 화면/다운로드 화면 하단에 `AppFooter`를 다시 추가 (도움말 모달의 "정보" 섹션은 유지, 내용 중복) | 다크테마에서 헤더(`--color-background`)와 프레임 바깥 레터박스(동일하게 `--color-background`)가 같은 색이라 헤더가 프레임에 속한 서피스가 아니라 레터박스의 연장처럼 보이는 문제를 사용자가 지적 — 헤더는 프레임 내부 서피스(`--color-surface`)를 써야 레터박스와 항상 구분됨. 동시에 사용자가 하단 푸터를 본문에도 다시 노출해 달라고 요청 |
| 2026-07-03 | 모바일 Share Sheet(Web Share Target) 진입 시 매번 "같은 네트워크"/"전체 공유" 확인 시트를 강제 노출, 취소 시 공유 데이터 전체 폐기 | 마지막 선택 scope가 `localStorage`에 sticky하게 남아 있어 다른 앱에서 공유한 콘텐츠가 인지 없이 `global`로 broadcast될 위험 — 매번 명시적 선택을 요구해 제거. 선택은 이번 공유 1회에만 적용하고 앱의 저장된 기본값은 건드리지 않음 |
| 2026-09-12 | 검색용 랜딩 섹션(`LandingContent.vue`)과 정적 가이드/FAQ 페이지(`frontend/public/**/*.html`) 추가. 본문 프로즈는 15-16px `--color-text-primary`를 쓰고(muted 금지), 정적 페이지의 밝은 테마 텍스트 링크는 어두운 코랄 `#C8432A`, CTA는 코랄 배경 `#FF6B4A` + 진한 텍스트 `#2A2622` | 브랜드 코랄 `#FF6B4A`는 흰 배경에서 2.8:1, muted `#8A8178`는 3.8:1로 WCAG AA(4.5:1)에 미달해 긴 글에는 쓸 수 없음. 앱(SPA) 안의 `text-primary` 링크도 같은 문제가 있으나 이번엔 손대지 않음 — 링크 전용 코랄 톤을 토큰으로 정하는 별도 결정 필요 |
| 2026-09-12 | 브랜드 에셋(`favicon.svg`, `og-image.svg`, 모든 PNG/ICO 아이콘, `manifest.json`·`index.html`의 `theme-color`)을 레거시 Vue 그린(`#42b883`/`#35495e`)에서 코랄 팔레트로 재생성. 래스터는 `frontend/scripts/generate-brand-assets.mjs`(`npm run assets:brand`, Puppeteer)가 두 SVG 원본에서 만들고, 브라우저용 캔버스 도구 `convert-images.html`은 삭제. PWA 아이콘에 `icon-192.png`/`icon-512.png`(purpose any)와 `icon-512-maskable.png`(512 캔버스 `#FAF8F5` 위 312px 타일, purpose maskable)를 추가하고 `favicon.svg`는 any 전용으로 변경. `apple-touch-icon.png`는 코랄 풀블리드 | 앱 UI는 코랄인데 파비콘/OG/설치 아이콘만 그린으로 남아 브랜드가 어긋났음. OG는 그라디언트 대신 단색 `#FAF8F5` 배경 + "트레이에 카드가 착지하는" 피드 일러스트(anti-slop, 60KB로 150KB 제한 충족). 둥근 모서리 타일은 maskable 로 쓰면 마스크 안에서 잘리므로 전용 maskable PNG를 분리했고, iOS는 투명 영역을 검게 칠하므로 터치 아이콘은 풀블리드로 |
| 2026-11-26 | DESIGN.md를 실제 구현에 맞춰 동기화: 폰트(Cabinet Grotesk=Fontshare 로드, 본문=Pretendard, Plus Jakarta는 폴백만, Geist/JetBrains Mono 미사용), 팔레트(웜 크림 → 네이비 중립, 기본 다크, 잉크 `#0B1F4D`/`#DCE4F2`), 라디우스 0·그림자 없음, 폰 프레임은 다운로드 페이지에만 남기고 룸은 760/880px 단일 열, 탭을 밑줄형으로, 1:1/그룹 방 탭과 블루 스코프 색(`#2F66D0`/`#5B8DEF`) 추가, 하단 액션바 2px 잉크 테두리, 푸터/랜딩은 도움말 모달 안(목록이 비면 본문), 접힌 QR 행, 동물 아바타 프레즌스 | 코드가 2026-07 이후 "각진 하이라인+잉크" 스타일로 바뀌며 문서와 어긋나 있었음(문서는 `DESIGN.md`를 디자인 기준으로 삼는 CLAUDE.md 규칙 때문에 최신이어야 함). 위 2026-07-02 폰 프레임·액션바 둥근 카드·레터박스 항목은 이력으로 남기되 현재 구현은 이 행을 따른다 |
| 2026-11-27 | 초대 입구를 화면 상태마다 1개로 정리: 같은 네트워크 탭은 점선 "휴대폰 초대" 카드(다른 기기가 있을 때), 방 탭은 초대 시트의 "내 휴대폰" 탭, 헤더의 사이트 QR은 ··· 메뉴 "사이트 주소 QR"로 이동, QR 문구는 "휴대폰에서 이 사이트 열기" | 입구가 여러 개라 디자인이 따로 놀고, 헤더 사이트 QR과 본문 초대 QR의 역할이 헷갈림 → 화면 상태마다 초대 입구 1개 |
