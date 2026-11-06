// Graph and Granted: the levels and the physics. Nothing in here touches the page,
// so the same code also runs in node to check that every level can be beaten.
(function (root) {
  'use strict';

  const W = 1000, H = 500;          // every level is this big
  const G = 1100, MAXFALL = 900;    // gravity
  const WALK = 80;                  // how fast the guy walks
  const GUY_R = 14, BAR_R = 9, GREY_R = 5;
  const K = 20;                     // how far red and blue slide for each 1 on the graph
  const D = 10;                     // seconds the dot takes to cross the graph
  const VMAX = 10;                  // the graph goes from -10 to 10 both ways
  const STEP = 1 / 240;
  const ORANGE_MASS = 3;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dotX = t => -VMAX + 2 * VMAX * clamp(t / D, 0, 1);
  const lineValue = (line, x) => clamp(line.b + line.m * x, -VMAX, VMAX);
  const valueAt = (line, t) => lineValue(line, dotX(t));
  // Red slides left when the number is high. Blue slides left when the number is low.
  const offsetFor = (c, v) => c === 'r' ? -v * K : c === 'b' ? v * K : 0;

  // ---------- Levels ----------
  // s: where the guy starts, f: the bottom of the flag pole.
  // g: grey lines, each [x1,y1, x2,y2, ...].
  // p: pieces. A bar is [colour, x1,y1, x2,y2] and a ball is [colour, x,y, r]. Colours: r red, b blue, o orange.
  function bumpy(x0, x1, y, amp, step) {
    const out = [];
    for (let x = x0; x <= x1; x += step) out.push(x, Math.round(y - amp * Math.abs(Math.sin((x - x0) / 47))));
    if (out[out.length - 2] !== x1) out.push(x1, y);
    return out;
  }

  const LEVELS = [
    {
      n: 'Up we go', hint: 'Grab the graph and slide the line up. A high number slides red to the left.',
      s: [60, 381], f: [940, 395],
      g: [[0, 400, 380, 400, 380, 520], [520, 520, 520, 400, 1000, 400]],
      p: [['r', 520, 403, 700, 403]],
    },
    {
      n: 'Blue is backwards', hint: 'Blue is the other way round: a LOW number slides blue to the left.',
      s: [60, 381], f: [940, 395],
      g: [[0, 400, 150, 400, 220, 372, 290, 400, 330, 400, 330, 520], [470, 520, 470, 400, 1000, 400]],
      p: [['b', 470, 403, 650, 403]],
    },
    {
      n: 'Tilt it', hint: 'Red needs a high number first, then blue needs a low one. Rotate the line!',
      s: [60, 381], f: [960, 395],
      g: [[0, 400, 280, 400, 280, 520], [400, 520, 400, 400, 640, 400, 640, 520], [760, 520, 760, 400, 1000, 400]],
      p: [['r', 420, 403, 580, 403], ['b', 780, 403, 940, 403]],
    },
    {
      n: 'Orange falls', hint: 'Orange doesn\'t care about the graph, but it falls. Pull the red shelf out from under it.',
      s: [60, 381], f: [940, 395],
      g: [[0, 400, 400, 400, 400, 422, 530, 422, 530, 400, 1000, 400], [400, 228, 400, 276]],
      p: [['r', 380, 300, 560, 300], ['o', 416, 282, 504, 282]],
    },
    {
      n: 'Bumpy road', hint: 'Drop the ball in the hole, then bring red in for the second gap.',
      s: [50, 370], f: [960, 395],
      g: [bumpy(0, 456, 400, 14, 12), [456, 400, 456, 464, 544, 464, 544, 400, 700, 400, 700, 520], [455, 150, 455, 196], [820, 520, 820, 400, 1000, 400]],
      p: [['b', 420, 250, 590, 250], ['o', 500, 204, 37], ['r', 830, 403, 990, 403]],
    },
    {
      n: 'Hitch a ride', hint: 'The gap is too long for one bar. Make red carry him across, fast!',
      s: [60, 381], f: [950, 395],
      g: [[0, 400, 380, 400, 380, 520], [640, 520, 640, 400, 1000, 400]],
      p: [['r', 390, 403, 550, 403]],
    },
    {
      n: 'Push it', hint: 'Sweep the ball off the shelf with the red pusher. Keep going up so red can be the bridge too.',
      s: [60, 381], f: [960, 395],
      g: [[0, 400, 498, 400, 498, 464, 582, 464, 582, 400, 760, 400, 760, 520], [560, 275, 700, 275], [820, 520, 820, 400, 1000, 400]],
      p: [['o', 600, 236, 34], ['r', 650, 205, 650, 262], ['r', 820, 403, 1000, 403]],
    },
    {
      n: 'Drop and ride', hint: 'Drop the orange in the first hole, then ride blue over the big gap.',
      s: [60, 381], f: [960, 395],
      g: [[0, 400, 300, 400, 300, 422, 430, 422, 430, 400, 580, 400, 580, 520], [300, 228, 300, 276], [820, 520, 820, 400, 1000, 400]],
      p: [['r', 280, 300, 460, 300], ['o', 316, 282, 404, 282], ['b', 590, 403, 770, 403]],
    },
  ];

  // ---------- A run of a level ----------
  function newRun(L, line) {
    const statics = [];
    for (const g of L.g) for (let i = 0; i + 3 < g.length; i += 2)
      statics.push({ ax: g[i], ay: g[i + 1], bx: g[i + 2], by: g[i + 3], r: GREY_R });
    const kin = [], dyn = [];
    const guy = { guy: true, bar: false, x: L.s[0], y: L.s[1], vx: 0, vy: 0, r: GUY_R, m: 1, ground: null, onGround: false, legs: 0 };
    dyn.push(guy);
    for (const p of L.p) {
      const bar = p.length === 5;
      if (p[0] === 'o') {
        if (bar) dyn.push({ bar: true, x: (p[1] + p[3]) / 2, y: (p[2] + p[4]) / 2, hx: (p[3] - p[1]) / 2, hy: (p[4] - p[2]) / 2,
          r: BAR_R, vx: 0, vy: 0, m: ORANGE_MASS, n: 2, gone: false });
        else dyn.push({ bar: false, x: p[1], y: p[2], r: p[3], vx: 0, vy: 0, m: ORANGE_MASS * clamp(p[3] / 25, 0.5, 4), spin: 0, gone: false });
      } else if (bar) kin.push({ bar: true, c: p[0], ax: p[1], ay: p[2], bx: p[3], by: p[4], r: BAR_R, off: 0, vel: 0 });
      else kin.push({ bar: false, c: p[0], x: p[1], y: p[2], r: p[3], off: 0, vel: 0 });
    }
    for (const b of dyn) {
      if (b.bar) b.n = Math.max(2, Math.ceil(Math.hypot(b.hx, b.hy) * 2 / b.r) + 1);
      b.reach = b.bar ? Math.hypot(b.hx, b.hy) + b.r : b.r;
    }
    const run = { L, line: { b: line.b, m: line.m }, t: 0, statics, kin, dyn, guy, state: 'go', best: guy.x, bestT: 0 };
    placeKin(run, 0, true);
    return run;
  }

  function placeKin(run, t, first) {
    const v = valueAt(run.line, t);
    for (const k of run.kin) {
      const o = offsetFor(k.c, v);
      k.vel = first ? 0 : (o - k.off) / STEP;
      k.off = o;
    }
  }

  // How far circle (px,py,pr) is pushed out of a fat line from a to b with radius sr. Answer goes in C.
  const C = { nx: 0, ny: 0, d: 0 };
  function hitSeg(px, py, pr, ax, ay, bx, by, sr) {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    let u = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = px - (ax + ex * u), dy = py - (ay + ey * u), rr = pr + sr, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { C.nx = 0; C.ny = -1; } else { C.nx = dx / d; C.ny = dy / d; }
    C.d = rr - d;
    return true;
  }

  // Push body b out of something that moves with velocity (svx, svy).
  function resolve(b, nx, ny, d, svx, svy) {
    b.x += nx * d; b.y += ny * d;
    let rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; rvx -= vn * nx; rvy -= vn * ny; }
    if (ny < -0.5) {
      if (b.guy) { if (!b.ground || ny < b.ground.ny || svx) b.ground = { nx, ny, vx: svx, vy: svy }; }
      else {
        const f = b.bar ? 0.2 : 0.02, tn = rvx * nx + rvy * ny;
        b.vx -= (rvx - tn * nx) * f; b.vy -= (rvy - tn * ny) * f;
      }
    }
  }

  function vsWorld(run, b) {
    const n = b.bar ? b.n : 1;
    for (let i = 0; i < n; i++) {
      const u = b.bar ? (i / (n - 1)) * 2 - 1 : 0;
      for (const s of run.statics) {
        const px = b.x + (b.bar ? b.hx * u : 0), py = b.y + (b.bar ? b.hy * u : 0);
        if (hitSeg(px, py, b.r, s.ax, s.ay, s.bx, s.by, s.r)) resolve(b, C.nx, C.ny, C.d, 0, 0);
      }
      for (const k of run.kin) {
        const px = b.x + (b.bar ? b.hx * u : 0), py = b.y + (b.bar ? b.hy * u : 0);
        const hit = k.bar ? hitSeg(px, py, b.r, k.ax + k.off, k.ay, k.bx + k.off, k.by, k.r)
                          : hitSeg(px, py, b.r, k.x + k.off, k.y, k.x + k.off, k.y, k.r);
        if (hit) resolve(b, C.nx, C.ny, C.d, k.vel, 0);
      }
    }
  }

  // Two moving things bump. n points from b to a.
  function pairResolve(a, b, nx, ny, d) {
    const tot = a.m + b.m;
    a.x += nx * d * b.m / tot; a.y += ny * d * b.m / tot;
    b.x -= nx * d * a.m / tot; b.y -= ny * d * a.m / tot;
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn < 0) {
      const j = -vn / (1 / a.m + 1 / b.m);
      a.vx += nx * j / a.m; a.vy += ny * j / a.m;
      b.vx -= nx * j / b.m; b.vy -= ny * j / b.m;
    }
    if (a.guy && ny < -0.5) a.ground = { nx, ny, vx: b.vx, vy: b.vy };
    if (b.guy && ny > 0.5) b.ground = { nx: -nx, ny: -ny, vx: a.vx, vy: a.vy };
  }

  function pairPass(a, b) {
    const n = a.bar ? a.n : 1;
    for (let i = 0; i < n; i++) {
      const u = a.bar ? (i / (n - 1)) * 2 - 1 : 0;
      const px = a.x + (a.bar ? a.hx * u : 0), py = a.y + (a.bar ? a.hy * u : 0);
      const hit = b.bar ? hitSeg(px, py, a.r, b.x - b.hx, b.y - b.hy, b.x + b.hx, b.y + b.hy, b.r)
                        : hitSeg(px, py, a.r, b.x, b.y, b.x, b.y, b.r);
      if (hit) pairResolve(a, b, C.nx, C.ny, C.d);
    }
  }

  function step(run) {
    if (run.state !== 'go') return;
    run.t += STEP;
    placeKin(run, run.t, false);
    const g = run.guy;
    // On the ground the guy always walks to the right along it, riding whatever he stands on.
    if (g.ground) { const n = g.ground; g.vx = n.vx - n.ny * WALK; g.vy = n.vy + n.nx * WALK; }
    g.onGround = !!g.ground;
    g.ground = null;
    const dyn = run.dyn;
    for (const b of dyn) {
      if (b.gone) continue;
      b.vy = Math.min(b.vy + G * STEP, MAXFALL);
      b.x += b.vx * STEP; b.y += b.vy * STEP;
    }
    for (let it = 0; it < 3; it++) {
      for (const b of dyn) if (!b.gone) vsWorld(run, b);
      for (let i = 0; i < dyn.length; i++) for (let j = i + 1; j < dyn.length; j++) {
        const a = dyn[i], b = dyn[j];
        if (a.gone || b.gone) continue;
        const rr = a.reach + b.reach + 2;
        if (Math.abs(a.x - b.x) > rr || Math.abs(a.y - b.y) > rr) continue;
        pairPass(a, b); pairPass(b, a);
      }
    }
    for (const b of dyn) {
      if (b.guy || b.gone) continue;
      if (b.y > H + 300) b.gone = true;
      if (!b.bar) b.spin += b.vx * STEP / b.r;
    }
    if (g.onGround) g.legs += STEP * 9;

    const f = run.L.f;
    if (g.x >= f[0] - 4 && g.y > f[1] - 120 && g.y < f[1] + 30) run.state = 'win';
    else if (g.y > H + 80 || g.x < -80 || g.x > W + 80) run.state = 'fell';
    else {
      if (g.x > run.best + 3) { run.best = g.x; run.bestT = run.t; }
      if ((run.t > D && run.t - run.bestT > 3) || run.t > D + 40) run.state = 'stuck';
    }
  }

  // Play a whole level without drawing it. Used by the tests.
  function play(L, line) {
    const run = newRun(L, line);
    while (run.state === 'go') step(run);
    return run;
  }

  // ---------- Level codes ----------
  const num = v => typeof v === 'number' && isFinite(v);
  const rnd = v => Math.round(v);
  // Check a level from outside (a code or an upload) and tidy it. Returns null if it's broken.
  function clean(o) {
    if (!o || typeof o !== 'object') return null;
    const pt = a => Array.isArray(a) && a.length === 2 && a.every(num) ? a.map(rnd) : null;
    const s = pt(o.s), f = pt(o.f);
    if (!s || !f || !Array.isArray(o.g) || !Array.isArray(o.p) || o.g.length > 80 || o.p.length > 80) return null;
    const g = [];
    for (const l of o.g) {
      if (!Array.isArray(l) || l.length < 4 || l.length > 600 || l.length % 2 || !l.every(num)) return null;
      g.push(l.map(rnd));
    }
    const p = [];
    for (const q of o.p) {
      if (!Array.isArray(q) || (q.length !== 4 && q.length !== 5) || !['r', 'b', 'o'].includes(q[0]) || !q.slice(1).every(num)) return null;
      const out = [q[0], ...q.slice(1).map(rnd)];
      if (out.length === 4) out[3] = clamp(out[3], 10, 150);
      p.push(out);
    }
    const n = typeof o.n === 'string' ? o.n.slice(0, 30) : '';
    return { n, s, f, g, p };
  }

  function toB64(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromB64(b) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b)));
  }
  function encode(L) {
    const s = JSON.stringify({ n: L.n || '', s: L.s, f: L.f, g: L.g, p: L.p });
    return toB64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      let b = String(code).trim().replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return clean(JSON.parse(fromB64(b)));
    } catch (e) { return null; }
  }

  const API = { W, H, D, K, VMAX, STEP, GUY_R, BAR_R, GREY_R, WALK, LEVELS,
    dotX, lineValue, valueAt, offsetFor, newRun, step, play, clean, encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GG = API;
})(this);
