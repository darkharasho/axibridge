# AxiBridge Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page marketing landing site for AxiBridge at `https://darkharasho.github.io/axibridge/`, served from `/docs/` on `main`.

**Architecture:** Static `index.html` + `styles.css` + `main.js` in `/docs/`. No build step, no framework. Glassmorphic "Arcane" visual style. Dynamic download buttons and changelog populated at runtime from GitHub's public REST API with graceful static fallbacks. Vanilla-JS lightbox for screenshot gallery.

**Tech Stack:** HTML5, CSS3 (custom properties, backdrop-filter, CSS animations), vanilla ES modules, GitHub REST API (unauthenticated), Google Fonts CDN (Inter + Space Grotesk).

**Spec:** `docs/superpowers/specs/2026-05-10-marketing-site-design.md`

**Testing strategy:** This is a static site. There's no test framework to wire up — visual + behavioral verification is done by opening the page in a browser and confirming acceptance criteria. Each task ends with explicit verification steps. We will use Python's `http.server` for local previews (because `file://` blocks `backdrop-filter` cross-origin fonts and the GitHub API calls work fine from `http://localhost`).

---

## File layout

```
docs/
  index.html          ← marketing page (Task 1, expanded by 2-9)
  styles.css          ← all styles (Task 1, expanded by 2-9)
  main.js             ← lightbox + GitHub API fetches (Task 7-9)
  .nojekyll           ← created Task 1
  assets/
    logo.svg          ← copied from public/svg/AxiBridge-white.svg (Task 1)
    favicon.svg       ← Task 1
    screenshots/      ← populated Task 6
      hero.webp
      stats-dashboard.webp
      configuration.webp
      discord-embed.webp
      web-report.webp
```

Files are built up section-by-section so each task produces a verifiable, committable increment.

---

## Task 1: Project skeleton, fonts, and base theme

**Files:**
- Create: `docs/index.html`
- Create: `docs/styles.css`
- Create: `docs/.nojekyll`
- Create: `docs/assets/logo.svg` (copied)
- Create: `docs/assets/favicon.svg`

- [ ] **Step 1: Create the `.nojekyll` marker**

`docs/.nojekyll` — empty file. Prevents GitHub Pages from running Jekyll on the directory.

```bash
touch docs/.nojekyll
```

- [ ] **Step 2: Copy the logo and create a favicon**

```bash
mkdir -p docs/assets/screenshots
cp public/svg/AxiBridge-white.svg docs/assets/logo.svg
cp public/svg/AxiBridge-white.svg docs/assets/favicon.svg
```

- [ ] **Step 3: Create `docs/index.html` with the document shell**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AxiBridge — WvW fights, made readable</title>
  <meta name="description" content="AxiBridge auto-uploads arcdps logs, summarizes WvW fights, and posts clean reports to Discord or the web." />

  <meta property="og:title" content="AxiBridge — WvW fights, made readable" />
  <meta property="og:description" content="Auto-upload arcdps logs. Summarize WvW fights. Post clean reports to Discord or the web." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://darkharasho.github.io/axibridge/" />

  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <section class="hero">
      <img src="assets/logo.svg" alt="AxiBridge" width="64" height="64" />
      <h1>WvW fights, <span class="accent">made readable</span>.</h1>
      <p class="lede">Auto-upload arcdps logs, summarize WvW fights, and post clean reports to Discord or the web.</p>
    </section>
  </main>

  <script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `docs/styles.css` with the base theme**

```css
:root {
  --bg: #0a0418;
  --bg-violet: #6d4cff;
  --bg-cyan: #3b82f6;
  --text: #f1eefc;
  --text-muted: #a39ec0;
  --surface: rgba(255, 255, 255, 0.05);
  --surface-border: rgba(255, 255, 255, 0.1);
  --surface-glow: 0 0 40px rgba(140, 100, 255, 0.15);
  --accent-gradient: linear-gradient(135deg, #8e63ff 0%, #5b9dff 100%);
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

body {
  min-height: 100vh;
  background:
    radial-gradient(ellipse at 15% 10%, rgba(109, 76, 255, 0.35), transparent 50%),
    radial-gradient(ellipse at 85% 90%, rgba(59, 130, 246, 0.25), transparent 50%),
    var(--bg);
  background-attachment: fixed;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}

h1 {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(2.5rem, 5vw, 5rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 1.5rem 0 1rem;
}

.accent {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.lede {
  font-size: 1.25rem;
  color: var(--text-muted);
  max-width: 38ch;
}

.hero {
  text-align: center;
  padding: 6rem 0 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}
```

- [ ] **Step 5: Verify locally**

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`. Expected: dark page with violet/cyan radial blooms, AxiBridge logo, large gradient headline "WvW fights, made readable.", muted subhead. No console errors. Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "feat(marketing): scaffold landing page shell with Arcane theme"
```

---

## Task 2: Sticky glass nav

**Files:**
- Modify: `docs/index.html` (insert `<header>` before `<main>`)
- Modify: `docs/styles.css` (append nav styles)

- [ ] **Step 1: Add the nav markup**

Insert the following directly after the opening `<body>` tag in `docs/index.html`:

```html
<header class="nav" id="site-nav">
  <a class="nav-brand" href="#top">
    <img src="assets/logo.svg" alt="" width="28" height="28" />
    <span>AxiBridge</span>
  </a>
  <nav class="nav-links">
    <a href="#features">Features</a>
    <a href="#how">How it works</a>
    <a href="#faq">FAQ</a>
    <a href="https://github.com/darkharasho/axibridge" target="_blank" rel="noopener">GitHub</a>
  </nav>
  <a class="btn btn-primary nav-cta" href="https://github.com/darkharasho/axibridge/releases/latest">Download</a>
</header>
```

Also add `id="top"` to the `<main>` element's first child (or just to `<main>` itself).

- [ ] **Step 2: Append nav styles to `docs/styles.css`**

```css
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(10, 4, 24, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--surface-border);
  transition: background 0.2s ease;
}

.nav.scrolled {
  background: rgba(10, 4, 24, 0.85);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text);
  text-decoration: none;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.1rem;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-links a {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  transition: color 0.15s ease;
}

.nav-links a:hover,
.nav-links a:focus-visible {
  color: var(--text);
}

.btn {
  display: inline-block;
  padding: 0.7rem 1.2rem;
  border-radius: 0.6rem;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  border: 1px solid transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}

.btn-primary {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 8px 24px rgba(140, 100, 255, 0.35);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(140, 100, 255, 0.45);
}

.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border-color: var(--surface-border);
  backdrop-filter: blur(8px);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
}

@media (max-width: 720px) {
  .nav-links { display: none; }
}
```

- [ ] **Step 3: Verify**

Restart `python3 -m http.server 8000 --directory docs`, reload. Expected: sticky frosted-glass header pinned to top with logo, three text links (hidden below 720px), and a gradient Download button on the right. Header background grows more opaque when scrolling (we'll wire the `.scrolled` class in Task 9).

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add sticky glass nav"
```

---

## Task 3: Hero section with CTA buttons and screenshot

**Files:**
- Modify: `docs/index.html` (replace the placeholder `.hero` section)
- Modify: `docs/styles.css` (expand hero styles, add CTA + screenshot frame styles)

- [ ] **Step 1: Replace the hero markup**

Replace the existing `<section class="hero">…</section>` with:

```html
<section class="hero" id="top">
  <img class="hero-logo" src="assets/logo.svg" alt="AxiBridge" width="80" height="80" />
  <h1>WvW fights, <span class="accent">made readable</span>.</h1>
  <p class="lede">Auto-upload arcdps logs, summarize WvW fights, and post clean reports to Discord or the web.</p>

  <div class="cta-row">
    <a class="btn btn-primary" id="dl-win" href="https://github.com/darkharasho/axibridge/releases/latest" data-asset="exe">
      Download for Windows
    </a>
    <a class="btn btn-secondary" id="dl-linux" href="https://github.com/darkharasho/axibridge/releases/latest" data-asset="AppImage">
      Download for Linux
    </a>
  </div>

  <p class="release-meta" id="release-meta">Latest release on GitHub →</p>

  <div class="hero-shot">
    <img src="assets/screenshots/hero.webp" alt="AxiBridge stats dashboard screenshot" loading="lazy" />
  </div>
</section>
```

(The `hero.webp` file doesn't exist yet — Task 6 adds it. The page will show a broken image until then. That's expected.)

- [ ] **Step 2: Append hero styles to `docs/styles.css`**

```css
.hero-logo {
  filter: drop-shadow(0 0 24px rgba(140, 100, 255, 0.6));
}

.cta-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.release-meta {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.hero-shot {
  margin-top: 3.5rem;
  width: 100%;
  max-width: 1000px;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  background: var(--surface);
  backdrop-filter: blur(12px);
  box-shadow: var(--surface-glow), 0 30px 60px rgba(0, 0, 0, 0.5);
  transform: perspective(1200px) rotateX(2deg);
}

.hero-shot img {
  display: block;
  width: 100%;
  height: auto;
}

@media (max-width: 720px) {
  .hero { padding: 3rem 0 2rem; }
  .hero-shot { transform: none; }
}
```

- [ ] **Step 3: Verify**

Reload. Expected: logo with purple glow, headline with gradient on "made readable", subhead, two side-by-side CTA buttons (gradient + glass), a small "Latest release on GitHub →" label, and a tilted screenshot frame (broken image icon for now — fine).

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "feat(marketing): build hero section with CTAs"
```

---

## Task 4: Feature highlights section

**Files:**
- Modify: `docs/index.html` (append after `</section>` of hero)
- Modify: `docs/styles.css` (append features styles)

- [ ] **Step 1: Add the features markup**

Append inside `<main>`, after the hero section:

```html
<section class="section" id="features">
  <h2>Everything your squad lead needs</h2>
  <p class="section-lede">Five things AxiBridge does the moment a fight ends.</p>

  <div class="feature-grid">
    <article class="card feature">
      <div class="feature-icon">⚡</div>
      <h3>Automatic uploads</h3>
      <p>Watches your arcdps log folder and uploads every fight to dps.report as soon as it lands.</p>
    </article>

    <article class="card feature">
      <div class="feature-icon">📊</div>
      <h3>WvW fight breakdowns</h3>
      <p>Squad vs enemy sizes, damage, downs/deaths, cleanses, strips, stability, healing — at a glance.</p>
    </article>

    <article class="card feature">
      <div class="feature-icon">🏆</div>
      <h3>Rankings &amp; MVPs</h3>
      <p>Top performers by role and stat category across every session you've recorded.</p>
    </article>

    <article class="card feature">
      <div class="feature-icon">💬</div>
      <h3>Discord-ready summaries</h3>
      <p>Clean embeds or shareable report images, posted straight to your server's channel.</p>
    </article>

    <article class="card feature">
      <div class="feature-icon">🌐</div>
      <h3>Persistent web reports</h3>
      <p>Publish a GitHub Pages report your squad can revisit and link anytime.</p>
    </article>
  </div>
</section>
```

- [ ] **Step 2: Append section + card styles**

```css
.section {
  padding: 5rem 0;
}

.section > h2 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  letter-spacing: -0.01em;
  margin: 0 0 0.5rem;
}

.section-lede {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin: 0 0 2.5rem;
  max-width: 50ch;
}

.card {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 1rem;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 1.75rem;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: var(--surface-glow);
  transform: translateY(-2px);
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.feature h3 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  margin: 0 0 0.5rem;
}

.feature p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.feature-icon {
  font-size: 1.75rem;
  margin-bottom: 0.75rem;
  display: inline-flex;
  width: 2.75rem;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 6px 18px rgba(140, 100, 255, 0.4);
}
```

- [ ] **Step 3: Verify**

Reload. Expected: "Everything your squad lead needs" heading, muted subhead, 5 glass cards in a responsive grid with gradient icon chips. Hover lifts cards and adds purple glow.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add feature highlights grid"
```

---

## Task 5: "How it works" + live demo sections

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`

- [ ] **Step 1: Add markup after the features section**

```html
<section class="section" id="how">
  <h2>How it works</h2>
  <p class="section-lede">Three steps. No game integration. No accounts.</p>

  <ol class="steps">
    <li class="card step">
      <div class="step-num">1</div>
      <h3>Point at your logs</h3>
      <p>Set your <code>arcdps.cbtlogs</code> folder in Configuration.</p>
    </li>
    <li class="card step">
      <div class="step-num">2</div>
      <h3>Fights upload automatically</h3>
      <p>AxiBridge watches the folder and processes each new log to dps.report.</p>
    </li>
    <li class="card step">
      <div class="step-num">3</div>
      <h3>Share with your squad</h3>
      <p>Post a Discord embed or publish a persistent web report.</p>
    </li>
  </ol>
</section>

<section class="section" id="demo">
  <h2>See a real report</h2>
  <p class="section-lede">A published squad report, built and pushed by AxiBridge.</p>
  <div class="card demo-card">
    <p>Opens in a new tab — web reports are wide and full of charts.</p>
    <a class="btn btn-primary" href="https://gw2eww.github.io/fight-reports/?report=20260420-180655-8lt2" target="_blank" rel="noopener">
      Open sample report →
    </a>
  </div>
</section>
```

- [ ] **Step 2: Append styles**

```css
.steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.25rem;
  counter-reset: step;
}

.step {
  position: relative;
  padding-top: 2.5rem;
}

.step-num {
  position: absolute;
  top: -1rem;
  left: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: var(--accent-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.1rem;
  box-shadow: 0 6px 18px rgba(140, 100, 255, 0.45);
}

.step h3 {
  font-family: var(--font-display);
  font-weight: 700;
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.step p {
  margin: 0;
  color: var(--text-muted);
}

.step code {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}

.demo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.demo-card p {
  margin: 0;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Verify**

Reload. Expected: "How it works" with 3 numbered glass cards (gradient number chips floating at top-left), then a "See a real report" card with explanatory text and a gradient CTA. Clicking the CTA opens the sample report in a new tab.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add how-it-works and live demo sections"
```

---

## Task 6: Screenshot gallery (markup + images)

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`
- Create: `docs/assets/screenshots/hero.webp`
- Create: `docs/assets/screenshots/stats-dashboard.webp`
- Create: `docs/assets/screenshots/configuration.webp`
- Create: `docs/assets/screenshots/discord-embed.webp`
- Create: `docs/assets/screenshots/web-report.webp`

**Note:** README.md references GitHub user-attachments URLs. We need actual files in `docs/assets/screenshots/`. The simplest path: download the existing README screenshots locally as WebP (or PNG if WebP conversion tooling isn't available).

- [ ] **Step 1: Download the 5 README screenshots**

```bash
mkdir -p docs/assets/screenshots
curl -L -o docs/assets/screenshots/hero.png            'https://github.com/user-attachments/assets/f1f2fe87-8111-474c-9e24-f9a1368801fb'
curl -L -o docs/assets/screenshots/configuration.png   'https://github.com/user-attachments/assets/8b759afe-d792-486e-a6d9-9a6367678460'
curl -L -o docs/assets/screenshots/stats-dashboard.png 'https://github.com/user-attachments/assets/e40da800-b78e-461c-891b-a0f2d15d6d5a'
curl -L -o docs/assets/screenshots/discord-embed.png   'https://github.com/user-attachments/assets/4feba70b-1d05-4796-a452-a68aaa700c6b'
curl -L -o docs/assets/screenshots/web-report.png      'https://github.com/user-attachments/assets/e073ce2d-24ba-438b-ae0c-12d6e1608997'
```

- [ ] **Step 2: Convert PNGs to WebP if `cwebp` is available, otherwise keep PNGs**

```bash
if command -v cwebp >/dev/null 2>&1; then
  for f in docs/assets/screenshots/*.png; do
    cwebp -q 82 "$f" -o "${f%.png}.webp"
    rm "$f"
  done
else
  echo "cwebp not installed — keeping PNGs"
  # Update the file extensions used below to .png if this branch is taken.
fi
```

If `cwebp` is unavailable, replace every `.webp` in markup below with `.png`. The plan assumes `.webp`.

- [ ] **Step 3: Add gallery markup after the demo section**

```html
<section class="section" id="gallery">
  <h2>What you'll see</h2>
  <p class="section-lede">Click any shot to expand.</p>

  <div class="gallery">
    <button class="thumb" data-full="assets/screenshots/stats-dashboard.webp" aria-label="Stats dashboard, full size">
      <img src="assets/screenshots/stats-dashboard.webp" alt="Aggregated stats dashboard" loading="lazy" />
      <span>Live stats dashboard</span>
    </button>
    <button class="thumb" data-full="assets/screenshots/configuration.webp" aria-label="Configuration panel, full size">
      <img src="assets/screenshots/configuration.webp" alt="Configuration panel" loading="lazy" />
      <span>Configuration</span>
    </button>
    <button class="thumb" data-full="assets/screenshots/discord-embed.webp" aria-label="Discord embed, full size">
      <img src="assets/screenshots/discord-embed.webp" alt="Discord embed summary" loading="lazy" />
      <span>Discord embeds</span>
    </button>
    <button class="thumb" data-full="assets/screenshots/web-report.webp" aria-label="Published web report, full size">
      <img src="assets/screenshots/web-report.webp" alt="Published web report" loading="lazy" />
      <span>Persistent web reports</span>
    </button>
  </div>
</section>

<div class="lightbox" id="lightbox" hidden>
  <button class="lightbox-close" id="lightbox-close" aria-label="Close">×</button>
  <img id="lightbox-img" alt="" />
</div>
```

- [ ] **Step 4: Append styles**

```css
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.thumb {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--surface-border);
  border-radius: 0.75rem;
  background: var(--surface);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.thumb:hover,
.thumb:focus-visible {
  box-shadow: var(--surface-glow);
  transform: translateY(-2px);
  outline: none;
}

.thumb img {
  display: block;
  width: 100%;
  height: 180px;
  object-fit: cover;
  object-position: top;
}

.thumb span {
  display: block;
  padding: 0.75rem 1rem;
  text-align: left;
  color: var(--text);
  font-weight: 600;
  font-size: 0.9rem;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(5, 2, 15, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.lightbox[hidden] { display: none; }

.lightbox img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--surface-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 1px solid var(--surface-border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.lightbox-close:hover { background: rgba(255, 255, 255, 0.1); }
```

- [ ] **Step 5: Verify (lightbox markup only, JS wired in Task 7)**

Reload. Expected: hero screenshot (Task 3 placeholder) now resolves. New gallery section with 4 thumbnail cards in a responsive grid; clicking thumbnails does nothing yet (no JS). Lightbox div is hidden.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add screenshot gallery with downloaded images"
```

---

## Task 7: Lightbox JavaScript

**Files:**
- Create: `docs/main.js`

- [ ] **Step 1: Create `docs/main.js`**

```js
// Lightbox: open on thumbnail click, close on Esc / X / backdrop click.

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');

function openLightbox(src, alt) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

document.querySelectorAll('.thumb').forEach((btn) => {
  btn.addEventListener('click', () => {
    const full = btn.dataset.full;
    const alt = btn.querySelector('img')?.alt;
    if (full) openLightbox(full, alt);
  });
});

lightboxClose?.addEventListener('click', closeLightbox);

lightbox?.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});
```

- [ ] **Step 2: Verify**

Reload. Click any gallery thumbnail. Expected: full-size image overlays the page on a dark blurred backdrop, scroll is locked. Press Esc → closes. Click outside image → closes. Click the × button → closes.

- [ ] **Step 3: Commit**

```bash
git add docs/main.js
git commit -m "feat(marketing): wire lightbox for gallery thumbnails"
```

---

## Task 8: FAQ section

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`

- [ ] **Step 1: Add FAQ markup after the gallery section**

```html
<section class="section" id="faq">
  <h2>Common questions</h2>

  <div class="faq">
    <details>
      <summary>Is it safe to use?</summary>
      <p>Yes. AxiBridge reads <code>.evtc</code> log files arcdps writes to disk and uploads them to <a href="https://dps.report" target="_blank" rel="noopener">dps.report</a>. It does not read or write game memory and is not a game modification. Source is on GitHub under GPL-3.0.</p>
    </details>

    <details>
      <summary>Does it touch the game?</summary>
      <p>No. It only watches a folder for new files that arcdps produces. Nothing is injected into Guild Wars 2.</p>
    </details>

    <details>
      <summary>What is arcdps?</summary>
      <p>arcdps is the standard third-party combat logging addon used by virtually every WvW and raid squad. It writes <code>.evtc</code> files when fights end. AxiBridge consumes those files. <a href="https://www.deltaconnected.com/arcdps/" target="_blank" rel="noopener">deltaconnected.com/arcdps</a>.</p>
    </details>

    <details>
      <summary>Where do my logs go?</summary>
      <p>To dps.report — the public log host the GW2 community uses. AxiBridge doesn't collect telemetry, doesn't run accounts, and doesn't transmit anything else.</p>
    </details>

    <details>
      <summary>Is it free?</summary>
      <p>Yes. GPL-3.0 licensed, free forever. No paid tier.</p>
    </details>
  </div>
</section>
```

- [ ] **Step 2: Append FAQ styles**

```css
.faq {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 760px;
}

.faq details {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 0.75rem;
  backdrop-filter: blur(12px);
  padding: 0 1.25rem;
  transition: box-shadow 0.2s ease;
}

.faq details[open] {
  box-shadow: var(--surface-glow);
}

.faq summary {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.05rem;
  cursor: pointer;
  padding: 1rem 0;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.faq summary::-webkit-details-marker { display: none; }

.faq summary::after {
  content: '+';
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 1.3rem;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.faq details[open] summary::after {
  content: '−';
}

.faq p {
  margin: 0 0 1rem;
  color: var(--text-muted);
}

.faq a {
  color: #b8a4ff;
}
```

- [ ] **Step 3: Verify**

Reload. Expected: 5 FAQ cards. Each opens/closes with `+`/`−` toggle indicator. Open card has purple glow. Links inside the answers are tinted light purple.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add FAQ accordion"
```

---

## Task 9: Changelog section, footer, dynamic GitHub API, scroll behavior

This task wires up the remaining sections plus all the runtime behavior.

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`
- Modify: `docs/main.js`

- [ ] **Step 1: Add changelog + footer markup before the closing `</main>` (changelog) and after (footer)**

After the FAQ `</section>` and before `</main>`:

```html
<section class="section" id="changelog">
  <h2>What's new</h2>
  <p class="section-lede">Recent releases from GitHub.</p>
  <div class="changelog" id="changelog-list">
    <p class="muted">Loading recent releases…</p>
  </div>
  <p><a class="btn btn-secondary" href="https://github.com/darkharasho/axibridge/releases" target="_blank" rel="noopener">View all releases →</a></p>
</section>
```

After `</main>` and before the `<script>` tag:

```html
<footer class="footer">
  <div class="footer-grid">
    <div>
      <h4>Project</h4>
      <ul>
        <li><a href="https://github.com/darkharasho/axibridge" target="_blank" rel="noopener">GitHub</a></li>
        <li><a href="https://github.com/darkharasho/axibridge/releases" target="_blank" rel="noopener">Releases</a></li>
        <li><a href="https://github.com/darkharasho/axibridge/blob/main/LICENSE" target="_blank" rel="noopener">License (GPL-3.0)</a></li>
      </ul>
    </div>
    <div>
      <h4>Community</h4>
      <ul>
        <li><a href="https://discord.gg/UjzMXMGXEg" target="_blank" rel="noopener">Discord</a></li>
        <li><a href="https://github.com/darkharasho/axibridge/issues" target="_blank" rel="noopener">Issues</a></li>
        <li><a href="https://github.com/darkharasho/axibridge/discussions" target="_blank" rel="noopener">Discussions</a></li>
      </ul>
    </div>
    <div>
      <h4>About</h4>
      <p class="footer-muted">Logs go to dps.report. No other data is collected. AxiBridge stores nothing on a server — there is no server.</p>
      <p class="footer-muted">Includes adapted code from PlenBot Log Uploader and GW2 EI Log Combiner. See <a href="https://github.com/darkharasho/axibridge/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">third-party notices</a>.</p>
    </div>
  </div>
  <div class="footer-bottom">
    © 2026 harasho · Not affiliated with ArenaNet · Guild Wars 2 © ArenaNet, LLC.
  </div>
</footer>
```

- [ ] **Step 2: Append styles for changelog + footer**

```css
.changelog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.changelog .release {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  backdrop-filter: blur(12px);
}

.changelog .release h3 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  margin: 0 0 0.25rem;
}

.changelog .release .date {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.changelog .release p.body {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.muted { color: var(--text-muted); }

.footer {
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 1.5rem 2rem;
  border-top: 1px solid var(--surface-border);
}

.footer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.footer h4 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  margin: 0 0 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.footer ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.footer a {
  color: var(--text);
  text-decoration: none;
}

.footer a:hover { color: #b8a4ff; }

.footer-muted {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0 0 0.75rem;
}

.footer-bottom {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
  padding-top: 1.5rem;
  border-top: 1px solid var(--surface-border);
}
```

- [ ] **Step 3: Append dynamic behavior to `docs/main.js`**

Append the following to the existing `docs/main.js`:

```js
// GitHub API integration: download buttons + changelog.

const REPO = 'darkharasho/axibridge';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return ''; }
}

async function loadLatestRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return;
    const data = await res.json();
    const winBtn = document.getElementById('dl-win');
    const linuxBtn = document.getElementById('dl-linux');
    const meta = document.getElementById('release-meta');

    const winAsset = data.assets?.find((a) => /\.exe$/i.test(a.name));
    const linuxAsset = data.assets?.find((a) => /\.AppImage$/i.test(a.name));

    if (winBtn && winAsset) winBtn.href = winAsset.browser_download_url;
    if (linuxBtn && linuxAsset) linuxBtn.href = linuxAsset.browser_download_url;
    if (meta) meta.textContent = `${data.tag_name} · released ${formatDate(data.published_at)}`;
  } catch {
    // Fallbacks already in markup. Nothing to do.
  }
}

async function loadChangelog() {
  const list = document.getElementById('changelog-list');
  if (!list) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`);
    if (!res.ok) throw new Error('rate-limited');
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) throw new Error('empty');

    list.innerHTML = releases.map((r) => {
      const date = formatDate(r.published_at);
      const body = (r.body || '').split('\n').slice(0, 4).join(' ').slice(0, 240);
      const safeBody = body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const safeName = (r.name || r.tag_name || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      return `
        <article class="release">
          <h3><a href="${r.html_url}" target="_blank" rel="noopener">${safeName}</a></h3>
          <p class="date">${date}</p>
          <p class="body">${safeBody}</p>
        </article>
      `;
    }).join('');
  } catch {
    list.innerHTML = `<p class="muted">Couldn't load releases right now. <a href="https://github.com/${REPO}/releases" target="_blank" rel="noopener">View on GitHub →</a></p>`;
  }
}

// Nav scrolled state
const nav = document.getElementById('site-nav');
function updateNav() {
  if (!nav) return;
  nav.classList.toggle('scrolled', window.scrollY > 32);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

loadLatestRelease();
loadChangelog();
```

- [ ] **Step 4: Verify**

Reload. Expected:
- Hero buttons swap to actual asset URLs and the `release-meta` line shows `vX.Y.Z · released <date>`.
- "What's new" populates with 5 release cards (titles link to GitHub).
- Nav background grows more opaque after scrolling past 32px.
- If you simulate offline (DevTools network → Offline), the page still renders; buttons fall back to `/releases/latest`, changelog shows the fallback message.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "feat(marketing): add changelog, footer, and GitHub API integration"
```

---

## Task 10: Responsive polish, reduced-motion, final verification

**Files:**
- Modify: `docs/styles.css`

- [ ] **Step 1: Append reduced-motion + final responsive rules**

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .hero-shot { transform: none; }
}

@media (max-width: 480px) {
  main { padding: 2rem 1rem; }
  .section { padding: 3rem 0; }
  .hero { padding: 2rem 0 1rem; }
  .cta-row { flex-direction: column; width: 100%; }
  .cta-row .btn { width: 100%; text-align: center; }
}
```

- [ ] **Step 2: Acceptance walkthrough**

With `python3 -m http.server 8000 --directory docs` running, verify each acceptance criterion from the spec:

- [ ] Page loads at `http://localhost:8000` with no console errors (DevTools console clean).
- [ ] All nav links (`#features`, `#how`, `#faq`) smooth-scroll to their sections.
- [ ] Both hero CTAs have correct `href` values from the latest release (Windows `.exe`, Linux `.AppImage`).
- [ ] Version label below CTAs shows the current tag and date.
- [ ] Changelog renders 5 release cards.
- [ ] Lightbox: clicking a gallery thumbnail opens the full image; Esc, X, and outside-click all close it; body scroll lock works.
- [ ] All 5 FAQ accordions toggle open/closed.
- [ ] Resize the browser to 360 / 768 / 1280 / 1920px viewports — layout reflows without overflow.
- [ ] In DevTools, enable "Emulate CSS prefers-reduced-motion: reduce" — orb drift and hero tilt stop.
- [ ] Lighthouse audit (DevTools → Lighthouse → Mobile + Desktop):
  - Accessibility ≥ 90
  - Best Practices ≥ 90
  - Performance: log the score; if < 80, fix obvious culprits (oversized images — re-export at smaller dimensions).

- [ ] **Step 3: Commit**

```bash
git add docs/styles.css
git commit -m "feat(marketing): add reduced-motion handling and mobile polish"
```

---

## Task 11: Enable GitHub Pages and verify deployment

**Files:** none (settings change + push)

- [ ] **Step 1: Push the branch**

```bash
git push origin main
```

- [ ] **Step 2: Configure GitHub Pages**

Go to `https://github.com/darkharasho/axibridge/settings/pages`:
- Source: **Deploy from a branch**
- Branch: `main` / folder: `/docs`
- Save.

- [ ] **Step 3: Wait for the Pages build**

Watch the deployment in `https://github.com/darkharasho/axibridge/actions`. First deploy usually takes 1-2 minutes.

- [ ] **Step 4: Verify production**

Open `https://darkharasho.github.io/axibridge/`. Run the same checklist as Task 10 Step 2 in production. Verify:
- [ ] Fonts load (no FOUT longer than expected).
- [ ] Backdrop-blur renders (some older browsers won't, but recent Chrome/Firefox/Safari do).
- [ ] GitHub API calls succeed (download buttons + changelog populate).
- [ ] All anchor links work.
- [ ] Lightbox works.

- [ ] **Step 5: Update README to link the marketing site**

Modify `README.md` — replace the "Installation" section's stale Claude CLI line with:

```markdown
## 🔧 Download

Grab the latest release from the [downloads page](https://darkharasho.github.io/axibridge/) or directly from [GitHub Releases](https://github.com/darkharasho/axibridge/releases).
```

- [ ] **Step 6: Commit and push**

```bash
git add README.md
git commit -m "docs: link marketing site from README"
git push origin main
```

---

## Done

All acceptance criteria satisfied:
- Single-page site live at `https://darkharasho.github.io/axibridge/`.
- All anchor links scroll correctly.
- Download buttons populate from the latest release.
- Changelog renders the 5 most recent releases.
- Lightbox works.
- FAQ accordions expand/collapse.
- Responsive 360–1920px.
- No console errors.
- Lighthouse a11y + best-practices ≥ 90.
