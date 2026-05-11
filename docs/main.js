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
