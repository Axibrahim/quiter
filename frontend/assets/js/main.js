/**
 * Quiter — main.js
 *
 * Orchestrates:
 * - Hero video looping
 * - Lenis smooth scroll
 * - GSAP scroll-triggered reveals
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
  video.addEventListener(
    'canplay',
    playVideo,
    { once: true }
  );

  // Resume playback after the first user interaction.
  const resumeOnGesture = () => {
    playVideo();
  };

  window.addEventListener(
    'pointerdown',
    resumeOnGesture,
    { once: true }
  );

  window.addEventListener(
    'touchstart',
    resumeOnGesture,
    { once: true }
  );

  // Safety fallback.
  // Native loop should normally handle this.
  video.addEventListener(
    'ended',
    () => {
      video.currentTime = 0;
      playVideo();
    }
  );
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
      Math.max(
        0,
        -rect.top / (heroHeight * 0.75)
      )
    );

    /*
     * Blur only.
     * The video does NOT become darker or transparent.
     */
    const blur = progress * 18;

    video.style.setProperty(
      '--hero-blur',
      `${blur}px`
    );
  };

  const onScroll = () => {
    if (raf) {
      return;
    }

    raf = requestAnimationFrame(update);
  };

  window.addEventListener(
    'scroll',
    onScroll,
    { passive: true }
  );

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

    easing: (t) =>
      Math.min(
        1,
        1.001 - Math.pow(2, -10 * t)
      ),

    smoothWheel: true
  });

  lenis.on(
    'scroll',
    ScrollTrigger.update
  );

  gsap.ticker.add(
    (time) => {
      lenis.raf(time * 1000);
    }
  );

  gsap.ticker.lagSmoothing(0);

  return lenis;
}


/* =========================================================================
   3. GSAP SCROLL REVEALS
   ========================================================================= */

function initScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    gsap.set(
      '[data-reveal]',
      {
        opacity: 1,
        y: 0
      }
    );

    return;
  }

  gsap.timeline({
    defaults: {
      ease: 'power3.out'
    }
  })

    .from(
      '.hero__title',
      {
        y: 24,
        opacity: 0,
        duration: 0.9,
        delay: 0.2
      }
    )

    .from(
      '.hero__goal-form',
      {
        y: 16,
        opacity: 0,
        duration: 0.6
      },
      '-=0.5'
    )

    .from(
      '.hero__subtitle',
      {
        y: 16,
        opacity: 0,
        duration: 0.6
      },
      '-=0.4'
    )

    .from(
      '.hero__how-it-works',
      {
        y: 16,
        opacity: 0,
        duration: 0.6
      },
      '-=0.4'
    );

  document
    .querySelectorAll('[data-reveal]')
    .forEach((el) => {
      gsap.from(
        el,
        {
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true
          },

          y: 28,
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out'
        }
      );
    });
}


/* =========================================================================
   4. LIQUID GLASS HOVER SYSTEM
   ========================================================================= */

function initGlassHover() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const hasFinePointer = window.matchMedia(
    '(hover: hover) and (pointer: fine)'
  ).matches;

  if (
    prefersReducedMotion ||
    !hasFinePointer
  ) {
    return;
  }


  /* -----------------------------------------------------------------------
     Glass cards
     ----------------------------------------------------------------------- */

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
        card.style.setProperty(
          '--glass-x',
          '50%'
        );

        card.style.setProperty(
          '--glass-y',
          '50%'
        );

        card.style.setProperty(
          '--glass-rotate-x',
          '0deg'
        );

        card.style.setProperty(
          '--glass-rotate-y',
          '0deg'
        );

        card.style.setProperty(
          '--glass-scale',
          '1'
        );

        card.style.setProperty(
          '--glass-lift',
          '0px'
        );
      });
    };

    card.addEventListener(
      'pointermove',
      (event) => {
        const rect =
          card.getBoundingClientRect();

        const x =
          (event.clientX - rect.left) /
          rect.width;

        const y =
          (event.clientY - rect.top) /
          rect.height;

        const px =
          x * 2 - 1;

        const py =
          y * 2 - 1;

        const rotateY =
          px * 2.2;

        const rotateX =
          py * -2.2;

        if (raf) {
          cancelAnimationFrame(raf);
        }

        raf = requestAnimationFrame(() => {
          card.style.setProperty(
            '--glass-x',
            `${x * 100}%`
          );

          card.style.setProperty(
            '--glass-y',
            `${y * 100}%`
          );

          card.style.setProperty(
            '--glass-rotate-x',
            `${rotateX}deg`
          );

          card.style.setProperty(
            '--glass-rotate-y',
            `${rotateY}deg`
          );

          card.style.setProperty(
            '--glass-scale',
            '1.012'
          );

          card.style.setProperty(
            '--glass-lift',
            '-5px'
          );
        });
      }
    );

    card.addEventListener(
      'pointerleave',
      reset
    );
  });


  /* -----------------------------------------------------------------------
     Buttons
     ----------------------------------------------------------------------- */

  const buttons = document.querySelectorAll(`
    .btn,
    .icon-btn,
    .hero__goal-submit
  `);

  buttons.forEach((button) => {
    let raf = null;

    button.addEventListener(
      'pointermove',
      (event) => {
        const rect =
          button.getBoundingClientRect();

        const x =
          event.clientX -
          (rect.left + rect.width / 2);

        const y =
          event.clientY -
          (rect.top + rect.height / 2);

        const moveX =
          Math.max(
            -6,
            Math.min(
              6,
              x * 0.18
            )
          );

        const moveY =
          Math.max(
            -6,
            Math.min(
              6,
              y * 0.18
            )
          );

        if (raf) {
          cancelAnimationFrame(raf);
        }

        raf = requestAnimationFrame(() => {
          button.style.setProperty(
            '--magnetic-x',
            `${moveX}px`
          );

          button.style.setProperty(
            '--magnetic-y',
            `${moveY}px`
          );

          button.style.setProperty(
            '--button-glow-x',
            `${
              ((event.clientX - rect.left) /
                rect.width) *
              100
            }%`
          );

          button.style.setProperty(
            '--button-glow-y',
            `${
              ((event.clientY - rect.top) /
                rect.height) *
              100
            }%`
          );
        });
      }
    );

    button.addEventListener(
      'pointerleave',
      () => {
        if (raf) {
          cancelAnimationFrame(raf);
        }

        button.style.setProperty(
          '--magnetic-x',
          '0px'
        );

        button.style.setProperty(
          '--magnetic-y',
          '0px'
        );

        button.style.setProperty(
          '--button-glow-x',
          '50%'
        );

        button.style.setProperty(
          '--button-glow-y',
          '50%'
        );
      }
    );
  });


  /* -----------------------------------------------------------------------
     Plan choose buttons
     ----------------------------------------------------------------------- */

  document
    .querySelectorAll('.plan-card__choose')
    .forEach((button) => {
      button.addEventListener(
        'pointerenter',
        () => {
          gsap.to(
            button,
            {
              scale: 1.025,
              duration: 0.25,
              ease: 'power2.out',
              overwrite: true
            }
          );
        }
      );

      button.addEventListener(
        'pointerleave',
        () => {
          gsap.to(
            button,
            {
              scale: 1,
              duration: 0.3,
              ease: 'power2.out',
              overwrite: true
            }
          );
        }
      );
    });
}


/* =========================================================================
   5. WEBGL BLOOM REWARD
   ========================================================================= */

function initBloomScene() {
  const canvas =
    document.getElementById(
      'bloom-canvas'
    );

  if (!canvas) {
    return null;
  }

  const scene =
    new BloomScene(canvas);

  scene.start();

  window.addEventListener(
    'pagehide',
    () => scene.destroy()
  );

  return scene;
}


/* =========================================================================
   6. HABIT TRACKING
   ========================================================================= */

function initHabitTracking(bloomScene) {
  const streakFigure =
    document.getElementById(
      'streak-figure'
    );

  const longestFigure =
    document.getElementById(
      'longest-figure'
    );

  const activePlanId =
    document.body.dataset.activePlanId ||
    null;

  async function submitCheckin(status) {
    if (!activePlanId) {
      return;
    }

    try {
      const result =
        await api.post(
          `/plans/${activePlanId}/checkin`,
          { status }
        );

      if (streakFigure) {
        streakFigure.textContent =
          result.current_streak;
      }

      if (longestFigure) {
        longestFigure.textContent =
          result.longest_streak;
      }

      if (
        result.reward_tier > 0 &&
        bloomScene
      ) {
        bloomScene.trigger(
          result.reward_tier
        );
      }
    } catch (err) {
      console.error(
        '[checkin failed]',
        err.message
      );

      announce(
        `Couldn't save today's check-in — ${err.message}. Try again.`
      );
    }
  }

  document
    .getElementById('checkin-complete')
    ?.addEventListener(
      'click',
      () =>
        submitCheckin('completed')
    );

  document
    .getElementById('checkin-missed')
    ?.addEventListener(
      'click',
      () =>
        submitCheckin('missed')
    );
}


/* =========================================================================
   7. SQUAD NUDGES
   ========================================================================= */

function initSquadNudges() {
  const activeSquadId =
    document.body.dataset.activeSquadId ||
    null;

  document
    .querySelectorAll('[data-nudge]')
    .forEach((btn) => {
      btn.addEventListener(
        'click',
        async () => {
          if (!activeSquadId) {
            return;
          }

          const type =
            btn.dataset.nudge;

          btn.disabled = true;

          try {
            await api.post(
              `/squads/${activeSquadId}/nudge`,
              { type }
            );

            announce(
              type === 'relapse_shield'
                ? 'Relapse Shield sent to your squad.'
                : 'Nudge sent.'
            );
          } catch (err) {
            announce(
              `Couldn't send that — ${err.message}.`
            );
          } finally {
            btn.disabled = false;
          }
        }
      );
    });
}


/* =========================================================================
   8. ACCESSIBLE LIVE ANNOUNCER
   ========================================================================= */

function announce(message) {
  let region =
    document.getElementById(
      'sr-live-region'
    );

  if (!region) {
    region =
      document.createElement(
        'div'
      );

    region.id =
      'sr-live-region';

    region.setAttribute(
      'role',
      'status'
    );

    region.setAttribute(
      'aria-live',
      'polite'
    );

    region.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    `;

    document.body.appendChild(
      region
    );
  }

  region.textContent = message;
}


/* =========================================================================
   9. PLAN CARD FLIP
   ========================================================================= */

function initPlanCardFlip() {
  document
    .querySelectorAll(
      '.plan-card-flip'
    )
    .forEach((card) => {
      const toggle = () => {
        const flipped =
          card.classList.toggle(
            'is-flipped'
          );

        card.setAttribute(
          'aria-pressed',
          String(flipped)
        );
      };

      card.addEventListener(
        'click',
        toggle
      );

      card.addEventListener(
        'keydown',
        (e) => {
          if (
            e.key === 'Enter' ||
            e.key === ' '
          ) {
            e.preventDefault();
            toggle();
          }
        }
      );
    });
}


/* =========================================================================
   10. PLAN CARD INTERACTIONS
   ========================================================================= */

function initPlanInteractions() {

  /* -----------------------------------------------------------------------
     Custom plan card keyboard support
     ----------------------------------------------------------------------- */

  const customPlan =
    document.getElementById(
      'custom-plan-cta'
    );

  if (customPlan) {
    customPlan.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          customPlan.click();
        }
      }
    );
  }


  /* -----------------------------------------------------------------------
     Plan photo zoom
     ----------------------------------------------------------------------- */

  document
    .querySelectorAll('.plan-card')
    .forEach((card) => {
      const photo =
        card.querySelector(
          '.plan-card__photo'
        );

      if (!photo) {
        return;
      }

      card.addEventListener(
        'pointerenter',
        () => {
          gsap.to(
            photo,
            {
              scale: 1.045,
              duration: 0.5,
              ease: 'power3.out',
              overwrite: true
            }
          );
        }
      );

      card.addEventListener(
        'pointerleave',
        () => {
          gsap.to(
            photo,
            {
              scale: 1,
              duration: 0.5,
              ease: 'power3.out',
              overwrite: true
            }
          );
        }
      );
    });
}


/* =========================================================================
   11. HERO GOAL FORM
   ========================================================================= */

function initGoalForm() {
  const form =
    document.getElementById(
      'goal-form'
    );

  if (!form) {
    return;
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      document
        .getElementById('plans')
        ?.scrollIntoView({
          behavior: 'smooth'
        });
    }
  );
}


/* =========================================================================
   12. NAV LINK MICRO-INTERACTION
   ========================================================================= */

function initNavInteractions() {
  document
    .querySelectorAll(
      '.nav__links a'
    )
    .forEach((link) => {
      link.addEventListener(
        'pointerenter',
        () => {
          gsap.to(
            link,
            {
              y: -1,
              duration: 0.2,
              ease: 'power2.out',
              overwrite: true
            }
          );
        }
      );

      link.addEventListener(
        'pointerleave',
        () => {
          gsap.to(
            link,
            {
              y: 0,
              duration: 0.25,
              ease: 'power2.out',
              overwrite: true
            }
          );
        }
      );
    });
}


/* =========================================================================
   13. AUTHENTICATION
   ========================================================================= */

function initAuth() {
  const overlay =
    document.getElementById(
      'auth-modal-overlay'
    );

  const closeButton =
    document.getElementById(
      'auth-modal-close'
    );

  const loginTrigger =
    document.getElementById(
      'login-trigger'
    );

  const signupTrigger =
    document.getElementById(
      'signup-trigger'
    );

  const loginTab =
    document.getElementById(
      'tab-login'
    );

  const signupTab =
    document.getElementById(
      'tab-signup'
    );

  const form =
    document.getElementById(
      'auth-form'
    );

  const title =
    document.getElementById(
      'auth-modal-title'
    );

  const submitButton =
    document.getElementById(
      'auth-submit'
    );

  const displayNameField =
    document.getElementById(
      'field-display-name'
    );

  const displayNameInput =
    document.getElementById(
      'auth-display-name'
    );

  const emailInput =
    document.getElementById(
      'auth-email'
    );

  const passwordInput =
    document.getElementById(
      'auth-password'
    );

  const errorElement =
    document.getElementById(
      'auth-error'
    );

  if (!overlay || !form) {
    console.warn(
      '[auth] Auth modal not found.'
    );

    return;
  }

  let mode = 'login';


  /* -----------------------------------------------------------------------
     Update login / signup mode
     ----------------------------------------------------------------------- */

  function updateMode() {
    const isSignup =
      mode === 'signup';

    loginTab?.classList.toggle(
      'is-active',
      !isSignup
    );

    signupTab?.classList.toggle(
      'is-active',
      isSignup
    );

    if (isSignup) {
      title.textContent =
        'Create your identity';

      submitButton.textContent =
        'Create account';

      displayNameField.style.display =
        '';

      passwordInput.setAttribute(
        'autocomplete',
        'new-password'
      );
    } else {
      title.textContent =
        'Welcome back';

      submitButton.textContent =
        'Login';

      displayNameField.style.display =
        'none';

      passwordInput.setAttribute(
        'autocomplete',
        'current-password'
      );
    }

    if (errorElement) {
      errorElement.textContent = '';
    }
  }


  /* -----------------------------------------------------------------------
     Open modal
     ----------------------------------------------------------------------- */

  function openAuth(type) {
    mode = type;

    updateMode();

    overlay.classList.add(
      'is-open'
    );

    document.body.style.overflow =
      'hidden';

    setTimeout(() => {
      if (mode === 'signup') {
        displayNameInput?.focus();
      } else {
        emailInput?.focus();
      }
    }, 50);
  }


  /* -----------------------------------------------------------------------
     Close modal
     ----------------------------------------------------------------------- */

  function closeAuth() {
    overlay.classList.remove(
      'is-open'
    );

    document.body.style.overflow =
      '';

    form.reset();

    if (errorElement) {
      errorElement.textContent = '';
    }
  }


  /* -----------------------------------------------------------------------
     Header buttons
     ----------------------------------------------------------------------- */

  loginTrigger?.addEventListener(
    'click',
    () => openAuth('login')
  );

  signupTrigger?.addEventListener(
    'click',
    () => openAuth('signup')
  );


  /* -----------------------------------------------------------------------
     Modal tabs
     ----------------------------------------------------------------------- */

  loginTab?.addEventListener(
    'click',
    () => openAuth('login')
  );

  signupTab?.addEventListener(
    'click',
    () => openAuth('signup')
  );


  /* -----------------------------------------------------------------------
     Close button
     ----------------------------------------------------------------------- */

  closeButton?.addEventListener(
    'click',
    closeAuth
  );


  /* -----------------------------------------------------------------------
     Click outside modal
     ----------------------------------------------------------------------- */

  overlay.addEventListener(
    'click',
    (event) => {
      if (event.target === overlay) {
        closeAuth();
      }
    }
  );


  /* -----------------------------------------------------------------------
     Escape key
     ----------------------------------------------------------------------- */

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        overlay.classList.contains(
          'is-open'
        )
      ) {
        closeAuth();
      }
    }
  );


  /* -----------------------------------------------------------------------
   Submit login / signup
   ----------------------------------------------------------------------- */

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

    /*
     * Flask has now created the authenticated
     * session. Reload the page so the server
     * can render the authenticated state.
     */
    window.location.reload();
  } catch (error) {
    console.error('[auth failed]', error);

    if (errorElement) {
      errorElement.textContent =
        error.message || 'Something went wrong.';
    }
  } finally {
    submitButton.disabled = false;
  }
});
}


/* =========================================================================
   14. AUTH ERROR MESSAGES
   ========================================================================= */

function getAuthErrorMessage(result) {
  switch (result?.error) {

    case 'invalid_credentials':
      return (
        'Email or password is incorrect.'
      );

    case 'email_already_registered':
      return (
        'An account with this email already exists.'
      );

    case 'weak_password':
      return (
        result.detail ||
        'Password must be at least 10 characters and contain a number and a letter.'
      );

    case 'invalid_email':
      return (
        'Please enter a valid email address.'
      );

    case 'invalid_display_name':
      return (
        'Display name must be between 2 and 40 characters.'
      );

    case 'account_locked':
      return (
        'Too many failed attempts. Please try again later.'
      );

    default:
      return (
        'Something went wrong. Please try again.'
      );
  }
}


/* =========================================================================
   15. BOOT
   ========================================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    /* ---------------------------------------------------------------------
       Hero video
       --------------------------------------------------------------------- */

    try {
  initHeroVideo();
} catch (e) {
  console.error(
    '[hero video init failed]',
    e
  );
}

    try {
  initHeroVideoScrollEffect();
} catch (e) {
  console.error(
    '[hero video scroll effect failed]',
    e
  );
}


    /* ---------------------------------------------------------------------
       Smooth scrolling
       --------------------------------------------------------------------- */

    try {
      initSmoothScroll();
    } catch (e) {
      console.error(
        '[smooth scroll init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       GSAP scroll animations
       --------------------------------------------------------------------- */

    try {
      initScrollAnimations();
    } catch (e) {
      console.error(
        '[scroll animations init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Liquid glass interactions
       --------------------------------------------------------------------- */

    try {
      initGlassHover();
    } catch (e) {
      console.error(
        '[glass hover init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       WebGL bloom
       --------------------------------------------------------------------- */

    let bloomScene = null;

    try {
      bloomScene =
        initBloomScene();
    } catch (e) {
      console.error(
        '[bloom scene init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Habit tracking
       --------------------------------------------------------------------- */

    try {
      initHabitTracking(
        bloomScene
      );
    } catch (e) {
      console.error(
        '[habit tracking init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Squad nudges
       --------------------------------------------------------------------- */

    try {
      initSquadNudges();
    } catch (e) {
      console.error(
        '[squad nudges init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Plan card flip
       --------------------------------------------------------------------- */

    try {
      initPlanCardFlip();
    } catch (e) {
      console.error(
        '[plan card flip init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Plan interactions
       --------------------------------------------------------------------- */

    try {
      initPlanInteractions();
    } catch (e) {
      console.error(
        '[plan interactions init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Hero goal form
       --------------------------------------------------------------------- */

    try {
      initGoalForm();
    } catch (e) {
      console.error(
        '[goal form init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Navigation
       --------------------------------------------------------------------- */

    try {
      initNavInteractions();
    } catch (e) {
      console.error(
        '[nav interactions init failed]',
        e
      );
    }


    /* ---------------------------------------------------------------------
       Authentication
       --------------------------------------------------------------------- */

    try {
      initAuth();
    } catch (e) {
      console.error(
        '[auth init failed]',
        e
      );
    }

  }
);