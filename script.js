/* Stride Labs — interactions */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  /* ---------- Reel/marquee videos: visible sound toggle (only for clips with real audio) ---------- */
  const ensureMuteButton = (frame, video) => {
    if (!frame || !video || !video.hasAttribute('data-sound')) return null;
    let btn = $('.creel__mute', frame);
    if (btn) return btn;
    frame.insertAdjacentHTML('beforeend', '<button type="button" class="creel__mute" aria-label="Toggle sound" aria-pressed="false"><svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M16.2 8.8a5 5 0 0 1 0 6.4"/><path d="M19 6a9 9 0 0 1 0 12"/></svg><svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M16 9l5 6M21 9l-5 6"/></svg></button>');
    return $('.creel__mute', frame);
  };

  /* ---------- Scroll loop: one rAF-throttled handler for all scroll work ---------- */
  const scrollHandlers = [];
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      scrollHandlers.forEach((fn) => fn(window.scrollY));
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ---------- Preloader: resolves when the intro has cleared the hero ---------- */
  function initPreloader() {
    const el = $('.preloader');
    if (!el || !root.classList.contains('is-preloading')) {
      if (el) el.remove();
      return Promise.resolve();
    }

    try { sessionStorage.setItem('sl-intro', '1'); } catch (e) { /* storage blocked: intro simply replays */ }
    document.body.style.overflow = 'hidden';

    const fill = $('.preloader__fill', el);
    const minTime = reduceMotion ? 400 : 1900;
    const maxTime = 5000;
    const start = performance.now();
    let loaded = document.readyState === 'complete';
    window.addEventListener('load', () => { loaded = true; }, { once: true });

    return new Promise((resolve) => {
      let shown = 0;
      const tick = (now) => {
        const elapsed = now - start;
        const ready = (loaded && elapsed >= minTime) || elapsed >= maxTime;
        // Ease toward 90% while loading; run to 100% once the page is ready.
        const target = ready ? 1 : Math.min(0.9, elapsed / minTime * 0.9);
        shown += (target - shown) * (ready ? 0.18 : 0.08);
        if (ready && shown > 0.995) shown = 1;

        fill.style.setProperty('--lp', shown.toFixed(4));

        if (shown < 1) { requestAnimationFrame(tick); return; }

        setTimeout(() => {
          el.classList.add('is-leaving');
          document.body.style.overflow = '';
          // Start the hero intro as the panel begins to lift.
          setTimeout(resolve, reduceMotion ? 0 : 300);
          setTimeout(() => {
            el.remove();
            root.classList.remove('is-preloading');
          }, reduceMotion ? 350 : 1100);
        }, reduceMotion ? 0 : 250);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------- Navbar ---------- */
  function initNav() {
    const nav = $('.nav');
    const toggle = $('.nav__toggle');
    const menu = $('#nav-menu');
    if (!nav) return;

    scrollHandlers.push((y) => nav.classList.toggle('is-scrolled', y > 24));

    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 981px)').addEventListener('change', (e) => e.matches && setOpen(false));

    // Current-section highlight (the homepage only; sub-pages mark their own link)
    if ($('.nav__links .is-page')) return;
    const links = $$('.nav__links a[href^="#"]:not(.btn)');
    const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  /* ---------- Page scroll progress ---------- */
  function initScrollProgress() {
    const bar = $('.scroll-progress');
    if (!bar) return;
    scrollHandlers.push((y) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--sp', max > 0 ? (y / max).toFixed(4) : 0);
    });
  }

  /* ---------- Reveal on scroll (with sibling stagger) ---------- */
  function initReveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    items.forEach((el) => {
      if (el.closest('.hero')) return;
      const siblings = $$(':scope > .reveal', el.parentElement);
      const i = siblings.indexOf(el);
      if (i > 0) el.style.setProperty('--d', `${Math.min(i, 6) * 0.07}s`);
    });
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- Number counters (real figures only) ---------- */
  function initCounters() {
    const els = $$('[data-count]');
    if (reduceMotion) return;
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = Number(el.dataset.count);
        const dec = Number(el.dataset.dec || 0);
        const start = performance.now();
        const dur = 1400;
        const step = (now) => {
          const t = clamp((now - start) / dur, 0, 1);
          const v = target * (1 - Math.pow(1 - t, 3));
          el.textContent = dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-GB');
          if (t < 1) requestAnimationFrame(step);
        };
        el.textContent = dec ? (0).toFixed(dec) : '0';
        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Hero: flowing route field, cursor glow, magnetic CTAs ---------- */
  function initHero(intro) {
    const hero = $('.hero');
    const canvas = $('.hero__field');
    if (!hero || !canvas) return;
    const ctx = canvas.getContext('2d');
    const inner = $('.hero__inner', hero);
    const glow = $('.hero__glow', hero);

    let w = 0; let h = 0; let dpr = 1;
    let lines = [];
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

    // Direction field: a gentle up-and-to-the-right drift that slowly breathes over time.
    const angleAt = (x, y, t) =>
      -0.32 + 0.38 * Math.sin(x * 0.0032 + t * 0.00011) + 0.3 * Math.cos(y * 0.0041 - t * 0.00008) + 0.12 * Math.sin((x + y) * 0.009);

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth; h = hero.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(clamp(h / 16, 28, 64));
      lines = Array.from({ length: count }, (_, i) => ({ y0: -h * 0.25 + (i / (count - 1)) * h * 1.6 }));
      runners = runners.length ? runners : makeRunners();
    };

    const STEP = 14;
    const trace = (line, t) => {
      const pts = [];
      let x = -40; let y = line.y0;
      const maxSteps = Math.ceil((w + 80) / STEP) + 20;
      for (let s = 0; s < maxSteps && x < w + 40; s++) {
        const a = angleAt(x, y, t);
        x += Math.cos(a) * STEP; y += Math.sin(a) * STEP;
        const dx = x - mouse.x; const dy = y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const R = 150;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const push = (1 - d / R) * 34;
          pts.push(x + (dx / d) * push, y + (dy / d) * push);
        } else {
          pts.push(x, y);
        }
      }
      return pts;
    };

    let runners = [];
    function makeRunners() {
      return Array.from({ length: 5 }, (_, i) => ({ line: 0, p: Math.random(), speed: 0.00006 + Math.random() * 0.00005, seed: i }));
    }
    const assignRunner = (r) => { r.line = Math.floor(lines.length * (0.25 + Math.random() * 0.6)); r.p = 0; };

    let reveal = reduceMotion ? 1 : 0;
    let revealStart = null;
    let last = performance.now();

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const traced = lines.map((l) => trace(l, t));

      ctx.lineWidth = 1;
      traced.forEach((pts, i) => {
        const n = Math.floor((pts.length / 2) * reveal);
        if (n < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let k = 1; k < n; k++) ctx.lineTo(pts[k * 2], pts[k * 2 + 1]);
        ctx.strokeStyle = i % 6 === 0 ? 'rgba(16,19,20,.16)' : 'rgba(16,19,20,.075)';
        ctx.stroke();
      });

      // Ember runners with fading trails
      if (reveal >= 1) {
        // Keep the trails clear of the text column so the copy stays readable.
        const fade = (x) => (w < 700 ? 0.3 : clamp((x - w * 0.45) / (w * 0.22), 0, 1));
        runners.forEach((r) => {
          const pts = traced[r.line];
          if (!pts) return;
          const segs = pts.length / 2;
          const head = Math.floor(r.p * segs);
          const tail = Math.max(0, head - 26);
          for (let k = tail + 1; k <= head && k < segs; k++) {
            const a = (k - tail) / (head - tail || 1);
            ctx.beginPath();
            ctx.moveTo(pts[(k - 1) * 2], pts[(k - 1) * 2 + 1]);
            ctx.lineTo(pts[k * 2], pts[k * 2 + 1]);
            ctx.strokeStyle = `rgba(242,100,25,${(a * 0.85 * fade(pts[k * 2])).toFixed(3)})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
          if (head < segs) {
            const hx = pts[head * 2]; const hy = pts[head * 2 + 1];
            const f = fade(hx);
            if (f > 0.01) {
              ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fillStyle = `rgba(242,100,25,${(0.12 * f).toFixed(3)})`; ctx.fill();
              ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fillStyle = `rgba(242,100,25,${f.toFixed(3)})`; ctx.fill();
            }
          }
        });
      }
    };

    build();
    runners.forEach(assignRunner);
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 150); });

    if (reduceMotion) { draw(0); return; }

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    intro.then(() => { revealStart = performance.now() + 200; });

    const frame = (now) => {
      const dt = Math.min(64, now - last); last = now;
      if (visible) {
        if (revealStart !== null && reveal < 1) {
          const p = clamp((now - revealStart) / 2200, 0, 1);
          reveal = 1 - Math.pow(1 - p, 3);
        }
        mouse.x += (mouse.tx - mouse.x) * 0.08;
        mouse.y += (mouse.ty - mouse.y) * 0.08;
        runners.forEach((r) => { r.p += r.speed * dt; if (r.p > 1.15) assignRunner(r); });
        draw(now);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    // Cursor: bend the field and move the warm glow
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
      if (mouse.x < -1000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      glow.style.setProperty('--gx', `${mouse.tx}px`);
      glow.style.setProperty('--gy', `${mouse.ty}px`);
    });
    hero.addEventListener('pointerleave', () => { mouse.tx = -9999; mouse.ty = -9999; mouse.x = -9999; mouse.y = -9999; });

    // Content drifts up and fades as the hero scrolls away
    scrollHandlers.push((y) => {
      const vh = window.innerHeight;
      if (y > vh * 1.2) return;
      const p = clamp(y / vh, 0, 1);
      inner.style.transform = `translate3d(0, ${(p * -60).toFixed(1)}px, 0)`;
      inner.style.opacity = (1 - p * 0.9).toFixed(3);
    });
  }

  /* ---------- The Stride Method: scroll-linked route ---------- */
  function initMethod() {
    const section = $('.method');
    if (!section) return;
    const track = $('.method__track', section);
    const line = $('.method__line', section);
    const steps = $$('.mstep', section);
    const words = $$('.method__word', section);
    const stageOut = $('[data-stage]', section);
    const desktop = window.matchMedia('(min-width: 900px)');
    let stops = [];

    // Where each stage's node sits along the route (0–1), measured from the layout
    const measure = () => {
      if (desktop.matches && line.offsetWidth) {
        const lx = line.getBoundingClientRect().left;
        const lw = line.offsetWidth;
        stops = steps.map((s) => clamp((s.getBoundingClientRect().left - lx) / lw, 0, 1));
        stops[0] = 0.02;
      } else {
        stops = steps.map((_, i) => (i + 0.3) / steps.length);
      }
    };

    const applyPin = () => section.classList.toggle('is-pinned', desktop.matches && !reduceMotion);
    applyPin();
    measure();
    desktop.addEventListener('change', () => { applyPin(); measure(); onScroll(); });
    window.addEventListener('resize', measure);

    let current = -1;
    const render = (p) => {
      track.style.setProperty('--p', p.toFixed(4));
      let idx = 0;
      stops.forEach((at, i) => { if (p >= at) idx = i; });
      if (idx === current) return;
      current = idx;
      steps.forEach((s, i) => {
        s.classList.toggle('is-active', i === idx);
        s.classList.toggle('is-done', i < idx);
      });
      words.forEach((w, i) => {
        w.classList.toggle('is-current', i === idx);
        w.classList.toggle('is-past', i < idx);
      });
      if (stageOut) stageOut.textContent = String(idx + 1).padStart(2, '0');
    };

    if (reduceMotion) { render(1); steps.forEach((s) => s.classList.add('is-active')); return; }

    scrollHandlers.push(() => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      let p;
      if (section.classList.contains('is-pinned')) {
        const scrollable = rect.height - vh;
        p = scrollable > 0 ? clamp(-rect.top / (scrollable * 0.9), 0, 1) : 1;
      } else {
        const tRect = track.getBoundingClientRect();
        p = clamp((vh * 0.7 - tRect.top) / tRect.height, 0, 1);
      }
      render(p);
    });
  }

  /* ---------- About: statement lights up word by word on scroll ---------- */
  function initAboutStatement() {
    const el = $('[data-words]');
    if (!el) return;
    const wrap = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.append(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          wrap(child);
        }
      });
    };
    wrap(el);
    const words = $$('.w', el);

    if (reduceMotion) { words.forEach((w) => w.classList.add('is-lit')); return; }

    let lit = -1;
    scrollHandlers.push(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.05), 0, 1);
      const n = Math.round(p * words.length);
      if (n === lit) return;
      lit = n;
      words.forEach((w, i) => w.classList.toggle('is-lit', i < n));
    });
  }

  /* ---------- Service chapters: progress rail + current item ---------- */
  function initChapters() {
    const chapters = $$('.chapter');
    if (!chapters.length) return;
    const data = chapters.map((ch) => ({ main: $('.chapter__main', ch), items: $$('.citem', ch) }));
    // Video + Social chapters: toggle is-open to run their ambient animations; Video also runs a REC timecode (24 fps)
    $$('.chapter--cine, .chapter--social').forEach((ch) => {
      const tc = $('[data-timecode]', ch);
      let on = false; let elapsed = 0; let last = 0;
      const pad = (n) => String(n).padStart(2, '0');
      const tick = (now) => {
        if (!on) return;
        elapsed += now - last; last = now;
        const s = Math.floor(elapsed / 1000);
        tc.textContent = `00:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(Math.floor((elapsed / 1000) * 24) % 24)}`;
        requestAnimationFrame(tick);
      };
      new IntersectionObserver(([e]) => {
        ch.classList.toggle('is-open', e.isIntersecting);
        if (e.isIntersecting && !on && tc && !reduceMotion) { on = true; last = performance.now(); requestAnimationFrame(tick); }
        else if (!e.isIntersecting) on = false;
      }, { threshold: 0.15 }).observe(ch);
    });
    if (reduceMotion) { data.forEach((d) => d.main.style.setProperty('--cp', 1)); return; }
    scrollHandlers.push(() => {
      const mark = window.innerHeight * 0.55;
      data.forEach(({ main, items }) => {
        const r = main.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        main.style.setProperty('--cp', clamp((mark - r.top) / r.height, 0, 1).toFixed(4));
        items.forEach((it) => {
          const ir = it.getBoundingClientRect();
          it.classList.toggle('is-current', ir.top < mark && ir.bottom >= mark);
        });
      });
    });
  }

  /* ---------- Magnetic buttons (fine pointers only) ---------- */
  function initMagnetic() {
    if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    $$('.magnetic').forEach((btn) => {
      const innerEl = $('.magnetic__inner', btn);
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.22}px, ${dy * 0.35}px)`;
        if (innerEl) innerEl.style.transform = `translate(${dx * 0.1}px, ${dy * 0.15}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; if (innerEl) innerEl.style.transform = ''; });
    });
  }

  /* ---------- Contact: copy email, cursor glow, drifting mark ---------- */
  function initContact() {
    const section = $('.cta');
    if (!section) return;
    $$('[data-copy]', section).forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          b.textContent = 'Copied';
          b.classList.add('is-done');
          setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('is-done'); }, 1800);
        } catch (e) { window.location.href = `mailto:${b.dataset.copy}`; }
      });
    });
    if (reduceMotion) return;
    const glow = $('.cta__glow', section);
    section.addEventListener('pointermove', (e) => {
      const r = section.getBoundingClientRect();
      glow.style.setProperty('--gx', `${e.clientX - r.left}px`);
      glow.style.setProperty('--gy', `${e.clientY - r.top}px`);
    });
    const mark = $('.cta__mark', section);
    scrollHandlers.push(() => {
      const r = section.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      mark.style.setProperty('--cy', `${((r.top + r.height / 2 - window.innerHeight / 2) * -0.12).toFixed(1)}px`);
    });
  }

  /* ---------- Work page: filters, project drawer, cursor label, hover video ---------- */
  function initWork() {
    const grid = $('.pgrid');
    if (!grid) return;
    const cards = $$('.pcard', grid);
    const empty = $('.wgrid__empty');

    // Filters + search
    const buttons = $$('.wfilter');
    const search = $('.wsearch input');
    const shownEl = $('[data-shown]');
    let activeFilter = 'all';
    const apply = () => {
      const q = search ? search.value.trim().toLowerCase() : '';
      let shown = 0;
      cards.forEach((c) => {
        const inCat = activeFilter === 'all' || c.dataset.tags.split(' ').includes(activeFilter);
        const inText = !q || c.textContent.toLowerCase().includes(q);
        const match = inCat && inText;
        c.classList.toggle('is-hidden', !match);
        if (match) { shown += 1; c.classList.add('is-in'); }
      });
      grid.classList.toggle('is-filtered', activeFilter !== 'all' || !!q);
      if (empty) empty.hidden = shown > 0;
      if (shownEl) shownEl.textContent = String(shown);
    };
    buttons.forEach((b) => b.addEventListener('click', () => {
      activeFilter = b.dataset.filter;
      buttons.forEach((x) => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
      apply();
    }));
    if (search) search.addEventListener('input', apply);

    // Drawer
    const drawer = $('#drawer');
    const body = $('.drawer__body', drawer);
    let lastFocus = null;
    const open = (id, push = true) => {
      const tpl = $(`template[data-body="${id}"]`);
      if (!tpl) return;
      lastFocus = document.activeElement;
      body.replaceChildren(tpl.content.cloneNode(true));
      const title = $('.drawer__title', body);
      if (title) title.id = 'drawer-title';
      // Lift the case-study links to the top so they're visible without scrolling
      const ctas = $$('a.btn', body);
      if (title && ctas.length) {
        const bar = document.createElement('div');
        bar.className = 'drawer__actions';
        ctas.forEach((a) => bar.appendChild(a));
        title.after(bar);
      }
      drawer.hidden = false;
      root.classList.add('has-drawer');
      requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('is-open')));
      $('.drawer__close', drawer).focus({ preventScroll: true });
      if (push) history.replaceState(null, '', `#p-${id}`);
    };
    const close = () => {
      if (drawer.hidden) return;
      drawer.classList.remove('is-open');
      root.classList.remove('has-drawer');
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setTimeout(() => { drawer.hidden = true; body.replaceChildren(); }, reduceMotion ? 0 : 600);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    };
    $$('[data-open]', grid).forEach((b) => b.addEventListener('click', () => open(b.dataset.open)));
    $$('[data-close]', drawer).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (drawer.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const f = $$('a[href], button', drawer).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    const fromHash = () => {
      const m = window.location.hash.match(/^#p-([\w-]+)$/);
      if (!m) return;
      const card = document.getElementById(`p-${m[1]}`);
      if (card) { card.scrollIntoView({ block: 'center' }); open(m[1], false); }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);

    // Cursor label + hover video (fine pointers only)
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const cursor = $('.wcursor');
    window.addEventListener('pointermove', (e) => {
      cursor.style.setProperty('--x', `${e.clientX}px`);
      cursor.style.setProperty('--y', `${e.clientY}px`);
    }, { passive: true });
    $$('.pcard__btn', grid).forEach((b) => {
      const cover = $('.pcover', b);
      const video = $('video', b);
      b.addEventListener('pointerenter', () => {
        cursor.classList.add('is-on');
        if (video && !reduceMotion) {
          if (!video.src) video.src = video.dataset.src;
          video.play().then(() => cover.classList.add('is-playing')).catch(() => {});
        }
      });
      b.addEventListener('pointerleave', () => {
        cursor.classList.remove('is-on');
        if (video) { video.pause(); cover.classList.remove('is-playing'); }
      });
    });
  }


  /* ---------- Poster tilt (pointer parallax + glare) ---------- */
  function initPosterTilt() {
    if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
    $$('.cposter__btn').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        b.classList.add('is-tilting');
        b.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
        b.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
        b.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
        b.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      });
      b.addEventListener('pointerleave', () => {
        b.classList.remove('is-tilting');
        b.style.setProperty('--rx', '0deg');
        b.style.setProperty('--ry', '0deg');
      });
    });
  }


  /* ---------- Poster marquee: speeds up with scroll velocity ---------- */
  function initMarquee() {
    const tracks = $$('.cmarq__track');
    if (!tracks.length || reduceMotion) return;
    let last = window.scrollY; let rate = 1; let running = false;
    const anims = () => tracks.flatMap((t) => t.getAnimations()).filter((a) => a.animationName === 'cmarq');
    const tick = () => {
      const y = window.scrollY; const v = Math.abs(y - last); last = y;
      const target = 1 + clamp(v / 10, 0, 6);
      rate += (target - rate) * 0.12;
      anims().forEach((a) => { a.playbackRate = rate; });
      if (Math.abs(rate - 1) > 0.01 || v > 0) requestAnimationFrame(tick); else { running = false; anims().forEach((a) => { a.playbackRate = 1; }); }
    };
    window.addEventListener('scroll', () => { if (!running) { running = true; requestAnimationFrame(tick); } }, { passive: true });
  }

  /* ---------- Zoom dialog for posters ---------- */
  function initZoom() {
    const d = $('.lightbox[data-zoombox]');
    if (!d || !d.showModal) return;
    const img = $('img', d); const cap = $('figcaption', d);
    $$('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      img.src = b.dataset.zoom; img.alt = b.dataset.cap || ''; cap.textContent = b.dataset.cap || ''; d.showModal();
    }));
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('.lightbox__close')) d.close(); });
  }

  /* ---------- Reels carousel (buttons, drag, keys, hover-to-play) ---------- */
  function initReels() {
    $$('.creels').forEach((root) => {
      const track = $('.creels__track', root);
      const prev = $('[data-reel-prev]', root); const next = $('[data-reel-next]', root);
      const bar = $('.creels__bar span', root);
      if (!track) return;
      const step = () => { const c = $('.creel', track); return c ? c.getBoundingClientRect().width + 20 : 300; };
      const sync = () => {
        const max = track.scrollWidth - track.clientWidth;
        if (prev) prev.disabled = track.scrollLeft <= 4;
        if (next) next.disabled = track.scrollLeft >= max - 4;
        if (bar) bar.style.setProperty('--p', max > 0 ? clamp((track.scrollLeft + track.clientWidth) / track.scrollWidth, 0.1, 1).toFixed(3) : 1);
      };
      if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
      if (next) next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
      });
      let down = false; let sx = 0; let sl = 0; let moved = false;
      track.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - sx;
        if (Math.abs(dx) > 4) { moved = true; track.classList.add('is-drag'); }
        track.scrollLeft = sl - dx;
      });
      window.addEventListener('pointerup', () => { if (!down) return; down = false; track.classList.remove('is-drag'); });
      $$('.creel', track).forEach((slide) => {
        const v = $('video', slide);
        if (!v) return;
        const hasSound = v.hasAttribute('data-sound');
        const sync = () => {
          slide.classList.toggle('is-unmuted', !v.muted);
          const btn = $('.creel__mute', slide); if (btn) btn.setAttribute('aria-pressed', String(!v.muted));
        };
        const play = (sound) => { v.muted = !(hasSound && sound); const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; sync(); v.play().catch(() => {}); }); slide.classList.add('is-playing'); sync(); };
        const stop = () => { v.pause(); v.muted = true; slide.classList.remove('is-playing'); sync(); };
        slide.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') play(false); });
        slide.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') stop(); });
        slide.addEventListener('click', (e) => {
          if (moved) { moved = false; return; }
          if (e.target.closest('.creel__mute')) return;
          if (hasSound && !v.paused && v.muted) { v.muted = false; sync(); return; }
          v.paused ? play(true) : stop();
        });
        if (hasSound) {
          const btn = ensureMuteButton($('.creel__frame', slide), v);
          if (btn) btn.addEventListener('click', (e) => {
            e.stopPropagation();
            v.muted = !v.muted;
            if (!v.muted && v.paused) play(true); else sync();
          });
        }
      });
      const slides = $$('.creel', track);
      slides.forEach((s, i) => {
        s.style.setProperty('--n', i);
        const fr = $('.creel__frame', s);
        if (fr && $('video', s) && !$('.creel__eq', fr)) fr.insertAdjacentHTML('beforeend', '<span class="creel__eq" aria-hidden="true"><i></i><i></i><i></i></span>');
      });
      const total = $('[data-reel-total]', root); if (total) total.textContent = String(slides.length).padStart(2, '0');
      const counter = $('[data-reel-count]', root);
      let shown = -1; let raf = 0;
      const focus = () => {
        raf = 0;
        const tr = track.getBoundingClientRect(); const mid = tr.left + tr.width / 2;
        let best = 0; let bestD = Infinity;
        slides.forEach((s, i) => {
          const r = s.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - mid) / (tr.width / 2);
          s.style.setProperty('--f', clamp(1 - d * 0.9, 0, 1).toFixed(3));
          if (d < bestD) { bestD = d; best = i; }
        });
        if (counter && best !== shown) {
          shown = best; counter.textContent = String(best + 1).padStart(2, '0');
          counter.classList.add('is-tick'); setTimeout(() => counter.classList.remove('is-tick'), 260);
        }
      };
      const queue = () => { if (!raf) raf = requestAnimationFrame(focus); };
      track.addEventListener('scroll', queue, { passive: true });
      window.addEventListener('resize', queue);
      if (reduceMotion || !('IntersectionObserver' in window)) { track.classList.add('is-in'); } else {
        new IntersectionObserver((entries, obs) => { entries.forEach((e) => { if (e.isIntersecting) { track.classList.add('is-in'); obs.disconnect(); } }); }, { threshold: 0.25 }).observe(track);
      }
      focus();
      sync();
    });
  }

  /* ---------- Work tab: two auto-moving rows ---------- */
  function initDuo() {
    const root = $('[data-duo]');
    if (!root) return;
    const rows = $$('[data-duo-row]', root);
    const btn = $('[data-duo-pause]', root); const label = $('[data-duo-pause-label]', root);
    const still = reduceMotion;
    let userPaused = false;
    const syncMute = (it) => {
      const v = $('video', it); if (!v) return;
      it.classList.toggle('is-unmuted', !v.muted);
      const btn = $('.creel__mute', it); if (btn) btn.setAttribute('aria-pressed', String(!v.muted));
    };
    const setEq = (it) => {
      const fr = $('.creel__frame', it); const v = $('video', it);
      if (!fr || !v) return;
      if (!$('.creel__eq', fr)) fr.insertAdjacentHTML('beforeend', '<span class="creel__eq" aria-hidden="true"><i></i><i></i><i></i></span>');
      const btn = ensureMuteButton(fr, v);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          v.muted = !v.muted;
          if (!v.muted && v.paused) play(it, true); else syncMute(it);
        });
      }
    };
    const play = (it, sound) => {
      const v = $('video', it); if (!v) return;
      v.muted = !(sound && v.hasAttribute('data-sound'));
      const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; syncMute(it); v.play().catch(() => {}); });
      it.classList.add('is-playing');
      syncMute(it);
    };
    const stop = (it) => { const v = $('video', it); if (!v) return; v.pause(); v.muted = true; it.classList.remove('is-playing'); syncMute(it); };
    const st = rows.map((row) => {
      const track = $('.duo__track', row);
      const items = $$('.creel', track);
      items.forEach(setEq);
      let clones = [];
      if (!still) {
        clones = items.map((it) => { const c = it.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.setAttribute('inert', ''); c.classList.add('is-clone'); $$('a, button', c).forEach((n) => { n.tabIndex = -1; }); track.appendChild(c); return c; });
      }
      const addSet = () => items.map((it) => { const c = it.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.setAttribute('inert', ''); c.classList.add('is-clone'); $$('a, button', c).forEach((n) => { n.tabIndex = -1; }); track.appendChild(c); return c; });
      if (!still) { const need = Math.max(window.screen.width || 0, window.innerWidth) * 1.15; let guard = 0; while (track.scrollWidth < need * 2 && guard++ < 4) clones = clones.concat(addSet()); }
      const all = items.concat(clones);
      const s = { row, track, all, dir: Number(row.dataset.dir) || -1, speed: Number(row.dataset.speed) || 34, x: 0, w: 0, hover: false, drag: false, vis: false, moved: false, spot: null };
      const measure = () => { s.w = clones.length ? clones[0].offsetLeft - items[0].offsetLeft : 0; if (s.w && s.dir > 0 && s.x === 0) s.x = -s.w * 0.5; };
      measure(); window.addEventListener('resize', measure);
      if ('IntersectionObserver' in window) new IntersectionObserver((es) => { s.vis = es[0].isIntersecting; }, { threshold: 0.15 }).observe(row); else s.vis = true;
      const wrap = () => { if (!s.w) return; while (s.x <= -s.w) s.x += s.w; while (s.x > 0) s.x -= s.w; };
      if (!still) {
        let sx = 0; let sxStart = 0;
        row.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') s.hover = true; });
        row.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') s.hover = false; });
        row.addEventListener('focusin', () => { s.hover = true; });
        row.addEventListener('focusout', () => { s.hover = false; });
        row.addEventListener('pointerdown', (e) => { s.drag = true; s.moved = false; sx = e.clientX; sxStart = s.x; });
        window.addEventListener('pointermove', (e) => {
          if (!s.drag) return;
          const dx = e.clientX - sx;
          if (Math.abs(dx) > 5) { s.moved = true; row.classList.add('is-drag'); }
          if (s.moved) { s.x = sxStart + dx; wrap(); s.track.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,0,0)'; }
        });
        window.addEventListener('pointerup', () => { if (!s.drag) return; s.drag = false; row.classList.remove('is-drag'); setTimeout(() => { s.moved = false; }, 0); });
        row.addEventListener('click', (e) => { if (s.moved) { e.preventDefault(); e.stopPropagation(); } }, true);
      }
      s.wrap = wrap;
      all.forEach((it) => {
        const v = $('video', it); if (!v) return;
        it.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !userPaused) play(it, false); });
        it.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && it !== s.spot) stop(it); });
        it.addEventListener('click', (e) => {
          if (e.target.closest('a') || e.target.closest('.creel__mute')) return;
          if (v.hasAttribute('data-sound') && !v.paused && v.muted) { v.muted = false; syncMute(it); return; }
          v.paused ? play(it, true) : stop(it);
        });
      });
      return s;
    });
    /* motion loop */
    const running = () => !userPaused && !document.hidden;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (running()) st.forEach((s) => {
        if (!s.vis || s.hover || s.drag || !s.w) return;
        s.x += s.dir * s.speed * dt; s.wrap();
        s.track.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,0,0)';
      });
      requestAnimationFrame(frame);
    };
    if (!still) requestAnimationFrame(frame);
    /* spotlight: the clip nearest each row's centre plays, the rest show their still */
    const spotlight = () => {
      st.forEach((s) => {
        if (userPaused || !s.vis || document.hidden) { if (s.spot) { stop(s.spot); s.spot = null; } return; }
        const r = s.row.getBoundingClientRect(); const mid = r.left + r.width / 2;
        let best = null; let bd = Infinity;
        s.all.forEach((it) => { if (!$('video', it)) return; const b = it.getBoundingClientRect(); const d = Math.abs(b.left + b.width / 2 - mid); if (d < bd) { bd = d; best = it; } });
        if (best !== s.spot) { if (s.spot && !s.spot.matches(':hover')) stop(s.spot); s.spot = best; if (best) play(best, false); }
      });
    };
    setInterval(spotlight, 500);
    if (btn) btn.addEventListener('click', () => {
      userPaused = !userPaused;
      btn.setAttribute('aria-pressed', String(userPaused));
      if (label) label.textContent = userPaused ? 'Play' : 'Pause';
      if (userPaused) st.forEach((s) => { if (s.spot) { stop(s.spot); s.spot = null; } });
      else spotlight();
    });
  }

  /* ---------- Boot ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  const intro = initPreloader();

  initNav();
  initScrollProgress();
  initReveal();
  initCounters();
  initAboutStatement();
  initChapters();
  initHero(intro);
  initMethod();
  initMagnetic();
  initContact();
  initWork();
  initPosterTilt();
  initZoom();
  /* ---------- Showcase carousel: gentle auto-advance ---------- */
  function initShowAuto() {
    const root = $('.creels--mix');
    if (!root || reduceMotion) return;
    const track = $('.creels__track', root);
    const next = $('[data-reel-next]', root);
    if (!track || !next) return;
    let paused = false; let visible = false;
    ['pointerenter', 'focusin', 'pointerdown', 'touchstart'].forEach((ev) => root.addEventListener(ev, () => { paused = true; }, { passive: true }));
    ['pointerleave', 'focusout'].forEach((ev) => root.addEventListener(ev, () => { paused = false; }));
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.35 }).observe(root); else visible = true;
    setInterval(() => {
      if (paused || !visible || document.hidden) return;
      const max = track.scrollWidth - track.clientWidth;
      if (track.scrollLeft >= max - 6) track.scrollTo({ left: 0, behavior: 'smooth' }); else next.click();
    }, 4200);
  }
  /* ---------- Showcase: cursor-follow highlight + tilt ---------- */
  function initShowFx() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reduceMotion) return;
    const root = $('.show'); if (!root) return;
    const bind = (el, tilt) => {
      el.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left; const y = e.clientY - r.top;
        el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
        if (tilt) {
          el.style.setProperty('--ry', ((x / r.width - 0.5) * 9).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((0.5 - y / r.height) * 9).toFixed(2) + 'deg');
        }
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    };
    $$('.kpi', root).forEach((el) => bind(el, false));
    $$('.creels--mix .creel__frame', root).forEach((el) => bind(el, true));
  }
  initReels();
  initShowFx();
  initShowAuto();
  initDuo();
  initMarquee();

  intro.then(() => requestAnimationFrame(() => root.classList.add('is-loaded')));
  onScroll();
})();
