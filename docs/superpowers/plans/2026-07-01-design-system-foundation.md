# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the coral design system from [`DESIGN.md`](../../../DESIGN.md) to the shared Tailwind theme layer so every component inherits the new palette and fonts automatically, and fix the existing bug where the "우리 네트워크" (ip) and "전체 공유" (global) share-scope buttons render with the identical color.

**Architecture:** Tailwind CSS 4's `@theme` block in `frontend/src/style.css` auto-generates utility classes (`bg-primary`, `text-primary`, `bg-surface`, ...) from CSS custom properties. Nearly every component already consumes these semantic utilities rather than raw Tailwind colors, so updating the token values in one file cascades everywhere with no per-component edits — except `FileUploadSection.vue`, which currently hard-codes `bg-primary` for *both* scope buttons (a real bug: the two scopes are visually indistinguishable today). We fix that by introducing a second token, `--color-scope-global`, and pointing the global button at it. We also swap the `Inter` webfont for the DESIGN.md type stack and sync the pre-mount critical CSS in `index.html` so the very first paint (before Vue/Tailwind CSS loads) already matches, avoiding a flash of the old dark-green theme.

This is the foundation layer only. It does not touch per-component layout, the "land" spring-bounce feed animation, the presence-avatar row, or the deferred Share Sheet confirmation UX — those depend on these tokens existing and will be separate follow-up plans.

**Tech Stack:** Vue 3 (Composition API), Tailwind CSS 4, Vite 7, Vitest + Vue Test Utils.

**Radius/spacing note (no code change needed):** Tailwind's built-in scale already covers `DESIGN.md`'s spacing (8px base) and radius scale closely enough — use `rounded-lg` for small elements (DESIGN.md "sm"), `rounded-2xl` for cards/frames (DESIGN.md "md"/"lg"), and `rounded-full` for pills and primary buttons. Future component tasks should follow this mapping instead of inventing new radius tokens.

---

### Task 1: Replace color tokens with the DESIGN.md palette

**Files:**
- Modify: `frontend/src/style.css:1-35`

- [ ] **Step 1: Replace the theme token block**

Replace lines 1-35 of `frontend/src/style.css` (the `@import`, the `[data-theme="light"]` block, the `:root`/`[data-theme="dark"]` block, and the `@theme` block) with:

```css
@import "tailwindcss";

/* Light Theme - 코랄 웜톤 */
[data-theme="light"],
body.light {
  --color-background: #FAF8F5;
  --color-surface: #FFFFFF;
  --color-primary: #FF6B4A;
  --color-text-primary: #2A2622;
  --color-text-secondary: #8A8178;
  --color-border: #E9E3DA;
  --color-scope-global: #4F8767;
  --color-scope-global-tint: #E4EEE7;
}

/* Dark Theme - 웜 뉴트럴 (기본값) */
:root,
[data-theme="dark"],
body.dark {
  --color-background: #1C1917;
  --color-surface: #262220;
  --color-primary: #FF7A5C;
  --color-text-primary: #F2EDE7;
  --color-text-secondary: #A69A8D;
  --color-border: #3A3430;
  --color-scope-global: #6FAE8A;
  --color-scope-global-tint: #223026;
}

@theme {
  --color-background: #1C1917;
  --color-surface: #262220;
  --color-primary: #FF7A5C;
  --color-text-primary: #F2EDE7;
  --color-text-secondary: #A69A8D;
  --color-border: #3A3430;
  --color-scope-global: #6FAE8A;
  --color-scope-global-tint: #223026;
}
```

Note: this drops `--color-hover`, which was defined in both old theme blocks but never consumed by any component (`grep -rn "bg-hover\|color-hover" frontend/src` outside `style.css` returns nothing) — dead token, not carried forward.

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no CSS/PostCSS errors (Tailwind will regenerate `bg-primary`, `text-primary`, `bg-scope-global`, etc. from the new custom properties automatically).

- [ ] **Step 3: Visual sanity check**

Run: `cd frontend && npm run dev`, open the app in a browser, toggle light/dark mode with the existing theme button, and confirm the background/surface/primary colors are now warm coral tones instead of the old dark-green (`#42b883`) theme in both modes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(frontend): apply coral design system color tokens"
```

---

### Task 2: Fix the share-scope buttons to use distinct colors per scope

**Files:**
- Modify: `frontend/src/components/FileUploadSection.vue:116,126`
- Test: `frontend/src/components/FileUploadSection.test.js`

**Context:** Both scope buttons currently bind `:class="scope === 'ip' ? 'bg-primary text-white' : ...'"` and `:class="scope === 'global' ? 'bg-primary text-white' : ...'"` (lines 117 and 127) — when either scope is active, both use the exact same `bg-primary` class, so a user can't tell which scope they're in from color alone. `DESIGN.md`'s "Scope color" section requires `global` to use the dedicated `--color-scope-global` token specifically so switching scopes is visually unmissable.

- [ ] **Step 1: Write the failing test**

Add this test to the `공유 스코프 토글` describe block in `frontend/src/components/FileUploadSection.test.js` (after the existing three tests, before its closing `})` on line 40):

```javascript
    it('전체 공유 버튼은 우리 네트워크 버튼과 다른 색상 클래스를 사용한다', async () => {
      const wrapper = mount(FileUploadSection, mountOptions)
      const buttons = wrapper.findAll('[role="group"] button')

      expect(buttons[0].classes()).toContain('bg-primary')

      await buttons[1].trigger('click')

      expect(buttons[1].classes()).toContain('bg-scope-global')
      expect(buttons[1].classes()).not.toContain('bg-primary')
    })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run FileUploadSection`
Expected: FAIL — `buttons[1].classes()` contains `bg-primary`, not `bg-scope-global`.

- [ ] **Step 3: Update the button classes**

In `frontend/src/components/FileUploadSection.vue`, line 117 (the `ip` button) is unchanged — it keeps `bg-primary` since `ip` stays coral. Change line 127 (the `global` button) from:

```html
          :class="scope === 'global' ? 'bg-primary text-white' : 'bg-white/20 text-white/80 hover:bg-white/30'"
```

to:

```html
          :class="scope === 'global' ? 'bg-scope-global text-white' : 'bg-white/20 text-white/80 hover:bg-white/30'"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run FileUploadSection`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FileUploadSection.vue frontend/src/components/FileUploadSection.test.js
git commit -m "fix(frontend): give global share scope its own color, distinct from ip scope"
```

---

### Task 3: Swap fonts and sync pre-mount critical CSS

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/style.css:44-51` (the `body` rule inside `@layer base`)

**Context:** The app currently loads only `Inter` (a font `DESIGN.md` explicitly avoids as overused) and the pre-mount skeleton in `index.html` hard-codes the *old* dark-green theme's colors and `Inter` font-family — so users see a flash of the wrong theme before Vue mounts and Tailwind's stylesheet takes over.

- [ ] **Step 1: Replace the font preconnect/link tags in `index.html`**

Replace these lines in `frontend/index.html` (in the `<head>`, currently reading):

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" href="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2" as="font" type="font/woff2" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

with:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://api.fontshare.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
    <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update the critical inline CSS in `index.html`**

Replace this block in `frontend/index.html` (inside the `<style>` tag added for LCP optimization):

```css
      :root {
        --color-background: #1a1a1a;
        --color-surface: #2a2a2a;
        --color-text-primary: #e0e0e0;
        --color-text-secondary: #a0a0a0;
        --color-border: #3a3a3a;
      }

      body {
        background-color: var(--color-background);
        color: var(--color-text-primary);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        transition: background-color 0.3s ease, color 0.3s ease;
      }
```

with:

```css
      :root {
        --color-background: #1C1917;
        --color-surface: #262220;
        --color-text-primary: #F2EDE7;
        --color-text-secondary: #A69A8D;
        --color-border: #3A3430;
      }

      body {
        background-color: var(--color-background);
        color: var(--color-text-primary);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        transition: background-color 0.3s ease, color 0.3s ease;
      }
```

(Only `--color-background`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, and the `body` rule's `font-family` change; everything else in that `<style>` block — the skeleton layout rules — stays as-is.)

- [ ] **Step 3: Update the body font-family in `style.css`**

In `frontend/src/style.css`, inside the `@layer base { body { ... } }` rule, change:

```css
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

to:

```css
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Visual sanity check**

Run: `cd frontend && npm run dev`, open the app, hard-reload (to see the pre-mount skeleton), and confirm: (a) no flash of the old dark-green/Inter theme before the app mounts, (b) body text now renders in Plus Jakarta Sans (check via devtools computed font-family on a `<p>`), (c) headings that reference `font-family: 'Cabinet Grotesk'` (added in a later component-level plan) would resolve — for now just confirm the Fontshare stylesheet request in the Network tab returns 200.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/style.css
git commit -m "feat(frontend): swap Inter for Plus Jakarta Sans/Geist/Cabinet Grotesk, sync pre-mount CSS"
```

---

## What's next (separate follow-up plans, not part of this one)

- Apply `Cabinet Grotesk` to actual heading elements and the "land" spring-bounce feed animation to `FileGallery.vue`/`FileCard.vue`.
- Replace the presence indicator in `ConnectedDevices.vue` with the overlapping-avatar row described in `DESIGN.md`.
- Add the `우리 네트워크` / `전체 공유` segmented tab control to the main room screen (currently the scope choice only lives inside the upload card's hover overlay).
- Design and implement the deferred Share Sheet confirmation UX (see `DESIGN.md`'s "Open Design Question").
