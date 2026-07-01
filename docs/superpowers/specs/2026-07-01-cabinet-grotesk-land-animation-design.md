# Cabinet Grotesk Headings + Card "Land" Animation — Design

## Context

This is the first of the follow-up plans listed in [`2026-07-01-design-system-foundation.md`](../plans/2026-07-01-design-system-foundation.md)'s "What's next" section:

> Apply `Cabinet Grotesk` to actual heading elements and the "land" spring-bounce feed animation to `FileGallery.vue`/`FileCard.vue`.

The foundation PR already loaded the Cabinet Grotesk webfont (Fontshare, weights 500/700/800) and defined the coral/sage color tokens, but no component actually uses the font yet, and no entrance animation exists for file cards. This spec covers both.

## Scope decisions (from brainstorming)

These were resolved through visual comparison in-browser before writing this spec:

1. **Heading scope:** Cabinet Grotesk applies **only to the app title** in `AppHeader.vue` (the one true "hero" element per `DESIGN.md`'s Typography section). Modal titles and subsection headings (`HelpModal.vue`, `QRCodeModal.vue`, `FileQRCodeModal.vue`, `MultiFileQRCodeModal.vue`, `TextShareBox.vue`, `DownloadPage.vue`) are unchanged — they keep Plus Jakarta Sans bold.
2. **App title size:** stays at its current visual size (24px / `text-2xl`) inside the header bar — no layout change. The DESIGN.md hero scale (40-56px) is not used anywhere in this pass; only the font-family changes.
3. **Semantic tag:** the app title's `<span>` becomes a real `<h1>` (the page currently has no `<h1>` at all) — an accessibility fix bundled in because it touches the same element, not a new visual decision.
4. **Animation trigger scope:** the "land" entrance animation plays only for file cards that are added **after** the gallery has already mounted (real-time arrivals, including "load more" pagination). Cards present at the moment the gallery first renders its file list (including the initial fetch replacing the loading spinner) never animate — this is Vue's default `<TransitionGroup>` behavior when the `appear` prop is omitted, so it requires no extra guard code.
5. **Duration:** 350ms per card (resolves an internal inconsistency in `DESIGN.md`, which lists both "~500ms" in the Motion section prose and "medium 250-400ms (card land)" in the Duration scale table — 350ms was chosen after comparing both live in-browser).
6. **Stagger cap:** delay per card is `min(order-within-batch * 80ms, 400ms)` — order is scoped to cards entering in the same burst, not the card's absolute position in the full file list, so a card arriving alone into a long existing list never inherits a large delay.
7. **Reduced motion:** under `prefers-reduced-motion: reduce`, the land animation is skipped entirely — cards appear immediately at full opacity, no transform.

## Architecture

### 1. Font token

`frontend/src/style.css`, inside the existing `@theme` block, add:

```css
--font-display: 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif;
```

Tailwind 4 auto-generates a `font-display` utility class from this `--font-*` token, following the same pattern already used for `--color-*` tokens elsewhere in this file.

### 2. AppHeader title

In `frontend/src/components/AppHeader.vue`, the title row changes from:

```html
<div class="flex items-center gap-3 text-2xl font-semibold">
  <span class="text-4xl">📋</span>
  <span>{{ t('app.title') }}</span>
</div>
```

to:

```html
<div class="flex items-center gap-3 text-2xl">
  <span class="text-4xl" aria-hidden="true">📋</span>
  <h1 class="font-display font-bold text-2xl m-0">{{ t('app.title') }}</h1>
</div>
```

- `font-bold` (700) replaces `font-semibold` (600) because Cabinet Grotesk is only loaded at weights 500/700/800 — 600 doesn't exist as a real cut and would render as a synthetic/faux bold.
- `m-0` is defensive; the global reset (`* { margin: 0 }` in `style.css`) already zeroes `<h1>` margin, but being explicit here avoids relying on the global reset for a semantic element that browsers otherwise give a default margin to.
- The emoji gets `aria-hidden="true"` since it's decorative and shouldn't be read by screen readers as part of the heading text.

No other component's headings change in this pass.

### 3. Land animation

In `frontend/src/components/FileGallery.vue`, only the file-card loop is wrapped:

```html
<TransitionGroup name="card-land" @before-enter="onCardBeforeEnter">
  <FileCard
    v-for="file in files"
    :key="fileKey(file)"
    :file="file"
    ...
  />
</TransitionGroup>
```

`FileUploadSection` and `PasteSection` stay outside the `TransitionGroup`, as plain siblings in the grid `<div>`, exactly as today — they don't need transition keys since they never enter/leave after initial mount. `TransitionGroup` renders no wrapper element when `tag` is omitted (Vue 3 default), so the CSS Grid (`grid-template-columns: repeat(auto-fill,minmax(220px,1fr))`) on the parent `<div>` is unaffected.

**Stagger counter (in `<script setup>`):**

```js
let enterOrder = 0
let resetTimer = null

function onCardBeforeEnter(el) {
  el.style.transitionDelay = `${Math.min(enterOrder * 80, 400)}ms`
  enterOrder++
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => { enterOrder = 0 }, 50)
}
```

All elements entering in the same synchronous render flush call `onBeforeEnter` before any timer fires, so they share a contiguous `0, 1, 2, ...` sequence; the 50ms trailing reset means the next unrelated arrival (e.g. a single file minutes later) starts back at 0 instead of inheriting a stale offset.

**CSS (`frontend/src/style.css` or a scoped `<style>` block in `FileGallery.vue`):**

```css
.card-land-enter-active {
  transition: transform 350ms cubic-bezier(.34,1.56,.64,1), opacity 350ms cubic-bezier(.34,1.56,.64,1);
}
.card-land-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.85);
}

@media (prefers-reduced-motion: reduce) {
  .card-land-enter-active {
    transition: none;
  }
}
```

Using `transition` (not `@keyframes`) matches how `<TransitionGroup>` toggles `-enter-from`/`-enter-active` classes and makes the per-card `transitionDelay` set in `onCardBeforeEnter` apply directly without needing `animation-delay` + `animation-fill-mode` bookkeeping.

**Known implementation risk:** `FileCard.vue` currently renders two root nodes — the visible card `<div>` and a sibling `<Teleport to="body">` for its QR modal. `<TransitionGroup>` expects each keyed child to resolve to a single root for its enter/move bookkeeping. During implementation, verify in the browser that the land animation and any list-reflow (move) animation behave correctly with this multi-root shape. If Vue warns or the animation misbehaves, move the `<Teleport>` to be nested inside the outer `<div>` (Teleport can live anywhere in the template — this only changes its position in the source tree, not where its content actually renders) so `FileCard` becomes single-root.

## Testing

- `AppHeader.test.js`: existing tests use `stubs` for child components and query by class (`.header-qr-button`, etc.), not by tag, so they should be unaffected by the `span` → `h1` change. Add one assertion that `find('h1').text()` contains the title, to lock in the semantic fix.
- `FileGallery.test.js`: existing tests stub `FileCard` with a minimal template and query via `findAllComponents({ name: 'FileCard' })`, which still works when `FileCard` is nested inside a `TransitionGroup`. Add a test that mounts with an initial `files` array, then updates props with one extra file, and asserts the newly-added card's root element receives the `card-land-enter-from`/`enter-active` transition classes at some point (Vue Test Utils can assert this via `wrapper.vm.$nextTick()` timing, or by checking the class list synchronously right after the prop change before the transition clears) — if reliably testing transition-class timing proves flaky, a simpler acceptable substitute is asserting `onCardBeforeEnter`'s stagger math directly as a unit-testable function extracted from the component, or asserting the resulting `el.style.transitionDelay` value.
- No backend changes; no new REST/Socket.IO events.

## Out of scope (unchanged)

- Modal heading fonts (h1-h4 elsewhere) — stay Plus Jakarta Sans.
- `ConnectedDevices.vue` presence indicator, the segmented scope tab control, and the Share Sheet confirmation UX — separate follow-up plans per the foundation plan's "What's next" list.
