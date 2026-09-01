import { initAuthState } from './modules/auth-state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initAuthState();

  // Re-attach auth modal triggers in case the nav slot was just re-rendered
  // for a logged-out visitor — the shared modal lives on index.html only,
  // so here we simply send them there with an auth intent flag.
  document.getElementById('signup-trigger')?.addEventListener('click', () => {
    window.location.href = 'index.html?auth=signup';
  });
  document.getElementById('login-trigger')?.addEventListener('click', () => {
    window.location.href = 'index.html?auth=login';
  });

  try {
    gsap.registerPlugin(ScrollTrigger);
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        y: 28,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
      });
    });
  } catch (e) {
    console.error('[about scroll animations failed]', e);
  }
});

function initAboutBloomScrollEffect() {
  const photo = document.getElementById('about-bloom-photo');
  if (!photo) return;

  let raf = null;

  const update = () => {
    raf = null;
    const scrollY = window.scrollY || window.pageYOffset;
    const progress = Math.min(1, Math.max(0, scrollY / (window.innerHeight * 0.75)));
    photo.style.setProperty('--plans-blur', `${progress * 20}px`);
    photo.style.setProperty('--plans-scale', progress);
    photo.style.setProperty('--plans-parallax', `${scrollY * 0.25}px`);
  };

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchmove', onScroll, { passive: true });
  update();
}
