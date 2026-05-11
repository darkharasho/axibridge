// =========================================================
// AxiBridge — main.js
// =========================================================

// ---------------------------------------------------------
// Lightbox: open on thumbnail click, close on Esc / X / backdrop click.
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// FAQ: swap [+] / [−] indicator on open/close
// ---------------------------------------------------------
document.querySelectorAll('.faq details').forEach((detail) => {
  const indicator = detail.querySelector('.faq-indicator');
  if (!indicator) return;

  detail.addEventListener('toggle', () => {
    indicator.textContent = detail.open ? '[−]' : '[+]';
  });
});

// ---------------------------------------------------------
// GitHub API integration: download buttons + changelog.
// ---------------------------------------------------------

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
    const navVersion = document.getElementById('nav-version');

    const winAsset = data.assets?.find((a) => /\.exe$/i.test(a.name));
    const linuxAsset = data.assets?.find((a) => /\.AppImage$/i.test(a.name));

    if (winBtn && winAsset) winBtn.href = winAsset.browser_download_url;
    if (linuxBtn && linuxAsset) linuxBtn.href = linuxAsset.browser_download_url;
    if (meta) meta.textContent = `${data.tag_name} · released ${formatDate(data.published_at)}`;
    if (navVersion) navVersion.textContent = data.tag_name || navVersion.textContent;
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

// ---------------------------------------------------------
// Nav scrolled state
// ---------------------------------------------------------
const nav = document.getElementById('site-nav');
function updateNav() {
  if (!nav) return;
  nav.classList.toggle('scrolled', window.scrollY > 32);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// ---------------------------------------------------------
// Number counter animation for hero HUD stats
// ---------------------------------------------------------

/**
 * Eases a value from 0..1 using cubic ease-out.
 * @param {number} t — progress 0..1
 * @returns {number}
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Format a raw number for a given format type.
 *
 * format types:
 *   "default" — raw integer, comma-separated (e.g. 28 → "28", 1234567 → "1,234,567")
 *   "M"       — divide by 1 000 000, one decimal (e.g. 12400000 → "12.4M")
 *   "slash"   — not handled here; slash targets are animated separately
 *
 * @param {number} value
 * @param {string} format
 * @returns {string}
 */
function formatCounterValue(value, format) {
  if (format === 'M') {
    return (value / 1_000_000).toFixed(1) + 'M';
  }
  // default: comma-separated integer
  return Math.round(value).toLocaleString();
}

/**
 * Animate all [data-target] elements from 0 → target over DURATION ms.
 * Skips animation entirely when prefers-reduced-motion is set.
 */
function animateCounters() {
  const DURATION = 1400;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-target]').forEach((el) => {
    const rawTarget = el.dataset.target;
    const format = el.dataset.format || 'default';

    if (format === 'slash') {
      // Target is "A/B" — animate both .hud-downs-good and .hud-downs-bad children
      const [aStr, bStr] = rawTarget.split('/');
      const targetA = parseInt(aStr, 10);
      const targetB = parseInt(bStr, 10);
      const goodEl = el.querySelector('.hud-downs-good');
      const badEl = el.querySelector('.hud-downs-bad');
      if (!goodEl || !badEl) return;

      if (reducedMotion) {
        goodEl.textContent = String(targetA);
        badEl.textContent = String(targetB);
        return;
      }

      const startTime = performance.now();
      function tickSlash(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / DURATION, 1);
        const eased = easeOutCubic(progress);

        goodEl.textContent = String(Math.round(eased * targetA));
        badEl.textContent = String(Math.round(eased * targetB));

        if (progress < 1) requestAnimationFrame(tickSlash);
      }
      requestAnimationFrame(tickSlash);
      return;
    }

    // "default" or "M" formats — single numeric target
    const target = parseInt(rawTarget, 10);
    if (isNaN(target)) return;

    if (reducedMotion) {
      el.textContent = formatCounterValue(target, format);
      return;
    }

    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = easeOutCubic(progress);

      el.textContent = formatCounterValue(eased * target, format);

      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------
loadLatestRelease();
loadChangelog();
animateCounters();
