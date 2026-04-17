/* ========== Sakura — Cinematic 2.0 (Polished & Robust) ========== */

(() => {
  'use strict';

  // Register GSAP Plugins
  gsap.registerPlugin(ScrollTrigger);

  // ========== PETAL PARTICLES (skipped when canvas absent / hidden) ==========
  const petalCanvas = document.getElementById('petalCanvas');
  const ctx = petalCanvas?.getContext?.('2d');
  if (petalCanvas && ctx) {
    function resizeCanvas() {
      petalCanvas.width = window.innerWidth;
      petalCanvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Petal {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * petalCanvas.width;
        this.y = -20 - Math.random() * 80;
        this.size = 4 + Math.random() * 7;
        this.speedY = 0.2 + Math.random() * 0.5;
        this.speedX = -0.1 + Math.random() * 0.25;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = -0.01 + Math.random() * 0.02;
        this.opacity = 0.1 + Math.random() * 0.3;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.005 + Math.random() * 0.01;
      }
      update() {
        this.y += this.speedY;
        this.wobble += this.wobbleSpeed;
        this.x += this.speedX + Math.sin(this.wobble) * 0.2;
        this.rotation += this.rotSpeed;
        if (this.y > petalCanvas.height + 20) this.reset();
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(this.size * 0.4, -this.size * 0.6, this.size, -this.size * 0.3, this.size * 0.5, this.size * 0.2);
        ctx.bezierCurveTo(this.size * 0.2, this.size * 0.5, -this.size * 0.1, this.size * 0.3, 0, 0);
        ctx.fillStyle = `hsl(${345 + Math.random() * 15}, 85%, ${75 + Math.random() * 10}%)`;
        ctx.fill();
        ctx.restore();
      }
    }

    const petals = Array.from({ length: 30 }, () => new Petal());
    function animatePetals() {
      ctx.clearRect(0, 0, petalCanvas.width, petalCanvas.height);
      petals.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animatePetals);
    }
    animatePetals();
  }

  // ========== CURSOR GLOW ==========
  const cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow) {
    gsap.set(cursorGlow, { xPercent: -50, yPercent: -50 });
    window.addEventListener('mousemove', e => {
      gsap.to(cursorGlow, {
        x: e.clientX,
        y: e.clientY,
        duration: 0.8,
        ease: 'power2.out'
      });
    });
  }

  // ========== NAV SCROLL ==========
  const nav = document.getElementById('mainNav');
  if (nav) {
    ScrollTrigger.create({
      start: 'top -50',
      onUpdate: (self) => { nav.classList.toggle('scrolled', self.scroll() > 50); }
    });
  }

  // ========== HERO INTRO (Clean Targets) ==========
  const introTL = gsap.timeline();
  if (document.querySelector('.hero-left')) {
    introTL
      .from('.hero-left', { x: -40, opacity: 0, duration: 1, ease: 'power3.out' })
      .from('.hero-right', { x: 40, opacity: 0, scale: 0.98, duration: 1.2, ease: 'expo.out' }, '-=0.85');
    if (document.querySelector('.hero-below')) {
      introTL.from('.hero-below', { y: 24, opacity: 0, duration: 0.75, ease: 'power2.out' }, '-=0.5');
    }
  }

  // ========== MOBILE NAV ==========
  const navHamburger = document.getElementById('navHamburger');
  const navLinks = document.getElementById('navLinks');
  if (navHamburger && navLinks) {
    navHamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ========== HERO DUAL PLATFORM GALLERY ==========
  const heroRight = document.getElementById('heroRight');
  const heroMainFig = document.getElementById('heroDeviceMainFig');
  const heroMainImg = document.getElementById('heroGalleryMain');
  if (heroRight && heroMainImg && heroMainFig) {
    function syncMainFromPanel(platform) {
      const panel = heroRight.querySelector(`.hero-device-thumbs[data-platform="${platform}"]`);
      if (!panel) return;
      const active = panel.querySelector('.hero-thumb.is-active');
      if (active && active.dataset.src) {
        heroMainImg.src = active.dataset.src;
        heroMainImg.alt = active.dataset.alt || '';
      }
    }

    function setPlatform(platform) {
      heroRight.dataset.active = platform;
      heroMainFig.classList.toggle('hero-device-main--desktop', platform === 'pc');
      heroRight.querySelectorAll('.hero-platform-tab').forEach((tab) => {
        const on = tab.dataset.platform === platform;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on);
        tab.setAttribute('tabindex', on ? '0' : '-1');
      });
      syncMainFromPanel(platform);
    }

    function setActiveThumb(panel, btn) {
      panel.querySelectorAll('.hero-thumb').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
    }

    heroRight.querySelectorAll('.hero-device-thumbs').forEach((panel) => {
      panel.querySelectorAll('.hero-thumb').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (heroRight.dataset.active !== panel.dataset.platform) return;
          setActiveThumb(panel, btn);
          heroMainImg.src = btn.dataset.src;
          heroMainImg.alt = btn.dataset.alt || '';
        });
      });
    });

    heroRight.querySelectorAll('.hero-platform-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const platform = tab.dataset.platform;
        const panel = heroRight.querySelector(`.hero-device-thumbs[data-platform="${platform}"]`);
        if (panel) {
          panel.querySelectorAll('.hero-thumb').forEach((b, i) => {
            b.classList.toggle('is-active', i === 0);
            b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
          });
        }
        setPlatform(platform);
      });
    });

    syncMainFromPanel('android');
  }

  // ========== SECTION LOGIC ==========
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => {
    const inner = section.querySelector('.section-inner');
    const layers = section.querySelectorAll('.parallax-layer');

    // Simple reveal
    gsap.from(inner, {
      y: 40,
      opacity: 0,
      duration: 1,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 85%',
        toggleActions: 'play none none none'
      }
    });

    // Subtler Parallax
    layers.forEach(layer => {
      let speed = 0;
      if (layer.classList.contains('parallax-back')) speed = -30;
      if (layer.classList.contains('parallax-mid')) speed = 15;
      if (layer.classList.contains('parallax-front')) speed = 40;

      gsap.to(layer, {
        y: speed,
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });
  });

  // ========== MODAL ENGINE ==========
  const modal = document.getElementById('comingSoonModal');
  const modalClose = document.getElementById('modalClose');

  function openModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!modal) return;

    // Reset state before showing
    gsap.killTweensOf([modal, '.modal']);
    modal.style.display = 'flex';
    modal.classList.add('active');

    gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    gsap.fromTo('.modal',
      { scale: 0.85, y: 40, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' }
    );
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    gsap.to(modal, { opacity: 0, duration: 0.3, display: 'none', onComplete: () => modal.classList.remove('active') });
    document.body.style.overflow = '';
  }

  const triggerList = document.querySelectorAll('.modal-trigger');

  triggerList.forEach(t => {
    // Passive: false is critical for preventDefault to work on some mobile browsers
    t.addEventListener('click', openModal);
    t.addEventListener('touchstart', openModal, { passive: false });
  });
  modalClose?.addEventListener('click', closeModal);
  modalClose?.addEventListener('touchstart', closeModal, { passive: false });
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal?.addEventListener('touchstart', e => { if (e.target === modal) closeModal(); }, { passive: false });

  // ========== CARDS & TABS ==========
  const tiltCards = document.querySelectorAll('.about-card, .tab-panels');
  tiltCards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(card, { rotateY: x * 10, rotateX: -y * 10, duration: 0.4, ease: 'power2.out' });
      const shine = card.querySelector('.card-shine');
      if (shine) gsap.to(shine, { opacity: 1, x: x * 80 + '%', y: y * 80 + '%', duration: 0.4 });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.8 });
      const shine = card.querySelector('.card-shine');
      if (shine) gsap.to(shine, { opacity: 0, duration: 0.5 });
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const handleTab = (e) => {
      if (e.type === 'touchstart') e.preventDefault();
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => {
        if (p.id === `tab-${target}`) {
          p.classList.add('active');
          gsap.fromTo(p, { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.4 });
        } else {
          p.classList.remove('active');
        }
      });
    };
    btn.addEventListener('click', handleTab);
    btn.addEventListener('touchstart', handleTab, { passive: false });
  });

  // SCRAMBLE TEXT
  document.querySelectorAll('.scramble-text').forEach(el => {
    const text = el.dataset.text || el.textContent;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    ScrollTrigger.create({
      trigger: el, start: 'top 95%',
      onEnter: () => {
        let i = 0;
        const interval = setInterval(() => {
          el.textContent = text.split('').map((c, idx) => idx < i ? text[idx] : chars[Math.floor(Math.random() * 26)]).join('');
          if (i >= text.length) clearInterval(interval);
          i += 1 / 4;
        }, 30);
      }
    });
  });

  // ========== PUBLIC BETA COUNTDOWN ==========
  function initCountdown() {
    // Delayed by 2.5 hours
    const targetDate = new Date('March 1, 2026 02:30:00').getTime();
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minsEl = document.getElementById('minutes');
    const secsEl = document.getElementById('seconds');
    const progressFill = document.querySelector('.hud-progress-fill');

    if (!daysEl) return;

    let countdownInterval; // Declare countdownInterval here

    function update() {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance <= 0) {
        clearInterval(countdownInterval);

        const grid = document.querySelector('.countdown-grid');
        if (grid) grid.style.display = 'none';

        const hudStatus = document.getElementById('hudStatusText');
        if (hudStatus) hudStatus.textContent = "ANDROID v1.6.3 · LIVE";

        const hudDate = document.getElementById('hudDateText');
        if (hudDate) {
          hudDate.textContent = "AVAILABLE NOW";
          hudDate.style.color = "var(--sakura-pink)";
          hudDate.style.textShadow = "0 0 10px rgba(255, 107, 157, 0.5)";
        }

        const progress = document.querySelector('.hud-progress-fill');
        if (progress) progress.style.width = '100%';

        return;
      }

      const d = Math.floor(distance / (1000 * 60 * 60 * 24));
      const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((distance % (1000 * 60)) / 1000);

      daysEl.textContent = d.toString().padStart(2, '0');
      hoursEl.textContent = h.toString().padStart(2, '0');
      minsEl.textContent = m.toString().padStart(2, '0');
      secsEl.textContent = s.toString().padStart(2, '0');

      // Subtle progress bar animation (simulating prep status)
      if (progressFill) {
        const totalDuration = targetDate - new Date('Feb 24, 2026 00:00:00').getTime();
        const elapsed = now - new Date('Feb 24, 2026 00:00:00').getTime();
        const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        progressFill.style.width = pct + '%';
      }
    }

    update();
    countdownInterval = setInterval(update, 1000);
  }
  initCountdown();

})();
