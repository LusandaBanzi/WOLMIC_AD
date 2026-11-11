/* =========================================================
   WOLMIC · Thanksgiving & Pastor’s Appreciation advert
   - One logo element that MORPHS between anchors (hero → header → badge → closing)
   - Logo-led page transitions: logo spins into a badge, a gold ring + circle wipe reveals the next slide
   - Split text, motion path, typewriter, countdown, autoplay
   ========================================================= */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = ms => new Promise(res => setTimeout(res, ms));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 200));

  /* ---------- Event details (edit here) ---------- */
  const EVENT = {
    start: new Date('2026-11-28T10:00:00+02:00'),   // Saturday 28 Nov 2026, 10:00 SAST
    hours: 3,                                       // length used for the calendar file
    title: 'Thanksgiving & Pastor\'s Appreciation',
    place: 'Stand 1597, Extension 5 (Emalahleni), Kwaguqa Ezinambeni',
    about: 'Word of Life Ministries International Church. Hosted by Pastor JS & Mrs LS Ngweya. Guest speaker: Apostle Elliot Mtshweni.'
  };

  const EASE = {
    morph: 'cubic-bezier(.7,0,.2,1)',
    pop:   'cubic-bezier(.3,1.25,.5,1)',
    iris:  'cubic-bezier(.65,0,.2,1)'
  };

  const slides   = $$('.slide');
  const logo     = $('#logo');
  const ringEl   = $('#ring');
  const controls = $('#controls');
  const dotsWrap = $('#dots');
  const live     = $('#live');
  const preload  = $('#preloader');

  let current = -1;
  let busy = true;
  let playing = true;
  let started = false;

  /* =========================================================
     Setup: delays, split text, dots
     ========================================================= */
  $$('[data-delay]').forEach(el => el.style.setProperty('--d', el.dataset.delay + 'ms'));
  $$('[data-speed]').forEach(el => el.style.setProperty('--speed', el.dataset.speed + 'ms'));

  $$('[data-split]').forEach(el => {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    let i = 0;
    text.split(' ').forEach((word, wi, all) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      [...word].forEach(ch => {
        const c = document.createElement('span');
        c.className = 'ch';
        c.style.setProperty('--i', i++);
        c.textContent = ch;
        w.appendChild(c);
      });
      el.appendChild(w);
      if (wi < all.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  slides.forEach((s, i) => {
    s.inert = true;
    const b = document.createElement('button');
    b.className = 'dot';
    b.type = 'button';
    b.setAttribute('aria-label', `Go to slide ${i + 1}: ${s.dataset.title}`);
    b.innerHTML = '<i></i>';
    b.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(b);
  });
  const dots = $$('.dot');

  /* Photos are fetched after the intro so the first paint only needs the logo */
  function hydrate(slide) {
    $$('img[data-src]', slide).forEach(img => {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
    });
  }

  /* =========================================================
     Logo MORPH
     The logo is one fixed element. Each state is a rectangle (position + size)
     plus a "badge" look (circle, navy fill, gold ring, glow). Animating between
     states with the Web Animations API gives the ellipse → circle → ellipse morph.
     ========================================================= */
  let L = null;   // current painted state

  function rectOf(name) {
    if (name === 'badge') {
      const d = Math.round(Math.min(240, innerWidth * 0.46, innerHeight * 0.36));
      return { x: (innerWidth - d) / 2, y: (innerHeight - d) / 2, w: d, h: d, pad: d * 0.1, bg: 0.96, ring: 3, glow: 1, rot: 0 };
    }
    const r = $(`[data-anchor="${name}"]`).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, pad: 0, bg: 0, ring: 0, glow: 0, rot: 0 };
  }

  const styleOf = s => ({
    left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px',
    padding: s.pad + 'px',
    backgroundColor: `rgba(252,246,230,${s.bg})`,
    boxShadow:
      `0 0 0 ${s.ring}px rgba(212,166,74,${s.ring ? 1 : 0}),` +
      `0 0 ${70 * s.glow}px rgba(241,211,144,${0.5 * s.glow}),` +
      `0 ${26 * s.bg}px ${52 * s.bg}px rgba(59,36,23,${0.35 * s.bg})`,
    transform: `rotate(${s.rot}deg)`
  });

  function paint(s) { Object.assign(logo.style, styleOf(s)); L = { ...s, rot: 0 }; }

  async function morph(target, { duration = 900, easing = EASE.morph, spin = 0 } = {}) {
    if (reduce.matches || duration <= 0) { paint(target); return; }
    const anim = logo.animate(
      [styleOf(L), styleOf({ ...target, rot: spin })],
      { duration, easing, fill: 'forwards' }
    );
    try { await anim.finished; } catch (_) { /* cancelled */ }
    paint(target);
    anim.cancel();
  }

  const logoStateFor = slide => slide.dataset.logo;   // 'header' or 'close'

  /* =========================================================
     Slide-specific hooks
     ========================================================= */
  let typeTimer = 0, cdTimer = 0, starTimer = 0;

  const hooks = {
    invite: {
      enter(s) {
        const m = $('animateMotion', s);
        clearTimeout(starTimer);
        if (m && m.beginElement && !reduce.matches) starTimer = setTimeout(() => m.beginElement(), 1650);
      },
      leave() { clearTimeout(starTimer); }
    },
    when: {
      enter(s) { startCountdown(); typeVerse(s); },
      leave()  { clearInterval(cdTimer); clearTimeout(typeTimer); }
    }
  };
  const runHook = (slide, kind) => hooks[slide.dataset.key]?.[kind]?.(slide);

  function typeVerse(s) {
    const el = $('.verse-text', s);
    const full = el.dataset.text;
    clearTimeout(typeTimer);
    if (reduce.matches) { el.textContent = full; return; }
    el.textContent = '';
    el.classList.add('is-typing');
    let i = 0;
    typeTimer = setTimeout(function step() {
      el.textContent = full.slice(0, ++i);
      if (i < full.length) {
        const pause = /[,.!]/.test(full[i - 1]) ? 320 : 0;
        typeTimer = setTimeout(step, 42 + pause);
      } else {
        setTimeout(() => el.classList.remove('is-typing'), 1800);
      }
    }, 2700);
  }

  function startCountdown() {
    clearInterval(cdTimer);
    const units = { d: $('[data-unit="d"]'), h: $('[data-unit="h"]'), m: $('[data-unit="m"]'), s: $('[data-unit="s"]') };
    const label = $('#cd-label'), wrap = $('#cd-units');
    const end = EVENT.start.getTime() + EVENT.hours * 3600e3;

    const set = (key, val) => {
      const txt = String(val).padStart(2, '0');
      if (units[key].textContent !== txt) {
        units[key].textContent = txt;
        units[key].classList.remove('tick');
        void units[key].offsetWidth;
        if (!reduce.matches) units[key].classList.add('tick');
      }
    };
    const update = () => {
      const now = Date.now(), diff = EVENT.start.getTime() - now;
      if (diff <= 0) {
        wrap.innerHTML = `<p class="cd-msg">${now < end ? 'Happening now. Come and join us!' : 'Thank you for joining us.'}</p>`;
        label.textContent = '';
        clearInterval(cdTimer);
        return;
      }
      const t = Math.floor(diff / 1000);
      set('d', Math.floor(t / 86400));
      set('h', Math.floor(t % 86400 / 3600));
      set('m', Math.floor(t % 3600 / 60));
      set('s', t % 60);
    };
    update();
    cdTimer = setInterval(update, 1000);
  }

  /* =========================================================
     Autoplay progress (lives inside the active dot)
     ========================================================= */
  function startBar() {
    const dot = dots[current];
    dots.forEach(d => d.removeAttribute('aria-current'));
    dot.style.setProperty('--dur', (slides[current].dataset.dur || 7000) + 'ms');
    void dot.offsetWidth;
    dot.setAttribute('aria-current', 'true');
  }
  dotsWrap.addEventListener('animationend', e => {
    if (e.animationName === 'fill' && playing && !busy) next();
  });

  function updateUI(i) {
    slides.forEach((s, n) => { s.inert = n !== i; });
    dots.forEach((d, n) => { if (n !== i) d.removeAttribute('aria-current'); });
    document.body.dataset.slide = i;
    live.textContent = `Slide ${i + 1} of ${slides.length}: ${slides[i].dataset.title}`;
    slides.forEach((s, n) => s.setAttribute('aria-hidden', n !== i ? 'true' : 'false'));
  }

  /* =========================================================
     Page transition: logo → badge (spin) → gold ring + circle wipe → logo morphs to its new home
     ========================================================= */
  async function goTo(i) {
    if (busy || i === current || i < 0 || i >= slides.length) return;
    busy = true;
    const from = slides[current], to = slides[i];
    dots[current].removeAttribute('aria-current');

    /* Reduced motion: simple swap, logo jumps */
    if (reduce.matches) {
      runHook(from, 'leave');
      from.classList.remove('is-active');
      hydrate(to);
      to.classList.add('is-active');
      current = i; updateUI(i);
      paint(rectOf(logoStateFor(to)));
      runHook(to, 'enter');
      busy = false; startBar();
      return;
    }

    runHook(from, 'leave');
    from.classList.add('is-leaving');                                   // exit animations
    await morph(rectOf('badge'), { duration: 650, spin: 360, easing: EASE.morph });   // MORPH #1: logo → spinning badge

    hydrate(to);
    updateUI(i);
    const R = Math.hypot(innerWidth, innerHeight) / 2 + 8;
    to.classList.add('is-entering');

    ringEl.style.width = ringEl.style.height = (R * 2) + 'px';
    ringEl.animate(
      [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 1 },
       { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .85 },
       { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }],
      { duration: 950, easing: EASE.iris }
    );
    const iris = to.animate(
      [{ clipPath: 'circle(0px at 50% 50%)' }, { clipPath: `circle(${R}px at 50% 50%)` }],
      { duration: 900, easing: EASE.iris, fill: 'both' }
    );

    setTimeout(() => { to.classList.add('is-active'); runHook(to, 'enter'); }, 240);   // content animates while the circle opens
    const landing = wait(480).then(() => morph(rectOf(logoStateFor(to)), { duration: 900, easing: EASE.pop })); // MORPH #2: badge → new home

    await iris.finished;
    iris.cancel();
    from.classList.remove('is-active', 'is-leaving');
    to.classList.remove('is-entering');
    await landing;

    current = i;
    busy = false;
    startBar();
  }

  const next = () => goTo((current + 1) % slides.length);
  const prev = () => goTo((current - 1 + slides.length) % slides.length);

  /* =========================================================
     Intro: logo appears big in the middle, then MORPHS up into the header
     ========================================================= */
  async function intro() {
    const img = $('img', logo);
    const bar = $('.load i');
    const minShow = wait(reduce.matches ? 150 : 1800);

    paint(rectOf('hero'));
    requestAnimationFrame(() => { bar.style.width = '100%'; });

    await Promise.all([
      img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
      Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2500)])
    ]);

    logo.classList.add('is-ready');
    if (!reduce.matches) {
      logo.animate(
        [{ opacity: 0, transform: 'scale(.78) rotate(-10deg)', filter: 'blur(10px)' },
         { opacity: 1, transform: 'scale(1) rotate(0)', filter: 'blur(0)' }],
        { duration: 1200, easing: EASE.pop }
      );
    }
    await minShow;

    /* open slide 1 and morph the logo to the header */
    current = 0;
    hydrate(slides[0]);
    slides[0].classList.add('is-active');
    updateUI(0);
    runHook(slides[0], 'enter');
    preload.style.opacity = '0';
    document.body.classList.add('is-ready');
    await morph(rectOf('header'), { duration: 1300, easing: EASE.morph });
    preload.remove();

    busy = false;
    started = true;
    startBar();
    idle(() => slides.forEach(hydrate));     // fetch the remaining photos while the first slide plays
  }

  /* =========================================================
     Controls, keyboard, swipe, wheel
     ========================================================= */
  $('#next').addEventListener('click', next);
  $('#prev').addEventListener('click', prev);
  $('#play').addEventListener('click', e => {
    playing = !playing;
    controls.dataset.paused = String(!playing);
    e.currentTarget.setAttribute('aria-pressed', String(playing));
    e.currentTarget.setAttribute('aria-label', playing ? 'Pause autoplay' : 'Play autoplay');
    if (playing && !busy) startBar();
  });
  $('#brand').addEventListener('click', e => { e.preventDefault(); goTo(0); });

  /* Hold the timer while someone reads or taps a button; also when the tab is hidden */
  let hover = false, hidden = false;
  const hold = () => { controls.dataset.hold = String(hover || hidden); };
  $$('.btn, .info a').forEach(el => {
    el.addEventListener('pointerenter', () => { hover = true; hold(); });
    el.addEventListener('pointerleave', () => { hover = false; hold(); });
    el.addEventListener('focus', () => { hover = true; hold(); });
    el.addEventListener('blur',  () => { hover = false; hold(); });
  });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; hold(); });

  addEventListener('keydown', e => {
    if (!started || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); goTo(0); }
    else if (k === 'End')  { e.preventDefault(); goTo(slides.length - 1); }
  });

  let wheelLock = 0;
  addEventListener('wheel', e => {
    if (!started || Math.abs(e.deltaY) < 30 || Date.now() < wheelLock) return;
    wheelLock = Date.now() + 1600;
    e.deltaY > 0 ? next() : prev();
  }, { passive: true });

  let sx = 0, sy = 0;
  addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? next() : prev();
  }, { passive: true });

  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (!busy && current > -1) paint(rectOf(logoStateFor(slides[current]))); }, 120);
  });

  /* =========================================================
     Add to calendar (.ics generated in the browser)
     ========================================================= */
  $('#addToCal').addEventListener('click', () => {
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = t => t.replace(/[\\,;]/g, m => '\\' + m);
    const end = new Date(EVENT.start.getTime() + EVENT.hours * 3600e3);
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WOLMIC//Thanksgiving 2026//EN',
      'BEGIN:VEVENT', 'UID:wolmic-thanksgiving-2026@wolmic',
      'DTSTAMP:' + fmt(new Date()), 'DTSTART:' + fmt(EVENT.start), 'DTEND:' + fmt(end),
      'SUMMARY:' + esc(EVENT.title), 'LOCATION:' + esc(EVENT.place), 'DESCRIPTION:' + esc(EVENT.about),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'thanksgiving-28-nov-2026.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* =========================================================
     Golden dust (canvas) — light, pauses when hidden
     ========================================================= */
  (function dust() {
    const c = $('#dust'), ctx = c.getContext('2d');
    let w = 0, h = 0, dpr = 1, raf = 0, parts = [];
    const count = matchMedia('(max-width:700px)').matches ? 22 : 46;
    const make = () => ({ x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.8 + .6) * dpr, s: (Math.random() * .25 + .08) * dpr, a: Math.random() * .5 + .15, p: Math.random() * 6.28 });
    const size = () => { dpr = Math.min(devicePixelRatio || 1, 1.5); w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; parts = Array.from({ length: count }, make); };
    const draw = t => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#c9a24d';
      for (const p of parts) {
        p.y -= p.s; p.x += Math.sin(t / 2200 + p.p) * .18 * dpr;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        ctx.globalAlpha = p.a * (.6 + .4 * Math.sin(t / 900 + p.p));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
    };
    const loop = t => { draw(t); raf = requestAnimationFrame(loop); };
    size(); addEventListener('resize', size);
    if (reduce.matches) { draw(0); return; }
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    });
  })();

  intro();
})();
