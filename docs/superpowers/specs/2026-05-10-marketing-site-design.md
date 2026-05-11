# AxiBridge Marketing Site — Design Spec

**Date:** 2026-05-10
**Status:** Approved (pending user review of this file)
**Owner:** darkharasho

## Goal

Ship a single-page marketing landing site for AxiBridge, hosted via GitHub Pages, that explains what the app does, shows it in action, and drives downloads.

## Hosting

- **Source path:** `/docs/` on the `main` branch of `darkharasho/axibridge`.
- **Public URL:** `https://darkharasho.github.io/axibridge/`.
- GitHub Pages is configured to serve from `main` → `/docs`.
- `.nojekyll` file present to disable Jekyll preprocessing.
- No custom domain at launch (room left for one via `CNAME` file later).

## Tech approach

- Hand-rolled static `index.html` + `styles.css` + `main.js`. No build step, no framework.
- Tailwind is NOT used here (the app uses it, but adding a build step for a one-page site isn't worth it). Plain CSS with custom properties.
- Google Fonts CDN for typography (Inter + Space Grotesk).
- All dynamic content is fetched client-side from GitHub's public REST API with graceful fallbacks.

## Visual language — "Arcane Glass"

Echoes the app's Lillifox/Arcane theme so the site feels of-a-piece with the product.

- **Background:** layered radial gradients on `#0a0418`:
  - violet bloom `#6d4cff` top-left
  - cyan bloom `#3b82f6` bottom-right
  - two large blurred orbs (`filter: blur(80px)`) drifting on a 30s CSS animation; animation pauses for `prefers-reduced-motion: reduce`.
- **Cards / surfaces:** `rgba(255, 255, 255, 0.05)` fill, 1px `rgba(255, 255, 255, 0.1)` border, `backdrop-filter: blur(12px)`, soft purple glow (`box-shadow: 0 0 40px rgba(140, 100, 255, 0.15)`) on hover.
- **Accent gradient:** `linear-gradient(135deg, #8e63ff 0%, #5b9dff 100%)` on CTAs and highlight spans.
- **Typography:**
  - Display: Space Grotesk 700/800, generous tracking, large hero size (clamp 2.5rem → 5rem).
  - Body: Inter 400/500, 16px base, 1.6 line-height.
- **Responsive:** single-column below 768px. Hero CTAs stack. Gallery becomes a vertical stack.
- **Accessibility:** color contrast ≥ AA on text, focus rings on all interactive elements, `prefers-reduced-motion` disables orb drift and any scroll-triggered transitions.

## Page sections (single-page scroll with anchor nav)

### 1. Sticky glass nav
- Logo (left) + section links (Features, How it works, FAQ) + GitHub link + primary Download CTA (right).
- Frosted glass effect, becomes slightly more opaque on scroll past hero.

### 2. Hero
- Centered logo mark + wordmark.
- Headline: **"WvW fights, made readable."** (with gradient span on "readable")
- Subhead: one sentence — auto-uploads arcdps logs, summarizes WvW fights, posts to Discord or the web.
- Two CTAs side-by-side:
  - **Primary:** `Download for Windows` — links to latest `.exe` asset
  - **Secondary:** `Download for Linux` — links to latest `.AppImage` asset
  - Version label below: `v{X.Y.Z} • released {date}` (filled by JS)
- Below CTAs: a hero screenshot floating on a glass card with subtle tilt and glow.

### 3. Feature highlights (5 cards)
Each card: small icon/emoji, title, 1-2 sentence description, one screenshot.

1. **Automatic uploads** — Watch your arcdps log folder; every fight uploads to dps.report automatically.
2. **WvW fight breakdowns** — Squad vs enemy sizes, damage, downs/deaths, cleanses, strips, stability, healing.
3. **Rankings & MVPs** — Top performers by role and stat across your sessions.
4. **Discord-ready summaries** — Clean embeds or shareable report images, posted to your server.
5. **Persistent web reports** — Publish a GitHub Pages report your squad can revisit anytime.

### 4. How it works (3 numbered steps)
1. **Point at your logs** — Set your `arcdps.cbtlogs` folder in Configuration.
2. **Fights upload automatically** — AxiBridge watches the folder and processes each new log.
3. **Share with your squad** — Post a Discord embed or publish a persistent web report.

### 5. Live demo
- Glass card with a brief intro ("This is a real published report.") and a large CTA button:
- Link: `https://gw2eww.github.io/fight-reports/?report=20260420-180655-8lt2`
- Opens in a new tab. No iframe (web reports are wide and don't embed cleanly).

### 6. Screenshot gallery
- 4-6 screenshots in a responsive grid (3 columns desktop, 2 tablet, 1 mobile).
- Click any thumbnail → lightbox overlay with the full-size image. Close on Esc, click outside, or X button. Vanilla JS, no library.
- Source images live in `docs/assets/screenshots/`, exported as WebP (with PNG fallback if needed).

### 7. FAQ
Five `<details>` accordions:
- **Is it safe to use?** — Yes; reads arcdps log files on disk, uploads to dps.report. Doesn't read or write game memory. Open source under GPL-3.0.
- **Does it touch the game?** — No. It only watches a folder for new files arcdps produces.
- **What's arcdps?** — Standard third-party combat logging addon used by virtually every WvW/raid squad. Link to deltaconnected.com.
- **Where do my logs go?** — To dps.report (the public log host). AxiBridge doesn't collect or transmit anything else.
- **Is it free?** — Yes. GPL-3.0 licensed, no telemetry, no accounts.

### 8. Changelog
- Section heading: "What's new"
- Renders the latest 5 GitHub releases as glass cards: tag, date, first ~3 lines of the release body.
- "View all releases →" link to `https://github.com/darkharasho/axibridge/releases`.

### 9. Footer
- Three columns on desktop, stacked on mobile:
  - **Project:** GitHub, Releases, License (GPL-3.0)
  - **Community:** Discord (`https://discord.gg/UjzMXMGXEg`), Issues, Discussions
  - **About:** Privacy note (logs go to dps.report; no other data collected), Attribution (PlenBot, GW2 EI Log Combiner)
- Bottom strip: "© 2026 harasho • Not affiliated with ArenaNet"

## Dynamic data (client-side fetch)

All fetches are best-effort with text fallbacks if they fail (no spinners, no error banners).

### `fetchLatestRelease()`
- `GET https://api.github.com/repos/darkharasho/axibridge/releases/latest`
- Updates:
  - Windows download button → asset matching `\.exe$`
  - Linux download button → asset matching `\.AppImage$`
  - Version label → `tag_name` + formatted `published_at`
- On failure: buttons remain as static links to `/releases/latest`.

### `fetchRecentReleases()`
- `GET https://api.github.com/repos/darkharasho/axibridge/releases?per_page=5`
- Renders 5 release cards in the changelog section.
- On failure: render a single fallback card with a link to the releases page.

GitHub's unauthenticated API limit (60 req/hr/IP) is plenty for a marketing page.

## File layout

```
docs/
  index.html              ← marketing page
  styles.css              ← all CSS
  main.js                 ← lightbox + GitHub API fetches
  .nojekyll               ← disables Jekyll
  assets/
    logo.svg              ← copied from public/svg/AxiBridge-white.svg
    favicon.svg
    og-image.png          ← 1200x630 social card
    screenshots/
      hero.webp
      stats-dashboard.webp
      configuration.webp
      discord-embed.webp
      web-report.webp
  superpowers/specs/      ← (already exists, unrelated)
```

## Out of scope (deliberately)

- No analytics, no cookies, no consent banner.
- No CMS, no React, no build step.
- No newsletter, no contact form.
- No internationalization.
- No dark/light toggle (the site is dark-only by design).

## Open follow-ups (post-launch, not in this spec)

- Custom domain (e.g., `axibridge.app`) — add `CNAME` if/when acquired.
- OG image creation (1200x630) — placeholder OK at launch, swap later.
- Social card preview check (Twitter, Discord, Mastodon).

## Acceptance criteria

- `docs/index.html` renders the full single-page site at `https://darkharasho.github.io/axibridge/`.
- All anchor links scroll to their sections.
- Download buttons populate from the latest GitHub release; version label updates.
- Changelog renders 5 most recent releases.
- Lightbox opens on screenshot click; closes on Esc, X, or outside-click.
- FAQ accordions expand/collapse.
- Responsive at 360px, 768px, 1280px, 1920px viewports.
- No JS console errors.
- Passes basic Lighthouse a11y + best-practices (≥ 90).
