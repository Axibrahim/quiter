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
