/**
 * Quiter — main.js
 *
 * Orchestrates:
 * - Hero video looping & scroll blur
 * - Lenis smooth scroll
 * - GSAP scroll-triggered reveals
 * - Hero typewriter effect
 * - Search bar arrow reveal animation
 * - Live habit plan search & filtering
 * - Liquid-glass hover interactions
 * - WebGL bloom reward
 * - Habit tracking API calls
 * - Squad nudges
 * - Plan interactions
 * - Authentication modal + API
 *
 * Vanilla ES modules only.
 */

import { BloomScene } from './three/bloom-scene.js';
import { api } from './modules/api-client.js';


/* =========================================================================
   1. HERO VIDEO
   =========================================================================
   Keeps the hero video continuously playing without fading to black.

   Important:
   - No "is-ending" class
   - No manual fade-out
   - Uses native browser looping
   - Attempts to resume playback after user interaction
   ========================================================================= */

function initHeroVideo() {
  const video = document.getElementById('hero-video');

  if (!video) {
    return;
  }

  // Let the browser handle looping.
  video.loop = true;

  // Make sure the video starts visible.
  video.style.opacity = '1';

  const playVideo = () => {
    video.play().catch(() => {
      // Browser may block autoplay until user interaction.
    });
  };

  // Try immediately.
  playVideo();

  // Try again when enough video data is available.
  video.addEventListener('canplay', playVideo, { once: true });

  // Resume playback after the first user interaction.
  const resumeOnGesture = () => {
    playVideo();
  };

  window.addEventListener('pointerdown', resumeOnGesture, { once: true });
  window.addEventListener('touchstart', resumeOnGesture, { once: true });

  // Safety fallback.
  video.addEventListener('ended', () => {
    video.currentTime = 0;
    playVideo();
  });
}


/* =========================================================================
   2. HERO VIDEO SCROLL BLUR
   =========================================================================
   The video stays fully visible while scrolling.
   As the hero leaves the viewport, the video progressively blurs.
   No opacity or darkening is applied.
   ========================================================================= */

function initHeroVideoScrollEffect() {
  const video = document.getElementById('hero-video');

  if (!video) {
    return;
  }

  const hero = video.closest('.hero');

  if (!hero) {
    return;
  }

  let raf = null;

  const update = () => {
    raf = null;

    const rect = hero.getBoundingClientRect();
    const heroHeight = hero.offsetHeight;

    /*
     * 0 = hero is at the top
     * 1 = hero has mostly left the viewport
     */
    const progress = Math.min(
      1,
      Math.max(0, -rect.top / (heroHeight * 0.75))
    );

    /*
     * Blur only.
     * The video does NOT become darker or transparent.
     */
    const blur = progress * 18;

    video.style.setProperty('--hero-blur', `${blur}px`);
  };

  const onScroll = () => {
    if (raf) {
      return;
    }

    raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });

  update();
}


/* =========================================================================
   3. LENIS SMOOTH SCROLL + GSAP SCROLLTRIGGER
   ========================================================================= */

function initSmoothScroll() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    return null;
  }

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);

  return lenis;
}


/* =========================================================================
   4. GSAP SCROLL REVEALS
   ========================================================================= */

function initScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    gsap.set('[data-reveal]', {
      opacity: 1,
      y: 0
    });

    return;
  }

  gsap.timeline({
    defaults: {
      ease: 'power3.out'
    }
  })
    .from('.hero__title', {
      y: 20,
      opacity: 0,
      duration: 0.8,
      delay: 0.15
    })
    .from('.hero__goal-container', {
      y: 16,
      opacity: 0,
      duration: 0.6
    }, '-=0.4')
    .from('.hero__subtitle', {
      y: 16,
      opacity: 0,
      duration: 0.6
    }, '-=0.4')
    .from('.hero__how-it-works', {
      y: 16,
      opacity: 0,
      duration: 0.6
    }, '-=0.4');

  document.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true
      },
      y: 28,
      opacity: 0,
      duration: 0.7,
      ease: 'power3.out'
    });
  });
}


/* =========================================================================
   5. HERO TYPEWRITER EFFECT
   ========================================================================= */

function initTypewriterEffect() {
  const dynamicTextEl = document.getElementById('typewriter-text');
  const cursorEl = document.getElementById('typewriter-cursor');

  if (!dynamicTextEl) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    dynamicTextEl.innerHTML = '<em>becoming</em>.';
    if (cursorEl) {
      cursorEl.style.display = 'none';
    }
    return;
  }

  const phrases = [
    { text: 'becoming.', isEm: true },
    { text: 'becoming smoke-free.', isEm: false },
    { text: 'becoming sober.', isEm: false },
    { text: 'becoming athlete.', isEm: false },
    { text: 'becoming your self.', isEm: false },
    { text: 'becoming.', isEm: true }
  ];

  let phraseIndex = 0;
  let isDeleting = false;
  let currentChars = 'becoming.';
  let typingSpeed = 70;

  // Render initial state immediately
  dynamicTextEl.innerHTML = '<em>becoming</em>.';

  function typeDynamicText() {
    const currentPhrase = phrases[phraseIndex];
    const fullText = currentPhrase.text;

    cursorEl?.classList.add('is-typing');

    if (isDeleting) {
      currentChars = fullText.substring(0, currentChars.length - 1);
      typingSpeed = 30 + Math.random() * 20;
    } else {
      currentChars = fullText.substring(0, currentChars.length + 1);
      const lastChar = fullText.charAt(currentChars.length - 1);
      typingSpeed = lastChar === ' ' ? 70 : (45 + Math.random() * 35);
    }

    if (currentPhrase.isEm) {
      dynamicTextEl.innerHTML = `<em>${currentChars}</em>`;
    } else {
      dynamicTextEl.textContent = currentChars;
    }

    if (!isDeleting && currentChars === fullText) {
      cursorEl?.classList.remove('is-typing');
      const holdTime = (phraseIndex === 0 || phraseIndex === phrases.length - 1) ? 2800 : 1800;
      isDeleting = true;
      setTimeout(typeDynamicText, holdTime);
      return;
    } else if (isDeleting && currentChars === '') {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      setTimeout(typeDynamicText, 250);
      return;
    }

    setTimeout(typeDynamicText, typingSpeed);
  }

  // Hold the initial "becoming." for 2.2s before beginning to cycle
  setTimeout(() => {
    isDeleting = true;
    typeDynamicText();
  }, 2200);
}

/* =========================================================================
   6. SEARCH BAR ARROW REVEAL ANIMATION
   ========================================================================= */

function initSearchBarArrowReveal() {
  const goalForm = document.getElementById('goal-form');
  const submitBtn = document.getElementById('goal-submit-btn');
  const input = document.getElementById('goal-input');

  if (!goalForm || !submitBtn) {
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    gsap.set(goalForm, {
      clipPath: 'inset(0% 0% 0% 0% round 9999px)',
      opacity: 1
    });
    gsap.set(submitBtn, { x: 0, opacity: 1 });
    return;
  }

  const runRevealAnimation = () => {
    const formRect = goalForm.getBoundingClientRect();
    const btnRect = submitBtn.getBoundingClientRect();

    // Distance for the arrow to move from the left end to its natural right position
    const distanceToLeft = Math.max(0, (btnRect.left - formRect.left) - 8);

    const tl = gsap.timeline({
      delay: 0.5,
      defaults: { ease: 'power3.inOut' }
    });

    // Start state: clip form to left and place arrow button at the left edge
    gsap.set(goalForm, {
      clipPath: 'inset(0% 100% 0% 0% round 9999px)',
      opacity: 1
    });

    gsap.set(submitBtn, {
      x: -distanceToLeft,
      opacity: 1,
      scale: 0.92
    });

    gsap.set(input, {
      opacity: 0
    });

    // Sweep arrow rightwards and reveal liquid glass search bar behind it
    tl.to(goalForm, {
      clipPath: 'inset(0% 0% 0% 0% round 9999px)',
      duration: 1.05,
      ease: 'power3.inOut'
    }, 0);

    tl.to(submitBtn, {
      x: 0,
      opacity: 1,
      scale: 1,
      duration: 1.05,
      ease: 'power3.inOut'
    }, 0);

    // Fade in placeholder smoothly
    tl.to(input, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out'
    }, 0.5);

    // Subtle landing spring bounce
    tl.to(submitBtn, {
      scale: 1.15,
      duration: 0.16,
      ease: 'power2.out'
    });

    tl.to(submitBtn, {
      scale: 1,
      duration: 0.3,
      ease: 'elastic.out(1.15, 0.4)'
    });
  };

  if (document.readyState === 'complete') {
    requestAnimationFrame(runRevealAnimation);
  } else {
    window.addEventListener('load', runRevealAnimation, { once: true });
  }
}


/* =========================================================================
   7. HERO GOAL FORM & LIVE PLAN SEARCH
   ========================================================================= */

function initGoalForm() {
  const form = document.getElementById('goal-form');
  const input = document.getElementById('goal-input');
  const submitBtn = document.getElementById('goal-submit-btn');
  const planCards = document.querySelectorAll('#plan-grid .plan-card:not(#custom-plan-cta)');
  const customCard = document.getElementById('custom-plan-cta');

  if (!form || !input) {
    return;
  }

  const planCatalog = [
    {
      slug: 'smoke-free',
      keywords: ['smoke', 'smoking', 'cigarette', 'vape', 'vaping', 'nicotine', 'tobacco', 'lungs'],
      title: 'Becoming Smoke-Free'
    },
    {
      slug: 'sober',
      keywords: ['sober', 'alcohol', 'drink', 'drinking', 'wine', 'beer', 'liquor', 'cocktail', 'hangover'],
      title: 'Becoming Sober'
    },
    {
      slug: 'athlete',
      keywords: ['athlete', 'fitness', 'run', 'running', 'gym', 'workout', 'exercise', 'health', 'muscle', 'movement', 'body', 'walk'],
      title: 'Becoming an Athlete'
    }
  ];

  function filterPlans(query) {
    const term = query.trim().toLowerCase();

    if (submitBtn) {
      submitBtn.classList.toggle('has-query', term.length > 0);
    }

    if (!term) {
      planCards.forEach(card => {
        card.classList.remove('is-search-dimmed', 'is-search-matched');
      });
      if (customCard) {
        customCard.classList.remove('is-search-matched', 'is-search-dimmed');
        const titleEl = customCard.querySelector('.plan-card__title');
        const descEl = customCard.querySelector('.plan-card__identity');
        if (titleEl) {
          titleEl.textContent = 'Build your own';
        }
        if (descEl) {
          descEl.textContent = "Not on the list? Sign in and describe your own goal — we'll build a plan around it.";
        }
      }
      return;
    }

    let matchCount = 0;

    planCards.forEach(card => {
      const slug = card.dataset.templateSlug;
      const data = planCatalog.find(p => p.slug === slug);
      const cardText = card.textContent.toLowerCase();

      const isMatch = (data && data.keywords.some(k => term.includes(k) || k.includes(term))) ||
                      cardText.includes(term);

      if (isMatch) {
        card.classList.add('is-search-matched');
        card.classList.remove('is-search-dimmed');
        matchCount++;
      } else {
        card.classList.add('is-search-dimmed');
        card.classList.remove('is-search-matched');
      }
    });

    if (customCard) {
      const titleEl = customCard.querySelector('.plan-card__title');
      const descEl = customCard.querySelector('.plan-card__identity');
      if (titleEl) {
        titleEl.textContent = `Custom: ${query.trim()}`;
      }
      if (descEl) {
        descEl.textContent = `Create a personalized squad plan for "${query.trim()}".`;
      }
      if (matchCount === 0) {
        customCard.classList.add('is-search-matched');
        customCard.classList.remove('is-search-dimmed');
      } else {
        customCard.classList.remove('is-search-matched');
      }
    }
  }

  input.addEventListener('input', (e) => {
    filterPlans(e.target.value);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();

    const plansSection = document.getElementById('plans');
    if (plansSection) {
      plansSection.scrollIntoView({ behavior: 'smooth' });
    }

    if (query) {
      filterPlans(query);
    }
  });
}


/* =========================================================================
   8. LIQUID GLASS HOVER SYSTEM
   ========================================================================= */

function initGlassHover() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const hasFinePointer = window.matchMedia(
    '(hover: hover) and (pointer: fine)'
  ).matches;

  if (prefersReducedMotion || !hasFinePointer) {
    return;
  }

  /* Glass cards */
  const glassCards = document.querySelectorAll(`
    .plan-card,
    .service-card,
    .step-card,
    .bento-cell,
    .squad-panel,
    .philosophy__visual,
    .plan-card--custom
  `);

  glassCards.forEach((card) => {
    let raf = null;

    const reset = () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }

      raf = requestAnimationFrame(() => {
        card.style.setProperty('--glass-x', '50%');
        card.style.setProperty('--glass-y', '50%');
        card.style.setProperty('--glass-rotate-x', '0deg');
        card.style.setProperty('--glass-rotate-y', '0deg');
        card.style.setProperty('--glass-scale', '1');
        card.style.setProperty('--glass-lift', '0px');
      });
    };

    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const px = x * 2 - 1;
      const py = y * 2 - 1;
      const rotateY = px * 2.2;
      const rotateX = py * -2.2;

      if (raf) {
        cancelAnimationFrame(raf);
      }

      raf = requestAnimationFrame(() => {
        card.style.setProperty('--glass-x', `${x * 100}%`);
        card.style.setProperty('--glass-y', `${y * 100}%`);
        card.style.setProperty('--glass-rotate-x', `${rotateX}deg`);
        card.style.setProperty('--glass-rotate-y', `${rotateY}deg`);
        card.style.setProperty('--glass-scale', '1.012');
        card.style.setProperty('--glass-lift', '-5px');
      });
    });

    card.addEventListener('pointerleave', reset);
  });

  /* Buttons */
  const buttons = document.querySelectorAll(`
    .btn,
    .icon-btn,
    .hero__goal-submit
  `);

  buttons.forEach((button) => {
    let raf = null;

    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      const moveX = Math.max(-6, Math.min(6, x * 0.18));
      const moveY = Math.max(-6, Math.min(6, y * 0.18));

      if (raf) {
        cancelAnimationFrame(raf);
      }

      raf = requestAnimationFrame(() => {
        button.style.setProperty('--magnetic-x', `${moveX}px`);
        button.style.setProperty('--magnetic-y', `${moveY}px`);
        button.style.setProperty(
          '--button-glow-x',
          `${((event.clientX - rect.left) / rect.width) * 100}%`
        );
        button.style.setProperty(
          '--button-glow-y',
          `${((event.clientY - rect.top) / rect.height) * 100}%`
        );
      });
    });

    button.addEventListener('pointerleave', () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }

      button.style.setProperty('--magnetic-x', '0px');
      button.style.setProperty('--magnetic-y', '0px');
      button.style.setProperty('--button-glow-x', '50%');
      button.style.setProperty('--button-glow-y', '50%');
    });
  });

  /* Plan choose buttons */
  document.querySelectorAll('.plan-card__choose').forEach((button) => {
    button.addEventListener('pointerenter', () => {
      gsap.to(button, {
        scale: 1.025,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: true
      });
    });

    button.addEventListener('pointerleave', () => {
      gsap.to(button, {
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
        overwrite: true
      });
    });
  });
}


/* =========================================================================
   9. WEBGL BLOOM REWARD
   ========================================================================= */

function initBloomScene() {
  const canvas = document.getElementById('bloom-canvas');

  if (!canvas) {
    return null;
  }

  const scene = new BloomScene(canvas);
  scene.start();

  window.addEventListener('pagehide', () => scene.destroy());

  return scene;
}


/* =========================================================================
   10. HABIT TRACKING
   ========================================================================= */

function initHabitTracking(bloomScene) {
  const streakFigure = document.getElementById('streak-figure');
  const longestFigure = document.getElementById('longest-figure');
  const activePlanId = document.body.dataset.activePlanId || null;

  async function submitCheckin(status) {
    if (!activePlanId) {
      return;
    }

    try {
      const result = await api.post(`/plans/${activePlanId}/checkin`, { status });

      if (streakFigure) {
        streakFigure.textContent = result.current_streak;
      }

      if (longestFigure) {
        longestFigure.textContent = result.longest_streak;
      }

      if (result.reward_tier > 0 && bloomScene) {
        bloomScene.trigger(result.reward_tier);
      }
    } catch (err) {
      console.error('[checkin failed]', err.message);
      announce(`Couldn't save today's check-in — ${err.message}. Try again.`);
    }
  }

  document
    .getElementById('checkin-complete')
    ?.addEventListener('click', () => submitCheckin('completed'));

  document
    .getElementById('checkin-missed')
    ?.addEventListener('click', () => submitCheckin('missed'));
}


/* =========================================================================
   11. SQUAD NUDGES
   ========================================================================= */

function initSquadNudges() {
  const activeSquadId = document.body.dataset.activeSquadId || null;

  document.querySelectorAll('[data-nudge]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!activeSquadId) {
        return;
      }

      const type = btn.dataset.nudge;
      btn.disabled = true;

      try {
        await api.post(`/squads/${activeSquadId}/nudge`, { type });

        announce(
          type === 'relapse_shield'
            ? 'Relapse Shield sent to your squad.'
            : 'Nudge sent.'
        );
      } catch (err) {
        announce(`Couldn't send that — ${err.message}.`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}


/* =========================================================================
   12. ACCESSIBLE LIVE ANNOUNCER
   ========================================================================= */

function announce(message) {
  let region = document.getElementById('sr-live-region');

  if (!region) {
    region = document.createElement('div');
    region.id = 'sr-live-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    `;
    document.body.appendChild(region);
  }

  region.textContent = message;
}


/* =========================================================================
   13. PLAN CARD FLIP
   ========================================================================= */

function initPlanCardFlip() {
  document.querySelectorAll('.plan-card-flip').forEach((card) => {
    const toggle = () => {
      const flipped = card.classList.toggle('is-flipped');
      card.setAttribute('aria-pressed', String(flipped));
    };

    card.addEventListener('click', toggle);

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}


/* =========================================================================
   14. PLAN CARD INTERACTIONS
   ========================================================================= */

function initPlanInteractions() {
  const customPlan = document.getElementById('custom-plan-cta');

  if (customPlan) {
    customPlan.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        customPlan.click();
      }
    });
  }

  document.querySelectorAll('.plan-card').forEach((card) => {
    const photo = card.querySelector('.plan-card__photo');

    if (!photo) {
      return;
    }

    card.addEventListener('pointerenter', () => {
      gsap.to(photo, {
        scale: 1.045,
        duration: 0.5,
        ease: 'power3.out',
        overwrite: true
      });
    });

    card.addEventListener('pointerleave', () => {
      gsap.to(photo, {
        scale: 1,
        duration: 0.5,
        ease: 'power3.out',
        overwrite: true
      });
    });
  });
}


/* =========================================================================
   15. NAV LINK MICRO-INTERACTION
   ========================================================================= */

function initNavInteractions() {
  document.querySelectorAll('.nav__links a').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      gsap.to(link, {
        y: -1,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: true
      });
    });

    link.addEventListener('pointerleave', () => {
      gsap.to(link, {
        y: 0,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: true
      });
    });
  });
}


/* =========================================================================
   16. AUTHENTICATION
   ========================================================================= */

function initAuth() {
  const overlay = document.getElementById('auth-modal-overlay');
  const closeButton = document.getElementById('auth-modal-close');
  const loginTab = document.getElementById('tab-login');
  const signupTab = document.getElementById('tab-signup');
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-modal-title');
  const submitButton = document.getElementById('auth-submit');
  const displayNameField = document.getElementById('field-display-name');
  const displayNameInput = document.getElementById('auth-display-name');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const errorElement = document.getElementById('auth-error');

  if (!overlay || !form) {
    console.warn('[auth] Auth modal not found.');
    return;
  }

  let mode = 'login';

  function updateMode() {
    const isSignup = mode === 'signup';

    loginTab?.classList.toggle('is-active', !isSignup);
    signupTab?.classList.toggle('is-active', isSignup);

    if (isSignup) {
      title.textContent = 'Create your identity';
      submitButton.textContent = 'Create account';
      displayNameField.style.display = '';
      passwordInput.setAttribute('autocomplete', 'new-password');
    } else {
      title.textContent = 'Welcome back';
      submitButton.textContent = 'Login';
      displayNameField.style.display = 'none';
      passwordInput.setAttribute('autocomplete', 'current-password');
    }

    if (errorElement) {
      errorElement.textContent = '';
    }
  }

  function openAuth(type) {
    mode = type;
    updateMode();
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (mode === 'signup') {
        displayNameInput?.focus();
      } else {
        emailInput?.focus();
      }
    }, 50);
  }

  function closeAuth() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    form.reset();

    if (errorElement) {
      errorElement.textContent = '';
    }
  }

  /**
   * #login-trigger / #signup-trigger live inside #nav-auth-slot, which
   * auth-state.js's applyNavState() replaces via innerHTML once the async
   * GET /auth/me call resolves — which happens AFTER this function has
   * already run once at boot and bound listeners to the *original* DOM
   * nodes. That innerHTML swap creates brand-new nodes with the same IDs,
   * so the original listeners go dead and clicking Login/Sign Up does
   * nothing. auth-state.js already dispatches 'quiter:nav-rendered' right
   * after that swap specifically so this file can re-bind — we just
   * weren't listening for it. Wrapping the binding in a function we can
   * re-run on that event fixes it for every future re-render too.
   */
  function bindNavTriggers() {
    document
      .getElementById('login-trigger')
      ?.addEventListener('click', () => openAuth('login'));

    document
      .getElementById('signup-trigger')
      ?.addEventListener('click', () => openAuth('signup'));
  }

  bindNavTriggers();
  document.addEventListener('quiter:nav-rendered', bindNavTriggers);

  loginTab?.addEventListener('click', () => openAuth('login'));
  signupTab?.addEventListener('click', () => openAuth('signup'));
  closeButton?.addEventListener('click', closeAuth);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeAuth();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeAuth();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (errorElement) {
      errorElement.textContent = '';
    }

    submitButton.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const payload = {
      email,
      password,
    };

    if (mode === 'signup') {
      payload.display_name = displayNameInput.value.trim();
    }

    const API_BASE = 'http://127.0.0.1:5000';
    const endpoint =
      mode === 'signup'
        ? `${API_BASE}/api/v1/auth/register`
        : `${API_BASE}/api/v1/auth/login`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Quiter-Client': 'web',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      let result = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(result));
      }

      announce(
        mode === 'signup'
          ? 'Account created successfully.'
          : 'Logged in successfully.'
      );

      closeAuth();
      window.location.reload();
    } catch (error) {
      console.error('[auth failed]', error);

      if (errorElement) {
        errorElement.textContent = error.message || 'Something went wrong.';
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}


/* =========================================================================
   17. AUTH ERROR MESSAGES
   ========================================================================= */

function getAuthErrorMessage(result) {
  switch (result?.error) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_already_registered':
      return 'An account with this email already exists.';
    case 'weak_password':
      return (
        result.detail ||
        'Password must be at least 10 characters and contain a number and a letter.'
      );
    case 'invalid_email':
      return 'Please enter a valid email address.';
    case 'invalid_display_name':
      return 'Display name must be between 2 and 40 characters.';
    case 'account_locked':
      return 'Too many failed attempts. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}


/* =========================================================================
   18. BOOT
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  /* Hero video */
  try {
    initHeroVideo();
  } catch (e) {
    console.error('[hero video init failed]', e);
  }

  try {
    initHeroVideoScrollEffect();
  } catch (e) {
    console.error('[hero video scroll effect failed]', e);
  }

  /* Smooth scrolling */
  try {
    initSmoothScroll();
  } catch (e) {
    console.error('[smooth scroll init failed]', e);
  }

  /* GSAP scroll animations */
  try {
    initScrollAnimations();
  } catch (e) {
    console.error('[scroll animations init failed]', e);
  }

  /* Hero typewriter effect */
  try {
    initTypewriterEffect();
  } catch (e) {
    console.error('[typewriter effect init failed]', e);
  }

  /* Search bar arrow reveal animation */
  try {
    initSearchBarArrowReveal();
  } catch (e) {
    console.error('[search bar arrow reveal init failed]', e);
  }

  /* Liquid glass interactions */
  try {
    initGlassHover();
  } catch (e) {
    console.error('[glass hover init failed]', e);
  }

  /* WebGL bloom */
  let bloomScene = null;
  try {
    bloomScene = initBloomScene();
  } catch (e) {
    console.error('[bloom scene init failed]', e);
  }

  /* Habit tracking */
  try {
    initHabitTracking(bloomScene);
  } catch (e) {
    console.error('[habit tracking init failed]', e);
  }

  /* Squad nudges */
  try {
    initSquadNudges();
  } catch (e) {
    console.error('[squad nudges init failed]', e);
  }

  /* Plan card flip */
  try {
    initPlanCardFlip();
  } catch (e) {
    console.error('[plan card flip init failed]', e);
  }

  /* Plan interactions */
  try {
    initPlanInteractions();
  } catch (e) {
    console.error('[plan interactions init failed]', e);
  }

  /* Hero goal form & live plan search */
  try {
    initGoalForm();
  } catch (e) {
    console.error('[goal form init failed]', e);
  }

  /* Navigation */
  try {
    initNavInteractions();
  } catch (e) {
    console.error('[nav interactions init failed]', e);
  }

  /* Authentication */
  try {
    initAuth();
  } catch (e) {
    console.error('[auth init failed]', e);
  }
});