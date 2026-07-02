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
- **Semantic:** success `#4A9C6D`, warning `#D9A441`, error `#D9534F`.
- **Scope color (functional, not brand):** the app has two sharing scopes — `ip` (same public IP / same network, auto-joined) and `global` (visible to everyone using the app). These carry different privacy blast radii and must be visually distinguishable wherever the user picks or sees a scope:
  - `ip` scope uses the primary coral accent (`#FF6B4A`) — close, local, low-risk, and it's the default.
  - `global` scope uses a dedicated sage-green (`#4F8767` light / `#6FAE8A` dark, tint `#E4EEE7` light / `#223026` dark) — deliberately different from coral so switching scope is visually unmissable, not just a label change.
  - `global` is never the default selection in any UI; the user must explicitly switch to it.
- **Dark mode:** redesign surfaces (not just invert), warm near-black background, slightly desaturate accent by ~5-10%.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — quick utility tool, but not cramped.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** The file feed is a single-column row list (not a card grid); the upload entry point is allowed to break the list with an oversized, playful drop-zone/pill above it.
- **Feed layout:** file list rows: icon/thumbnail + two-line name/meta + always-visible action buttons (no hover-only reveal — must work on touch). On desktop (`md`+), the file list and text feed sit side-by-side (60% file / 40% text). Below `md`, a two-tab switcher ("Files" / "Text") replaces the split, defaulting to the file tab.
- **Max content width:** ~1040px for the main room screen.
- **Border radius:** sm 8px (chips, small controls), md 14px (cards), lg 22px (frames, dropzone), full 999px (pills, tabs, primary buttons).
- **Scope tabs:** a segmented pill control (`우리 네트워크` / `전체 공유`) sits above the feed; active tab fills with the scope color (coral for ip, sage for global). Default active tab is always `ip`.

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
