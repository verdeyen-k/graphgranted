// Graph and Granted: the screens, drawing, the graph you grab, the level maker and uploads.
// The physics and the built-in levels are in sim.js.
(() => {
  'use strict';
  const { W, H, D, VMAX, STEP, GUY_R, BAR_R, GREY_R, LEVELS } = GG;
  const $ = id => document.getElementById(id);
  const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const clone = o => JSON.parse(JSON.stringify(o));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window: just don't save */ } },
  };

  // ---------- Uploads (Firebase, the same project the other games use) ----------
  const UPLOADS = 'games/graphgranted/levels';
  let db = null;
  try {
    if (window.firebase) db = (firebase.initializeApp({
      apiKey:            'AIzaSyAsJboNGVuESMhkivllUD0o8MUB5LUCMRQ',
      authDomain:        'kvgames.firebaseapp.com',
      databaseURL:       'https://kvgames-default-rtdb.firebaseio.com',
      projectId:         'kvgames',
      storageBucket:     'kvgames.firebasestorage.app',
      messagingSenderId: '463308384695',
      appId:             '1:463308384695:web:5d57623ebd52101ad26032',
    }), firebase.database());
  } catch (e) { db = null; }
  const NO_SERVER = "Can't reach the level server. Check the internet connection.";

  // ---------- Colours ----------
  const COL = {
    r: ['#ef4444', '#b91c1c', '#fca5a5'], b: ['#3b82f6', '#1d4ed8', '#93c5fd'], o: ['#f59e0b', '#b45309', '#fcd34d'],
    grey: '#6b7280', greyDark: '#374151',
  };
  // The guy is drawn like a Coconut Craze player, in green so he doesn't look like a red or blue piece.
  const GUY = ['#51cf66', '#2b8a3e'];

  // ---------- Sound ----------
  let ac = null;
  function beep(notes, type = 'triangle', len = 0.12) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      let t = ac.currentTime;
      for (const f of notes) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + len);
        t += len * 0.8;
      }
    } catch (e) { /* no sound */ }
  }

  // ---------- State ----------
  const S = {
    L: null,            // the level being played or edited
    from: null,         // { kind: 'built', i } | { kind: 'mine', id } | { kind: 'up', key } | { kind: 'link' }
    mode: 'play',       // 'play' or 'edit'
    phase: 'plan',      // 'plan', 'run' or 'done'
    line: { b: 0, m: 0 },
    grab: 'move',
    run: null,          // what's drawn: a fresh run while planning, the real one while running
    testing: false,     // playing your own level from the level maker
    msgTimer: 0,
  };
  const done = new Set(store.get('graphgranted-done', []));
  let mine = store.get('graphgranted-mine', []);
  const saveMine = () => store.set('graphgranted-mine', mine);

  // ---------- Canvases ----------
  const cv = $('level'), ctx = cv.getContext('2d');
  const gcv = $('graph'), gctx = gcv.getContext('2d');
  const view = { s: 1, ox: 0, oy: 0 };
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w: r.width, h: r.height, dpr };
  }

  // ---------- Drawing the level ----------
  function drawLevel() {
    const { w, h, dpr } = sizeCanvas(cv);
    const s = Math.min(w / W, h / H);
    view.s = s; view.ox = (w - W * s) / 2; view.oy = (h - H * s) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#dfe9f5'; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
    // Graph paper
    ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 25) { ctx.strokeStyle = x % 100 ? '#e5edf7' : '#cfdcec'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 25) { ctx.strokeStyle = y % 100 ? '#e5edf7' : '#cfdcec'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    const run = S.run, L = S.L;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const g of L.g) drawGrey(g);
    // Where red and blue will end up, faintly, while you plan.
    if (S.mode === 'play' && S.phase === 'plan') {
      const v = GG.valueAt(S.line, D);
      ctx.globalAlpha = 0.28; ctx.setLineDash([10, 8]);
      for (const k of run.kin) drawKin(k, GG.offsetFor(k.c, v), true);
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (const k of run.kin) drawKin(k, k.off, false);
    for (const b of run.dyn) if (!b.guy && !b.gone) drawOrange(b);
    drawFlag(L.f);
    drawGuy(run.guy);
    if (S.mode === 'edit') drawEditExtras();
    ctx.restore();
  }

  function strokeFat(pts, width, colour) {
    ctx.strokeStyle = colour; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    if (pts.length === 2) ctx.lineTo(pts[0] + 0.01, pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  function drawGrey(g) {
    strokeFat(g, GREY_R * 2 + 3, COL.greyDark);
    strokeFat(g, GREY_R * 2 - 2, COL.grey);
  }
  function drawBar(ax, ay, bx, by, c, ghost) {
    const [fill, dark, light] = COL[c];
    if (ghost) { ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); return; }
    strokeFat([ax, ay, bx, by], BAR_R * 2 + 3, dark);
    strokeFat([ax, ay, bx, by], BAR_R * 2 - 2, fill);
    ctx.globalAlpha = 0.6; strokeFat([ax, ay - 3, bx, by - 3], 3, light); ctx.globalAlpha = 1;
  }
  function drawBall(x, y, r, c, spin, ghost) {
    const [fill, dark, light] = COL[c];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (ghost) { ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.stroke(); return; }
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.stroke();
    // Spokes so you can see it roll.
    ctx.strokeStyle = light; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * Math.PI / 1.5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
      ctx.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); ctx.stroke();
    }
  }
  function drawKin(k, off, ghost) {
    if (k.bar) drawBar(k.ax + off, k.ay, k.bx + off, k.by, k.c, ghost);
    else drawBall(k.x + off, k.y, k.r, k.c, off / k.r, ghost);
  }
  function drawOrange(b) {
    if (b.bar) drawBar(b.x - b.hx, b.y - b.hy, b.x + b.hx, b.y + b.hy, 'o', false);
    else drawBall(b.x, b.y, b.r, 'o', b.spin, false);
  }
  function drawFlag([x, y]) {
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 80); ctx.stroke();
    ctx.fillStyle = '#22c55e'; ctx.strokeStyle = '#15803d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 80); ctx.lineTo(x + 40, y - 68); ctx.lineTo(x + 2, y - 56); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Same look as a Coconut Craze player: a round body, two stepping feet, eyes and a smile.
  function drawGuy(g) {
    const x = g.x, y = g.y, R = GUY_R;
    const walking = S.mode === 'play' && S.phase !== 'plan' && g.onGround;
    const step = walking ? Math.sin(g.legs * 1.8) * 5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, y + R + 1, R * 0.9, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = GUY[1];
    ctx.beginPath(); ctx.ellipse(x - 6 + step * 0.4, y + R - 2, 5, 3.5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 6 - step * 0.4, y + R - 2, 5, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = GUY[0]; ctx.strokeStyle = GUY[1]; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.stroke();
    // He always walks right, so his eyes look right.
    const ex = 4, ey = 0;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * 5 + ex * 0.4, y - 3 + ey, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + s * 5 + ex * 0.7, y - 3 + ey, 2, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.8;
    const sad = S.phase === 'done' && S.run.state !== 'win';
    ctx.beginPath();
    if (sad) ctx.arc(x + 1, y + 9, 4, Math.PI + 0.3, -0.3); else ctx.arc(x + 1, y + 4, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // ---------- Drawing the graph ----------
  const GM = 22; // margin round the graph box, in CSS pixels
  let gsize = 300;
  const gx2px = x => GM + (x + VMAX) / (2 * VMAX) * (gsize - 2 * GM);
  const gy2px = y => GM + (VMAX - y) / (2 * VMAX) * (gsize - 2 * GM);
  const px2gx = p => (p - GM) / (gsize - 2 * GM) * 2 * VMAX - VMAX;
  const px2gy = p => VMAX - (p - GM) / (gsize - 2 * GM) * 2 * VMAX;

  function drawGraph() {
    const { w, h, dpr } = sizeCanvas(gcv);
    gsize = Math.min(w, h);
    const c = gctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.fillRect(GM, GM, gsize - 2 * GM, gsize - 2 * GM);
    for (let i = -VMAX; i <= VMAX; i++) {
      c.strokeStyle = i === 0 ? '#334155' : i % 5 ? '#e6edf5' : '#b9c8da';
      c.lineWidth = i === 0 ? 2 : 1;
      c.beginPath(); c.moveTo(gx2px(i), GM); c.lineTo(gx2px(i), gsize - GM); c.stroke();
      c.beginPath(); c.moveTo(GM, gy2px(i)); c.lineTo(gsize - GM, gy2px(i)); c.stroke();
    }
    c.fillStyle = '#64748b'; c.font = '600 11px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const i of [-10, -5, 5, 10]) {
      c.fillText(i, gx2px(i), gsize - GM / 2);
      c.fillText(i, GM / 2, gy2px(i));
    }
    // The line, cut off at the edge of the box.
    c.save();
    c.beginPath(); c.rect(GM, GM, gsize - 2 * GM, gsize - 2 * GM); c.clip();
    const { b, m } = S.line;
    c.strokeStyle = '#7c3aed'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(gx2px(-VMAX), gy2px(b - m * VMAX)); c.lineTo(gx2px(VMAX), gy2px(b + m * VMAX)); c.stroke();
    c.restore();
    if (S.phase === 'plan' && S.grab === 'rotate') {
      // A ring round the dot: that's what the line turns around.
      c.strokeStyle = '#7c3aed'; c.lineWidth = 3; c.beginPath(); c.arc(gx2px(-VMAX), gy2px(b - m * VMAX), 13, 0, 7); c.stroke();
    }
    // The dot. Its height is the number.
    const t = S.run ? S.run.t : 0, dx = GG.dotX(t), v = GG.valueAt(S.line, t);
    c.strokeStyle = 'rgba(250,204,21,.7)'; c.lineWidth = 2; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(gx2px(dx), GM); c.lineTo(gx2px(dx), gsize - GM); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#facc15'; c.strokeStyle = '#854d0e'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(gx2px(dx), gy2px(v), 8, 0, 7); c.fill(); c.stroke();
    $('number').textContent = fmt(v);
    $('equation').textContent = equation();
  }
  const fmt = v => (Math.round(v * 10) / 10).toFixed(1).replace('-0.0', '0.0');
  function equation() {
    const { b, m } = S.line;
    const mm = Math.round(m * 100) / 100, bb = Math.round(b * 10) / 10;
    let s = 'y = ';
    if (mm) s += (mm === 1 ? '' : mm === -1 ? '−' : String(mm).replace('-', '−')) + 'x';
    if (bb || !mm) s += mm ? (bb < 0 ? ' − ' : ' + ') + Math.abs(bb) : String(bb).replace('-', '−');
    return s;
  }

  // ---------- Grabbing the graph ----------
  let gdrag = null;
  gcv.addEventListener('pointerdown', e => {
    if (S.mode !== 'play' || S.phase !== 'plan') return;
    const r = gcv.getBoundingClientRect();
    gdrag = { id: e.pointerId, x: px2gx(e.clientX - r.left), y: px2gy(e.clientY - r.top), line: { ...S.line } };
    gcv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  gcv.addEventListener('pointermove', e => {
    if (!gdrag || e.pointerId !== gdrag.id) return;
    const r = gcv.getBoundingClientRect();
    const x = px2gx(e.clientX - r.left), y = px2gy(e.clientY - r.top), l0 = gdrag.line;
    if (S.grab === 'move') {
      // Sliding the line: up and down moves it, and so does sideways if it's tilted.
      setLine(l0.b + (y - gdrag.y) - l0.m * (x - gdrag.x), l0.m);
    } else {
      // Turning round the dot at the start, so the starting number (and where everything starts) stays still.
      const py = l0.b - l0.m * VMAX, px = -VMAX;
      if (Math.hypot(gdrag.x - px, gdrag.y - py) < 1.2) return; // too close to the dot to tell which way
      const a0 = Math.atan2(gdrag.y - py, gdrag.x - px), a1 = Math.atan2(y - py, x - px);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      turnTo(l0, Math.atan(l0.m) + da);
    }
  });
  const endG = e => { if (gdrag && e.pointerId === gdrag.id) gdrag = null; };
  gcv.addEventListener('pointerup', endG);
  gcv.addEventListener('pointercancel', endG);

  // Tilt the line to angle a, keeping its left end (where the dot starts) in the same place.
  function turnTo(l0, a) {
    const py = l0.b - l0.m * VMAX, m = Math.round(Math.tan(clamp(a, -1.3, 1.3)) * 100) / 100;
    setLine(py + m * VMAX, m, true);
  }
  function setLine(b, m, exact) {
    m = clamp(Math.round(m * 100) / 100, -3.6, 3.6);
    S.line = { b: exact ? Math.round(b * 1000) / 1000 : clamp(Math.round(b * 10) / 10, -50, 50), m };
    if (S.phase === 'plan') S.run = GG.newRun(S.L, S.line);
    draw();
  }
  function setGrab(k) {
    S.grab = k;
    $('g-move').classList.toggle('on', k === 'move');
    $('g-rotate').classList.toggle('on', k === 'rotate');
    draw();
  }
  $('g-move').onclick = () => setGrab('move');
  $('g-rotate').onclick = () => setGrab('rotate');
  $('g-flat').onclick = () => { if (S.phase === 'plan') setLine(0, 0); };

  // ---------- Playing ----------
  function startLevel(L, from) {
    S.L = L; S.from = from; S.mode = 'play'; S.testing = from.kind === 'test';
    S.line = { b: 0, m: 0 };
    toPlan();
    $('title').textContent = L.n || 'My level';
    $('hint').textContent = L.hint || (S.testing ? 'Beat your own level to unlock uploading.' : '');
    $('hint').hidden = !$('hint').textContent;
    $('back').textContent = S.testing ? '✏️ Back to editing' : '← Back';
    $('play-panel').hidden = false; $('edit-panel').hidden = true;
    $('win').hidden = true;
    show('game');
    resize();
  }
  function toPlan() {
    S.phase = 'plan';
    S.run = GG.newRun(S.L, S.line);
    $('go').textContent = '▶ Go';
    $('go').classList.add('primary');
    gcv.classList.remove('locked');
    draw();
  }
  function go() {
    if (S.mode !== 'play') return;
    if (S.phase === 'plan') {
      S.phase = 'run';
      S.run = GG.newRun(S.L, S.line);
      $('go').textContent = '■ Stop';
      $('go').classList.remove('primary');
      gcv.classList.add('locked');
      beep([523, 659]);
      last = performance.now();
    } else toPlan();
  }
  $('go').onclick = go;

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (S.mode === 'play' && S.phase === 'run') {
      acc += dt;
      while (acc >= STEP && S.run.state === 'go') { GG.step(S.run); acc -= STEP; }
      if (S.run.state !== 'go') finish();
      draw();
    } else acc = 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function finish() {
    S.phase = 'done';
    const st = S.run.state;
    if (st === 'win') {
      beep([523, 659, 784, 1047], 'triangle', 0.14);
      winScreen();
    } else {
      beep([330, 220], 'sawtooth', 0.18);
      toast(st === 'fell' ? 'He fell! Change the graph and try again.' : 'He got stuck! Change the graph and try again.');
      setTimeout(() => { if (S.phase === 'done' && S.mode === 'play') toPlan(); }, 1300);
    }
  }

  function winScreen() {
    const f = S.from;
    let text = 'He made it to the flag!', btns = '';
    if (f.kind === 'built') {
      done.add(f.i); store.set('graphgranted-done', [...done]);
      if (f.i + 1 < LEVELS.length) btns += '<button class="btn primary" data-a="next">Next level ▶</button>';
      else text = 'You beat every level! Now try making your own.';
      btns += '<button class="btn" data-a="again">Play again</button><button class="btn" data-a="levels">Levels</button>';
    } else if (f.kind === 'test') {
      const d = mine.find(m => m.id === f.id);
      if (d) { d.beaten = true; saveMine(); }
      text = 'You beat your own level, so now you can upload it!';
      btns += '<button class="btn primary" data-a="upload">⬆️ Upload it</button><button class="btn" data-a="edit">✏️ Keep editing</button>';
    } else {
      if (f.kind === 'up' && db) {
        const k = 'graphgranted-won-' + f.key;
        if (!store.get(k, false)) { store.set(k, true); db.ref(`${UPLOADS}/${f.key}/wins`).transaction(n => (n || 0) + 1).catch(() => {}); }
      }
      btns += '<button class="btn" data-a="again">Play again</button>';
      btns += f.kind === 'up' ? '<button class="btn primary" data-a="online">More levels</button>' : '<button class="btn primary" data-a="home">Menu</button>';
    }
    $('win-text').textContent = text;
    $('win-btns').innerHTML = btns;
    $('win').hidden = false;
  }
  $('win-btns').onclick = e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    $('win').hidden = true;
    const f = S.from;
    switch (a.dataset.a) {
      case 'next': playBuilt(f.i + 1); break;
      case 'again': toPlan(); break;
      case 'levels': openLevels(); break;
      case 'home': show('home'); break;
      case 'online': openOnline(); break;
      case 'edit': openEditor(f.id); break;
      case 'upload': openEditor(f.id); openUpload(); break;
    }
  };

  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.style.opacity = 0; }, 2200);
  }

  $('back').onclick = () => {
    $('win').hidden = true;
    const f = S.from;
    if (S.mode === 'edit') { show('mine-screen'); openMine(); return; }
    if (f.kind === 'test') openEditor(f.id);
    else if (f.kind === 'built') openLevels();
    else if (f.kind === 'up') openOnline();
    else show('home');
  };

  function draw() {
    if ($('game').hidden) return;
    drawLevel();
    if (S.mode === 'play') drawGraph();
  }
  function resize() { draw(); }
  window.addEventListener('resize', resize);

  // ---------- Keys ----------
  document.addEventListener('keydown', e => {
    if ($('game').hidden || e.target.closest('input, textarea')) return;
    if (S.mode === 'edit') {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') { go(); e.preventDefault(); return; }
    if (S.phase !== 'plan') return;
    const { b, m } = S.line;
    if (e.key === 'ArrowUp') setLine(b + 0.5, m);
    else if (e.key === 'ArrowDown') setLine(b - 0.5, m);
    else if (e.key === 'ArrowLeft') turnTo(S.line, Math.atan(m) + 0.087);
    else if (e.key === 'ArrowRight') turnTo(S.line, Math.atan(m) - 0.087);
    else if (e.key.toLowerCase() === 'm') setGrab('move');
    else if (e.key.toLowerCase() === 'r') setGrab('rotate');
    else return;
    e.preventDefault();
  });

  // ---------- Built-in levels ----------
  function playBuilt(i) { startLevel(clone(LEVELS[i]), { kind: 'built', i }); }
  function openLevels() {
    $('level-grid').innerHTML = LEVELS.map((L, i) =>
      `<button class="lvl${done.has(i) ? ' done' : ''}" data-i="${i}"><b>${i + 1}</b><span>${esc(L.n)}</span>${done.has(i) ? '<i>✅</i>' : ''}</button>`).join('');
    show('levels');
  }
  $('level-grid').onclick = e => { const b = e.target.closest('[data-i]'); if (b) playBuilt(+b.dataset.i); };

  // ---------- My levels ----------
  function newDraft() {
    const d = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), n: '', s: [60, 381], f: [940, 395],
      g: [[0, 400, 1000, 400]], p: [], beaten: false, up: null };
    mine.unshift(d); saveMine();
    return d;
  }
  function openMine() {
    const list = $('mine-list');
    list.innerHTML = mine.length ? mine.map(d => `
      <div class="item">
        <div class="item-name">${esc(d.n || 'Untitled level')}</div>
        <div class="item-info">${d.up ? '🌍 Uploaded' : d.beaten ? '✅ Beaten, ready to upload' : 'Not beaten yet'}</div>
        <div class="item-btns">
          <button class="btn small" data-a="edit" data-id="${d.id}">✏️ Edit</button>
          <button class="btn small" data-a="play" data-id="${d.id}">▶ Play</button>
          <button class="btn small" data-a="del" data-id="${d.id}">🗑️</button>
        </div>
      </div>`).join('') : '<p class="muted center">No levels yet. Make one!</p>';
    show('mine-screen');
  }
  $('mine-list').onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const d = mine.find(m => m.id === b.dataset.id);
    if (!d) return;
    if (b.dataset.a === 'edit') openEditor(d.id);
    else if (b.dataset.a === 'play') startLevel(levelOf(d), { kind: 'test', id: d.id });
    else if (b.dataset.a === 'del' && confirm(`Delete "${d.n || 'Untitled level'}"?` + (d.up ? ' It stays in the uploaded levels.' : ''))) {
      mine = mine.filter(m => m !== d); saveMine(); openMine();
    }
  };
  $('new-level').onclick = () => openEditor(newDraft().id);
  const levelOf = d => ({ n: d.n, s: d.s, f: d.f, g: clone(d.g), p: clone(d.p) });

  // ---------- The level maker ----------
  const TOOLS = [
    { id: 'move', i: '✋', n: 'Move' },
    { id: 'pen', i: '✏️', n: 'Grey pen' },
    { id: 'gline', i: '📏', n: 'Grey line' },
    { id: 'rbar', i: '🟥', n: 'Red bar' },
    { id: 'bbar', i: '🟦', n: 'Blue bar' },
    { id: 'obar', i: '🟧', n: 'Orange bar' },
    { id: 'rball', i: '🔴', n: 'Red ball' },
    { id: 'bball', i: '🔵', n: 'Blue ball' },
    { id: 'oball', i: '🟠', n: 'Orange ball' },
    { id: 'start', i: '🟢', n: 'Guy' },
    { id: 'flag', i: '🏁', n: 'Flag' },
    { id: 'erase', i: '🧽', n: 'Erase' },
  ];
  const E = { d: null, tool: 'pen', undo: [], drag: null };
  $('tools').innerHTML = TOOLS.map(t => `<button class="tool" data-t="${t.id}"><span class="i">${t.i}</span><span class="n">${t.n}</span></button>`).join('');
  $('tools').onclick = e => { const b = e.target.closest('[data-t]'); if (b) setTool(b.dataset.t); };
  function setTool(t) {
    E.tool = t;
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.t === t);
    const tips = {
      move: 'Drag anything to move it.', pen: 'Draw grey ground. It can be bumpy and slopey. Grey never moves.',
      gline: 'Drag to make a straight grey line.', erase: 'Tap something to remove it.',
      start: 'Tap where the guy starts.', flag: 'Tap where the flag goes. Put it on the ground.',
    };
    $('edit-tip').textContent = tips[t] || (t.endsWith('ball') ? 'Drag out from the middle to make a ball.' : 'Drag to make a straight bar.');
  }

  function openEditor(id) {
    const d = mine.find(m => m.id === id);
    if (!d) { openMine(); return; }
    E.d = d; E.undo = []; E.drag = null;
    S.mode = 'edit'; S.phase = 'plan'; S.from = { kind: 'edit', id };
    S.line = { b: 0, m: 0 };
    S.L = levelOf(d);
    S.run = GG.newRun(S.L, S.line);
    $('title').textContent = 'Level maker';
    $('hint').hidden = true;
    $('back').textContent = '← My levels';
    $('level-name').value = d.n;
    $('play-panel').hidden = true; $('edit-panel').hidden = false;
    $('win').hidden = true; $('upload').hidden = true;
    setTool(E.tool);
    markUpload();
    show('game');
    resize();
  }
  function markUpload() {
    $('e-upload').textContent = E.d.up ? '🌍 Uploaded' : '⬆️ Upload';
    $('e-upload').classList.toggle('poor', !E.d.beaten && !E.d.up);
  }
  function changed() {
    E.d.beaten = false;
    S.L = levelOf(E.d);
    S.run = GG.newRun(S.L, S.line);
    saveMine(); markUpload(); draw();
  }
  function remember() { E.undo.push(JSON.stringify({ s: E.d.s, f: E.d.f, g: E.d.g, p: E.d.p })); if (E.undo.length > 60) E.undo.shift(); }
  function undo() {
    if (!E.undo.length) return;
    Object.assign(E.d, JSON.parse(E.undo.pop()));
    changed();
  }
  $('e-undo').onclick = undo;
  $('e-clear').onclick = () => {
    if (!confirm('Clear the whole level?')) return;
    remember();
    E.d.g = []; E.d.p = [];
    changed();
  };
  $('e-test').onclick = () => {
    if (!E.d.n.trim()) { E.d.n = 'My level'; $('level-name').value = E.d.n; saveMine(); }
    startLevel(levelOf(E.d), { kind: 'test', id: E.d.id });
  };
  $('level-name').oninput = () => { E.d.n = $('level-name').value.slice(0, 30); saveMine(); };

  const toWorld = e => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s];
  };
  const snap = (v, n = 5) => Math.round(v / n) * n;
  const inside = ([x, y]) => [clamp(x, 0, W), clamp(y, 0, H)];

  function hitTest(x, y) {
    const d = E.d, near = 12 / Math.max(0.5, view.s);
    const segD = (ax, ay, bx, by) => {
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
      const u = l2 ? clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1) : 0;
      return Math.hypot(x - ax - ex * u, y - ay - ey * u);
    };
    if (Math.hypot(x - d.s[0], y - d.s[1]) < GUY_R + near) return { k: 's' };
    if (Math.abs(x - d.f[0] - 15) < 25 + near && y < d.f[1] + near && y > d.f[1] - 85) return { k: 'f' };
    for (let i = d.p.length - 1; i >= 0; i--) {
      const p = d.p[i];
      if (p.length === 5 ? segD(p[1], p[2], p[3], p[4]) < BAR_R + near : Math.hypot(x - p[1], y - p[2]) < p[3] + near) return { k: 'p', i };
    }
    for (let i = d.g.length - 1; i >= 0; i--) {
      const g = d.g[i];
      for (let j = 0; j + 3 < g.length; j += 2) if (segD(g[j], g[j + 1], g[j + 2], g[j + 3]) < GREY_R + near) return { k: 'g', i };
    }
    return null;
  }

  cv.addEventListener('pointerdown', e => {
    if (S.mode !== 'edit') return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const [x, y] = inside(toWorld(e)), t = E.tool, d = E.d;
    E.drag = { id: e.pointerId, t, x0: x, y0: y, x, y };
    if (t === 'pen') { E.drag.pts = [Math.round(x), Math.round(y)]; }
    else if (t === 'start' || t === 'flag') { remember(); d[t === 'start' ? 's' : 'f'] = [snap(x), snap(y)]; changed(); }
    else if (t === 'erase') {
      const h = hitTest(x, y);
      if (h && (h.k === 'p' || h.k === 'g')) { remember(); d[h.k].splice(h.i, 1); changed(); }
      else if (h) toast("The guy and the flag can't be erased. Move them instead.");
      E.drag = null;
    } else if (t === 'move') {
      const h = hitTest(x, y);
      if (!h) { E.drag = null; return; }
      remember();
      E.drag.hit = h;
      E.drag.orig = JSON.stringify(h.k === 's' ? d.s : h.k === 'f' ? d.f : d[h.k][h.i]);
    }
    draw();
  });
  cv.addEventListener('pointermove', e => {
    const g = E.drag;
    if (S.mode !== 'edit' || !g || e.pointerId !== g.id) return;
    const [x, y] = inside(toWorld(e));
    g.x = x; g.y = y;
    if (g.t === 'pen') {
      const n = g.pts.length;
      if (Math.hypot(x - g.pts[n - 2], y - g.pts[n - 1]) >= 14 && n < 600) g.pts.push(Math.round(x), Math.round(y));
    } else if (g.t === 'start' || g.t === 'flag') {
      E.d[g.t === 'start' ? 's' : 'f'] = [snap(x), snap(y)]; changed(); return;
    } else if (g.t === 'move' && g.hit) {
      const dx = Math.round(x - g.x0), dy = Math.round(y - g.y0), o = JSON.parse(g.orig), h = g.hit;
      const shift = a => a.map((v, i) => typeof v === 'number' ? v + (i % 2 ? dx : dy) : v);
      if (h.k === 's') E.d.s = [o[0] + dx, o[1] + dy];
      else if (h.k === 'f') E.d.f = [o[0] + dx, o[1] + dy];
      else if (h.k === 'g') E.d.g[h.i] = o.map((v, i) => v + (i % 2 ? dy : dx));
      else E.d.p[h.i] = o.length === 5 ? shift(o) : [o[0], o[1] + dx, o[2] + dy, o[3]];
      changed(); return;
    }
    draw();
  });
  const endE = e => {
    const g = E.drag;
    if (!g || e.pointerId !== g.id) return;
    E.drag = null;
    const d = E.d, t = g.t;
    if (t === 'pen') {
      if (g.pts.length >= 4) { remember(); d.g.push(g.pts); changed(); }
    } else if (t === 'gline' || t.endsWith('bar')) {
      const ax = snap(g.x0), ay = snap(g.y0), bx = snap(g.x), by = snap(g.y);
      if (Math.hypot(bx - ax, by - ay) >= 20) {
        remember();
        if (t === 'gline') d.g.push([ax, ay, bx, by]); else d.p.push([t[0], ax, ay, bx, by]);
        changed();
      } else toast('Drag to make it longer.');
    } else if (t.endsWith('ball')) {
      const r = Math.round(clamp(Math.hypot(g.x - g.x0, g.y - g.y0), 12, 120)) || 30;
      remember(); d.p.push([t[0], Math.round(g.x0), Math.round(g.y0), Math.hypot(g.x - g.x0, g.y - g.y0) < 6 ? 30 : r]); changed();
    }
    draw();
  };
  cv.addEventListener('pointerup', endE);
  cv.addEventListener('pointercancel', endE);

  // What you're in the middle of drawing.
  function drawEditExtras() {
    const g = E.drag;
    if (!g) return;
    ctx.globalAlpha = 0.75;
    if (g.t === 'pen' && g.pts.length >= 2) drawGrey([...g.pts, Math.round(g.x), Math.round(g.y)]);
    else if (g.t === 'gline') drawGrey([snap(g.x0), snap(g.y0), snap(g.x), snap(g.y)]);
    else if (g.t.endsWith('bar')) drawBar(snap(g.x0), snap(g.y0), snap(g.x), snap(g.y), g.t[0], false);
    else if (g.t.endsWith('ball')) drawBall(g.x0, g.y0, clamp(Math.hypot(g.x - g.x0, g.y - g.y0), 12, 120), g.t[0], 0, false);
    ctx.globalAlpha = 1;
  }

  // ---------- Uploading ----------
  $('e-upload').onclick = () => {
    if (E.d.up) { toast('This level is already uploaded. Find it in Uploaded levels.'); return; }
    if (!E.d.beaten) { toast('Press ▶ Test and beat your level first. Then you can upload it.'); return; }
    openUpload();
  };
  function openUpload() {
    $('up-name').value = E.d.n;
    $('up-by').value = store.get('graphgranted-by', '');
    $('up-status').textContent = db ? '' : NO_SERVER;
    $('up-send').disabled = false;
    $('upload').hidden = false;
  }
  $('up-cancel').onclick = () => { $('upload').hidden = true; };
  $('up-send').onclick = async () => {
    const n = $('up-name').value.trim().slice(0, 30), by = $('up-by').value.trim().slice(0, 20);
    if (!n) { $('up-status').textContent = 'Give your level a name first.'; return; }
    if (!db) { $('up-status').textContent = NO_SERVER; return; }
    E.d.n = n; $('level-name').value = n; store.set('graphgranted-by', by); saveMine();
    $('up-send').disabled = true; $('up-status').textContent = 'Uploading…';
    try {
      const ref = db.ref(UPLOADS).push();
      await ref.set({ n, by, code: GG.encode(levelOf(E.d)), at: firebase.database.ServerValue.TIMESTAMP, wins: 0 });
      E.d.up = ref.key; saveMine(); markUpload();
      $('upload').hidden = true;
      toast('Uploaded! Anyone can play it now in Uploaded levels.');
      beep([659, 784, 1047]);
    } catch (e) {
      $('up-send').disabled = false;
      $('up-status').textContent = NO_SERVER;
    }
  };

  // ---------- Uploaded levels ----------
  let online = [];
  async function openOnline() {
    show('online');
    const list = $('online-list');
    if (!db) { list.innerHTML = `<p class="muted center">${NO_SERVER}</p>`; return; }
    list.innerHTML = '<p class="muted center">Loading…</p>';
    try {
      const snap = await db.ref(UPLOADS).orderByChild('at').limitToLast(100).once('value');
      online = [];
      snap.forEach(c => { const v = c.val(); if (v && v.code) online.push({ key: c.key, n: String(v.n || ''), by: String(v.by || ''), code: v.code, at: v.at || 0, wins: v.wins || 0 }); });
      online.reverse();
      const mineKeys = new Set(mine.map(d => d.up).filter(Boolean));
      list.innerHTML = online.length ? online.map(o => `
        <div class="item">
          <div class="item-name">${esc(o.n.slice(0, 30) || 'Untitled level')}${mineKeys.has(o.key) ? ' <small>(yours)</small>' : ''}</div>
          <div class="item-info">${o.by ? 'by ' + esc(o.by.slice(0, 20)) + ' · ' : ''}🏁 beaten ${o.wins} time${o.wins === 1 ? '' : 's'}${store.get('graphgranted-won-' + o.key, false) ? ' · ✅ you beat it' : ''}</div>
          <div class="item-btns"><button class="btn small primary" data-key="${esc(o.key)}">▶ Play</button></div>
        </div>`).join('') : '<p class="muted center">Nobody has uploaded a level yet. Be the first!</p>';
    } catch (e) {
      list.innerHTML = `<p class="muted center">${NO_SERVER}</p>`;
    }
  }
  $('online-list').onclick = e => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    const o = online.find(o => o.key === b.dataset.key), L = o && GG.decode(o.code);
    if (!L) { toast("That level is broken and can't be played."); return; }
    L.n = o.n.slice(0, 30);
    startLevel(L, { kind: 'up', key: o.key });
  };

  // ---------- Menu ----------
  $('m-play').onclick = openLevels;
  $('m-make').onclick = openMine;
  $('m-online').onclick = openOnline;
  for (const b of document.querySelectorAll('.home-btn')) b.onclick = () => show('home');

  // Debug hook for testing: #debug
  if (location.hash === '#debug') window.GGUI = { S, E, startLevel, playBuilt, openEditor, newDraft, go, setLine, mine: () => mine };
})();
