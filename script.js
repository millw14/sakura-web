/* ========== Sakura — Cinematic 3D Scroll Experience ========== */

(() => {
  'use strict';

  // ========== PETAL PARTICLES ==========
  const petalCanvas = document.getElementById('petalCanvas');
  const ctx = petalCanvas.getContext('2d');
  function resizeCanvas() { petalCanvas.width = window.innerWidth; petalCanvas.height = window.innerHeight; }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  class Petal {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * petalCanvas.width;
      this.y = -20 - Math.random() * 80;
      this.size = 4 + Math.random() * 7;
      this.speedY = 0.25 + Math.random() * 0.6;
      this.speedX = -0.15 + Math.random() * 0.3;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = -0.015 + Math.random() * 0.03;
      this.opacity = 0.12 + Math.random() * 0.28;
      this.wobble = Math.random() * Math.PI * 2;
      this.wobbleSpeed = 0.008 + Math.random() * 0.015;
    }
    update() {
      this.y += this.speedY;
      this.wobble += this.wobbleSpeed;
      this.x += this.speedX + Math.sin(this.wobble) * 0.25;
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
      ctx.fillStyle = `hsl(${340 + Math.random() * 20}, 80%, ${70 + Math.random() * 15}%)`;
      ctx.fill();
      ctx.restore();
    }
  }

  const petals = Array.from({ length: 20 }, () => new Petal());
  function animatePetals() {
    ctx.clearRect(0, 0, petalCanvas.width, petalCanvas.height);
    petals.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animatePetals);
  }
  animatePetals();

  // ========== CURSOR GLOW (smooth follow) ==========
  const cursorGlow = document.getElementById('cursorGlow');
  let mx = -500, my = -500, cx = -500, cy = -500;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  function updateCursor() {
    cx += (mx - cx) * 0.08;
    cy += (my - cy) * 0.08;
    cursorGlow.style.left = cx + 'px';
    cursorGlow.style.top = cy + 'px';
    requestAnimationFrame(updateCursor);
  }
  updateCursor();

  // ========== NAV ==========
  const nav = document.getElementById('mainNav');
  const navLinksEls = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.section');

  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }

  function updateActiveNav() {
    let current = '';
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.4 && rect.bottom > window.innerHeight * 0.3) {
        current = section.id;
      }
    });
    navLinksEls.forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', href === current);
    });
  }

  // Mobile nav
  const hamburger = document.getElementById('navHamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const spans = hamburger.querySelectorAll('span');
    const open = navLinks.classList.contains('open');
    spans[0].style.transform = open ? 'rotate(45deg) translateY(6.5px)' : '';
    spans[1].style.opacity = open ? '0' : '';
    spans[2].style.transform = open ? 'rotate(-45deg) translateY(-6.5px)' : '';
  });
  navLinksEls.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    });
  });

  // ========== UTILS ==========
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  // ========== SCROLL MOTOR ==========
  const heroContainer = document.getElementById('heroContainer');
  const heroMascot = document.querySelector('.hero-mascot');
  const heroBadge = document.getElementById('heroBadge');
  const heroTitle = document.getElementById('heroTitle');
  const heroTagline = document.getElementById('heroTagline');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroCta = document.getElementById('heroCta');
  const scrollIndicator = document.getElementById('scrollIndicator');

  function updateHero() {
    const rect = heroContainer.getBoundingClientRect();
    const scrolled = -rect.top;
    const runway = heroContainer.offsetHeight - window.innerHeight;
    const raw = clamp(scrolled / runway, 0, 1);

    const p1 = easeOutQuad(clamp(raw / 0.25, 0, 1));
    const p2 = easeOutQuad(clamp((raw - 0.25) / 0.4, 0, 1));
    const p3 = easeOutQuad(clamp((raw - 0.65) / 0.35, 0, 1));

    heroMascot.style.transform = `translateY(${lerp(0, -100, p2)}px) translateZ(50px) scale(${lerp(1, 1.3, p2)})`;
    heroMascot.style.opacity = Math.max(0, 1 - p3 * 1.5);

    heroTitle.style.letterSpacing = lerp(0, 80, p2) + 'px';
    heroTitle.style.transform = `translateZ(100px) scale(${lerp(1, 1.5, p2)})`;
    heroTitle.style.opacity = Math.max(0, 1 - p3 * 1.8);

    heroTagline.style.letterSpacing = lerp(10, 40, p2) + 'px';
    heroTagline.style.opacity = Math.max(0, 1 - p2 * 2);
    heroBadge.style.opacity = Math.max(0, 1 - p2 * 3);
    heroSubtitle.style.opacity = Math.max(0, 1 - p2 * 2);
    heroCta.style.opacity = Math.max(0, 1 - p2 * 3);
  }

  // ========== DEEP PARALLAX ENGINE ==========
  function updateParallax() {
    const vh = window.innerHeight;
    const scrollY = window.scrollY;

    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const distanceFromCenter = (sectionCenter - vh / 2) / vh; // -0.5 to 0.5

      // Only animate if near viewport
      if (rect.top < vh * 1.2 && rect.bottom > -vh * 0.2) {
        const inner = section.querySelector('.section-inner');
        if (inner) inner.classList.add('in-view');

        // Multi-layer parallax
        const layers = section.querySelectorAll('.parallax-layer');
        layers.forEach(layer => {
          let speed = 0;
          if (layer.classList.contains('parallax-back')) speed = -80;
          if (layer.classList.contains('parallax-mid')) speed = 40;
          if (layer.classList.contains('parallax-front')) speed = 120;

          const yOffset = distanceFromCenter * speed;
          // Apply transform while preserving existing Z
          const currentZ = layer.classList.contains('parallax-back') ? -150 :
            layer.classList.contains('parallax-mid') ? 50 : 150;

          layer.style.transform = `translateY(${yOffset}px) translateZ(${currentZ}px)`;
        });

        // Depth of Field (Blur) - Widen focus zone
        const focusZone = 0.2; // 20% from center is sharp
        let blurAmount = 0;
        if (Math.abs(distanceFromCenter) > focusZone) {
          blurAmount = (Math.abs(distanceFromCenter) - focusZone) * 8;
        }
        if (inner) inner.style.filter = `blur(${clamp(blurAmount, 0, 5)}px)`;
      }
    });
  }

  // ========== TEXT ANIMATIONS ==========
  function initSplitText() {
    document.querySelectorAll('.split-text').forEach(el => {
      if (el.dataset.split) return;
      el.dataset.split = '1';
      const text = el.textContent;
      el.innerHTML = '';
      text.split('').forEach((char, i) => {
        const wrap = document.createElement('span');
        wrap.className = 'char-wrap';
        const inner = document.createElement('span');
        inner.className = 'char-inner';
        inner.textContent = char === ' ' ? '\u00A0' : char;
        inner.style.transitionDelay = (i * 0.02) + 's';
        wrap.appendChild(inner);
        el.appendChild(wrap);
      });
    });
  }
  initSplitText();

  const scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scrambleText(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = el.dataset.text || el.textContent;
    let iter = 0;
    const iv = setInterval(() => {
      el.textContent = target.split('').map((c, i) =>
        i < iter ? target[i] : scrambleChars[Math.floor(Math.random() * scrambleChars.length)]
      ).join('');
      if (iter >= target.length) clearInterval(iv);
      iter += 1;
    }, 25);
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.classList.contains('split-text')) el.classList.add('revealed');
        if (el.classList.contains('scramble-text')) scrambleText(el);
        if (el.classList.contains('fade-in-text')) el.classList.add('revealed');
        if (el.classList.contains('reveal-card')) el.classList.add('revealed');
        revealObserver.unobserve(el);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.split-text, .scramble-text, .fade-in-text, .reveal-card').forEach(el => {
    revealObserver.observe(el);
  });

  // ========== TABS ==========
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `tab-${target}`) panel.classList.add('active');
      });
    });
  });

  // ========== HORIZONTAL SCROLL ==========
  const horizTrack = document.querySelector('.horiz-track');
  if (horizTrack) horizTrack.innerHTML += horizTrack.innerHTML;

  // ========== MODAL ==========
  const downloadBtn = document.getElementById('downloadBtn');
  const modal = document.getElementById('comingSoonModal');
  const modalClose = document.getElementById('modalClose');

  downloadBtn?.addEventListener('click', e => { e.preventDefault(); modal.classList.add('active'); document.body.style.overflow = 'hidden'; });
  function closeModal() { modal.classList.remove('active'); document.body.style.overflow = ''; }
  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // ========== MAIN RAF LOOP ==========
  function tick() {
    updateNav();
    updateActiveNav();
    updateHero();
    updateParallax();
    requestAnimationFrame(tick);
  }
  tick();

})();
