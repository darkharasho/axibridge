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
