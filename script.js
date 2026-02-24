/* ========== Sakura — Cinematic 2.0 (Polished & Robust) ========== */

(() => {
  'use strict';

  // Register GSAP Plugins
  gsap.registerPlugin(ScrollTrigger);

  // ========== PETAL PARTICLES ==========
  const petalCanvas = document.getElementById('petalCanvas');
  const ctx = petalCanvas.getContext('2d');
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
  // Ensure targets exist before animating
  if (document.querySelector('.hero-left')) {
    introTL
      .from('.hero-left', { x: -60, opacity: 0, duration: 1.2, ease: 'power3.out' })
      .from('.hero-right', { x: 60, opacity: 0, scale: 0.95, duration: 1.5, ease: 'expo.out' }, '-=1')
      .from('.hero-hud', { opacity: 0, duration: 1 }, '-=0.8');
  }

  // Hero Scroll Parallax
  const heroScrollTL = gsap.timeline({
    scrollTrigger: {
      trigger: '#heroContainer',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      invalidateOnRefresh: true
    }
  });

  heroScrollTL
    .to('.hero-left', { y: -100, opacity: 0, filter: 'blur(8px)', duration: 1 }, 0)
    .to('.hero-right', { y: -80, scale: 1.05, opacity: 0, filter: 'blur(4px)', duration: 1 }, 0)
    .to('.hero-hud', { opacity: 0, duration: 0.5 }, 0);

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
        toggleActions: 'play none none reverse'
      }
    });

    // Subtler Parallax
    layers.forEach(layer => {
      let speed = 0;
      if (layer.classList.contains('parallax-back')) speed = -60;
      if (layer.classList.contains('parallax-mid')) speed = 30;
      if (layer.classList.contains('parallax-front')) speed = 80;

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

    // Depth-of-Field Blur (Sharp focus zone)
    ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const p = self.progress;
        const dist = Math.abs(p - 0.5) * 2;
        const blurAmount = gsap.utils.clamp(0, 10, (dist - 0.8) * 50);
        gsap.set(inner, { filter: `blur(${blurAmount}px)` });
      }
    });
  });

  // ========== MODAL ENGINE ==========
  const modal = document.getElementById('comingSoonModal');
  const modalClose = document.getElementById('modalClose');

  function openModal(e) {
    if (e) e.preventDefault();
    if (!modal) return;
    modal.classList.add('active');
    gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.4, display: 'flex' });
    gsap.fromTo('.modal', { scale: 0.9, y: 30 }, { scale: 1, y: 0, duration: 0.5, ease: 'back.out(1.5)' });
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    gsap.to(modal, { opacity: 0, duration: 0.3, display: 'none', onComplete: () => modal.classList.remove('active') });
    document.body.style.overflow = '';
  }

  const triggers = document.querySelectorAll('[href="#download"], #downloadBtn, .modal-trigger');
  triggers.forEach(t => t.addEventListener('click', openModal));
  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

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
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => {
        if (p.id === `tab-${target}`) {
          gsap.fromTo(p, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, display: 'block' });
        } else {
          gsap.set(p, { display: 'none' });
        }
      });
    });
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

})();
