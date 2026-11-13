/* Home Twin Card (ehem. Haus-Grundriss) – zentraler Grundriss für alle Raum-Panels
 * Plan-Speicher: Integration home_twin (MariaDB, Revisionen, Live-Updates); Rückfall: Lovelace-Dashboard (plan: der Master-Karte)
 * Etagen · Räume (Polygone) · Wände (automatisch aus Räumen + freie Wände) · Fenster/Türen
 * Geräte (Licht, Thermostat, Sensoren, Melder, später BLE-Positionen) · Möbel (Symbole/Bilder)
 * Ausschnitte (benannte Bereiche, die Raum-Dashboards ohne Namen/Legende anzeigen)
 * Alle Koordinaten in METERN (x nach rechts, y nach unten).
 */
(() => {
const VERSION = '2.33.1-beta.1';
// Ablageort dieser Datei (für das nachgeladene 3D-Modul home-twin-3d.js + vendor/three.js daneben)
const BASE = (() => {
  const dir = s => String(s).replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  try { if (document.currentScript && document.currentScript.src) return dir(document.currentScript.src); } catch (e) { /* Modul: kein currentScript */ }
  try { throw new Error(); } catch (e) {
    const st = String(e.stack || ''), m = st.match(/((?:https?|file):\/\/[^\s)'"]*?\/)(?:floor_plan_ha_card|haus-grundriss)\.js/) || st.match(/((?:https?|file):\/\/[^\s)'"]*?\/)[^/\s)'"]+\.js/);
    if (m) return m[1];
  }
  try { const r = (performance.getEntriesByType('resource') || []).find(x => /\/(?:floor_plan_ha_card|haus-grundriss)\.js/.test(x.name)); if (r) return dir(r.name); } catch (e) { /* Standardpfad */ }
  return '/local/raum-tablet-card/';
})();
let T3 = null;
const load3D = () => T3 || (T3 = import(BASE + 'home-twin-3d.js?v=' + VERSION).catch(e => { T3 = null; throw e; }));
// Realistische Außen-Texturen: einmal pro Seite als Canvas erzeugt (nahtlos kachelbar), 2D als blob:-Bild im Muster, 3D als Textur
const RT_SIZE = { lawn: 2, garden: 1.6, hedge: 1, deck: 1.2, slabs: 1.2, paving: .8, gravel: .6, water: 2, asphalt: 1.5 };
const RTEX = {}, HG_CARDS = new Set();
let rtQ = null;
const rnd = seed => { let x = (seed >>> 0) || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; };
function vnoise(N, cells, seed) {
  const R = rnd(seed), g = new Float32Array(cells * cells).map(() => R()), out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) { const fy = y / N * cells, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = (iy % cells) * cells, y1 = ((iy + 1) % cells) * cells;
    for (let x = 0; x < N; x++) { const fx = x / N * cells, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % cells, x1 = (ix + 1) % cells;
      const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1]; out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; } }
  return out;
}
function fbm(N, base, oct, seed) { const o = new Float32Array(N * N); let a = 1, t = 0; for (let k = 0; k < oct; k++) { const f = vnoise(N, base << k, seed + k * 977); for (let i = 0; i < o.length; i++) o[i] += f[i] * a; t += a; a *= .5; } for (let i = 0; i < o.length; i++) o[i] /= t; return o; }
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function paintField(ctx, N, f, cA, cB, f2, k2 = .25) {
  const im = ctx.createImageData(N, N), A = hexRgb(cA), B = hexRgb(cB);
  for (let i = 0; i < N * N; i++) { let t = clamp((f[i] - .3) / .4, 0, 1); const c = mixC(A, B, t), m = f2 ? 1 + (f2[i] - .5) * k2 * 2 : 1; im.data[i * 4] = c[0] * m; im.data[i * 4 + 1] = c[1] * m; im.data[i * 4 + 2] = c[2] * m; im.data[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0);
}
// Form an Kachelkanten wiederholt zeichnen (nahtlos)
const wrap = (N, x, y, r, fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) if (x + dx > -r && x + dx < N + r && y + dy > -r && y + dy < N + r) fn(x + dx, y + dy); };
const ell = (ctx, x, y, rx, ry, a, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); ctx.fill(); };
const RTGEN = {
  lawn(ctx, N, R) {
    paintField(ctx, N, fbm(N, 6, 5, 11), '#36542a', '#4f7232', fbm(N, 3, 3, 12), .1);
    const G = ['#3d6127', '#4f7a2f', '#2f4d1f', '#6b8f3c', '#5d8434', '#7f9a46'];
    ctx.lineCap = 'round';
    for (let i = 0; i < 14000; i++) { const x = R() * N, y = R() * N, a = R() * Math.PI * 2, l = 2 + R() * 4.5; ctx.strokeStyle = G[(R() * G.length) | 0]; ctx.globalAlpha = .35 + R() * .45; ctx.lineWidth = .7 + R() * .8; wrap(N, x, y, 8, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); }); }
    ctx.globalAlpha = .12; for (let i = 0; i < 6; i++) { const x = R() * N, y = R() * N, r = 10 + R() * 22; wrap(N, x, y, r, (px, py) => ell(ctx, px, py, r, r * (.6 + R() * .4), R() * 3, '#8f8a3e')); } ctx.globalAlpha = 1;
  },
  garden(ctx, N, R) {
    paintField(ctx, N, fbm(N, 6, 5, 21), '#33251a', '#5b4430', fbm(N, 16, 2, 22), .2);
    for (let i = 0; i < 1400; i++) { const x = R() * N, y = R() * N, r = .8 + R() * 2; wrap(N, x, y, 3, (px, py) => ell(ctx, px, py, r, r * .8, 0, R() < .5 ? '#2a1d13' : '#6b5139')); }
    const G = ['#2f5a26', '#3c6c2e', '#4a7d36', '#27491f', '#5b8c3e'], F = ['#d9435a', '#f2c94c', '#9b6dd6', '#f4f1ea', '#e07a3a'];
    for (let p = 0; p < 22; p++) {
      const cx = R() * N, cy = R() * N, rr = 12 + R() * 22, fl = R() < .55 ? F[(R() * F.length) | 0] : null;
      wrap(N, cx, cy, rr + 12, (px, py) => ell(ctx, px + 3, py + 4, rr, rr * .9, 0, 'rgba(0,0,0,.35)'));
      for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = R() * rr, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, l = 4 + R() * 7; wrap(N, x, y, l, (px, py) => ell(ctx, px, py, l, l * .45, a, G[(R() * G.length) | 0])); }
      if (fl) for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, d = R() * rr * .8, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; wrap(N, x, y, 4, (px, py) => { ell(ctx, px, py, 2.6, 2.6, 0, fl); ell(ctx, px, py, .9, .9, 0, '#f6e27a'); }); }
    }
  },
  hedge(ctx, N, R) {
    paintField(ctx, N, fbm(N, 4, 4, 31), '#13260f', '#2c4a22', null);
    const G = ['#1f3d18', '#2b5121', '#386629', '#467a31', '#24451c', '#55883a'];
    for (let i = 0; i < 5200; i++) { const x = R() * N, y = R() * N, a = R() * Math.PI * 2, l = 3 + R() * 5; const c = G[(R() * G.length) | 0]; wrap(N, x, y, l + 2, (px, py) => { ell(ctx, px + 1, py + 1.5, l, l * .5, a, 'rgba(0,0,0,.25)'); ell(ctx, px, py, l, l * .5, a, c); }); }
  },
  deck(ctx, N, R) {
    const B = 8, bh = N / B, gr = fbm(N, 3, 4, 41);
    for (let b = 0; b < B; b++) {
      const base = hexRgb(['#7a5538', '#84603f', '#6f4d33', '#8a6544', '#765237'][b % 5]), j = (R() * N) | 0, im = ctx.createImageData(N, Math.ceil(bh));
      for (let y = 0; y < Math.ceil(bh); y++) for (let x = 0; x < N; x++) { const yy = Math.min(N - 1, (b * bh + y) | 0), g = gr[yy * N + ((x * 1) % N)], s = .82 + .3 * Math.sin((yy * .9 + g * 14) * 1.3) * .5 + (g - .5) * .35, i = (y * N + x) * 4; im.data[i] = base[0] * s; im.data[i + 1] = base[1] * s; im.data[i + 2] = base[2] * s; im.data[i + 3] = 255; }
      ctx.putImageData(im, 0, Math.round(b * bh));
      ctx.fillStyle = '#1a120c'; ctx.fillRect(0, Math.round(b * bh), N, 2.5); ctx.fillRect(j, Math.round(b * bh), 2, bh);
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, Math.round(b * bh) + 3, N, 1.5);
      for (let k = 0; k < 2; k++) { const x = R() * N, y = b * bh + bh * (.3 + R() * .4); ell(ctx, x, y, 2.2, 2.2, 0, '#3a2a1c'); ell(ctx, x + 30, y, 2.2, 2.2, 0, '#3a2a1c'); }
    }
  },
  slabs(ctx, N, R) {
    paintField(ctx, N, fbm(N, 6, 5, 51), '#7d7b75', '#a29f97', fbm(N, 24, 2, 52), .12);
    const n = 2, s = N / n;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { ctx.fillStyle = `rgba(${R() < .5 ? '0,0,0' : '255,255,255'},${(R() * .07).toFixed(3)})`; ctx.fillRect(i * s, k * s, s, s); }
    ctx.fillStyle = '#4e4b46'; for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 2, 0, 4, N); ctx.fillRect(0, i * s - 2, N, 4); }
    ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { ctx.fillRect(i * s + 2, k * s + s - 7, s - 4, 5); ctx.fillRect(i * s + s - 7, k * s + 2, 5, s - 4); }
  },
  paving(ctx, N, R) {
    ctx.fillStyle = '#5b5348'; ctx.fillRect(0, 0, N, N);
    const rows = 8, rh = N / rows, cols = 4, cw = N / cols, gr = fbm(N, 16, 3, 61), P = ['#7d6f62', '#8a7b6b', '#6e6257', '#958676', '#83705f', '#9a8a77'];
    for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh, col = hexRgb(P[(R() * P.length) | 0]);
      const g = 3, w = cw - g, h = rh - g;
      wrap(N, x + cw / 2, y + rh / 2, cw, (px, py) => {
        const X = px - cw / 2 + g / 2, Y = py - rh / 2 + g / 2;
        const grd = ctx.createLinearGradient(X, Y, X + w, Y + h); grd.addColorStop(0, `rgb(${col.map(v => Math.min(255, v * 1.12) | 0)})`); grd.addColorStop(1, `rgb(${col.map(v => v * .86 | 0)})`);
        ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, Y, w, h, 3) : ctx.rect(X, Y, w, h); ctx.fill();
      });
    }
    const im = ctx.getImageData(0, 0, N, N); for (let i = 0; i < N * N; i++) { const m = .86 + gr[i] * .28; im.data[i * 4] *= m; im.data[i * 4 + 1] *= m; im.data[i * 4 + 2] *= m; } ctx.putImageData(im, 0, 0);
  },
  gravel(ctx, N, R) {
    paintField(ctx, N, fbm(N, 8, 3, 71), '#4c463e', '#6f675c', null);
    const C = ['#8a8378', '#a39c90', '#6f685e', '#bdb5a6', '#7d756a', '#968c7c', '#5f584f'];
    for (let i = 0; i < 2600; i++) { const x = R() * N, y = R() * N, r = 2.2 + R() * 4.5, a = R() * 3, c = C[(R() * C.length) | 0]; wrap(N, x, y, r + 2, (px, py) => { ell(ctx, px + 1, py + 1.4, r, r * .75, a, 'rgba(0,0,0,.45)'); ell(ctx, px, py, r, r * .75, a, c); ell(ctx, px - r * .3, py - r * .3, r * .35, r * .25, a, 'rgba(255,255,255,.25)'); }); }
  },
  water(ctx, N, R) {
    paintField(ctx, N, fbm(N, 3, 5, 81), '#0f2f3d', '#246576', fbm(N, 8, 3, 82), .2);
    const f = fbm(N, 6, 3, 83), im = ctx.getImageData(0, 0, N, N);
    for (let i = 0; i < N * N; i++) { const v = Math.abs(Math.sin(f[i] * 28)); const k = Math.pow(1 - v, 10) * 70; im.data[i * 4] += k * .6; im.data[i * 4 + 1] += k; im.data[i * 4 + 2] += k; }
    ctx.putImageData(im, 0, 0);
  },
  asphalt(ctx, N, R) {
    paintField(ctx, N, fbm(N, 16, 4, 91), '#2a2b2e', '#45464a', fbm(N, 4, 2, 92), .1);
    for (let i = 0; i < 9000; i++) { const x = R() * N, y = R() * N; ctx.fillStyle = R() < .5 ? 'rgba(160,160,165,.35)' : 'rgba(10,10,12,.5)'; ctx.fillRect(x, y, 1 + R(), 1 + R()); }
  }
};
// Textur erzeugen (einmalig, nacheinander, ohne die Oberfläche zu blockieren); danach alle Karten neu zeichnen
function realTex(t) {
  if (!RTGEN[t]) return null;
  if (RTEX[t] && RTEX[t].cv) return RTEX[t];
  if (!RTEX[t]) { RTEX[t] = {}; (rtQ = rtQ || []).push(t); if (rtQ.length === 1) setTimeout(rtRun, 30); }
  return null;
}
function rtRun() {
  const t = rtQ && rtQ[0]; if (!t) return;
  try {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    RTGEN[t](cv.getContext('2d'), N, rnd(t.length * 7919 + t.charCodeAt(0)));
    const done = url => { Object.assign(RTEX[t], { cv, w: RT_SIZE[t], url }); window.dispatchEvent(new CustomEvent('ht-tex', { detail: t })); HG_CARDS.forEach(c => { try { if (c._edit) c._editRender(); else { c._sig = ''; c._paint(); } } catch (e) { /* egal */ } }); };
    if (cv.toBlob) cv.toBlob(b => done(b ? URL.createObjectURL(b) : cv.toDataURL('image/jpeg', .85)), 'image/jpeg', .86); else done(cv.toDataURL('image/jpeg', .85));
  } catch (e) { console.warn('home-twin Textur', t, e); RTEX[t] = { failed: true }; }
  rtQ.shift(); if (rtQ.length) setTimeout(rtRun, 30);
}
// 2D: Muster der Außenflächen durch die echten Texturen ersetzen (sobald fertig)
const realDefs = (d, u, fl) => {
  const need = new Set((fl.areas || []).map(a => a.type).filter(t => RTGEN[t]));
  need.forEach(t => { const T = realTex(t); if (!T || !T.url) return; const w = T.w; d = d.replace(new RegExp(`<pattern id="${u}a_${t}"[\\s\\S]*?</pattern>`), `<pattern id="${u}a_${t}" width="${w}" height="${w}" patternUnits="userSpaceOnUse"><image href="${T.url}" width="${w}" height="${w}" preserveAspectRatio="none"/></pattern>`); });
  return d;
};
// Tageslicht: Sonnenhöhe (sun.sun) + Bewölkung (weather.*) → df 0 (Nacht) … 1 (volle Sonne), Dämmerung weich
const WX_CF = { sunny: 1, 'clear-night': 1, windy: .9, 'windy-variant': .7, partlycloudy: .72, cloudy: .45, fog: .35, rainy: .4, pouring: .3, snowy: .5, 'snowy-rainy': .4, hail: .35, lightning: .3, 'lightning-rainy': .3, exceptional: .6 };
const weatherEnt = (states, cfg = {}) => cfg.wetter ?? cfg.weather ?? Object.keys(states || {}).find(k => k.startsWith('weather.'));
const dayLight = (states, cfg = {}) => {
  const sun = (states || {})['sun.sun'];
  if (!sun || (cfg.tageslicht ?? cfg.daylight) === false) return { up: true, el: 45, az: 160, df: 1, cf: 1 };
  const a = sun.attributes || {}, el = num(a.elevation, sun.state === 'above_horizon' ? 30 : -10), az = num(a.azimuth, 180);
  const w = (states || {})[weatherEnt(states, cfg)], cf = w && WX_CF[String(w.state)] != null ? WX_CF[w.state] : 1;
  const df = el > 0 ? clamp(Math.sin(el * Math.PI / 180) * 3, 0, 1) * (.55 + .45 * cf) : clamp((el + 6) / 6, 0, 1) * .25;
  return { up: el > 0, el, az, df, cf };
};
// Darstellung: realistisch (Schatten, Tiefe) ist Standard; Karte stil: klassisch bzw. Plan style.look: classic schaltet ab
const isReal = (plan, cfg) => { const v = cfg && (cfg.stil ?? cfg.look); return v != null ? !/^(klass|class|flach|flat|aus|off|false)/i.test(String(v)) : ((plan && plan.style) || {}).look !== 'classic'; };
const NA = ['unavailable', 'unknown', 'none', ''];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const L = (d, c) => Object.assign({}, d, c);
const r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const rid = p => p + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));

const loadFonts = () => {
  if (document.getElementById('rtc-fonts')) return;
  const l = document.createElement('link');
  l.id = 'rtc-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap';
  document.head.appendChild(l);
};

// ------------------------------------------------------------------ Geometrie
const pip = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const proj = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1), q = [a[0] + t * dx, a[1] + t * dy];
  return { t, q, d: Math.hypot(p[0] - q[0], p[1] - q[1]), ang: Math.atan2(dy, dx) * 180 / Math.PI };
};
const centroid = P => {
  let a = 0, x = 0, y = 0;
  P.forEach((p, i) => { const q = P[(i + 1) % P.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c; });
  if (Math.abs(a) < 1e-6) return [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  return [x / (3 * a), y / (3 * a)];
};
const area = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
// Drehung der Ansicht in 90°-Schritten (im Uhrzeigersinn, wie SVG rotate)
const rotP = (p, r) => r === 90 ? [-p[1], p[0]] : r === 180 ? [-p[0], -p[1]] : r === 270 ? [p[1], -p[0]] : [p[0], p[1]];
const deg = a => ((Math.round(a) % 360) + 360) % 360;

// ------------------------------------------------------------------ Plan normalisieren
const TYPES = { light: 'Licht', switch: 'Schalter', climate: 'Thermostat', sensor: 'Sensor (Wert)', binary: 'Melder (an/aus)', tablet: 'Wand-Tablet', tracker: 'Position (BLE/Person)', bleproxy: 'BLE-Proxy' };
// Leuchtentypen: [Name, Öffnungswinkel °, Reichweite m, Icon]
const LAMP = { ceiling: ['Deckenlampe', 360, 1.8, 'light'], floor: ['Stehlampe', 360, 1.3, 'floorlamp'], wall: ['Wandlampe', 160, 1.6, 'walllamp'], spot: ['Spot', 50, 2.2, 'spot'], rope: ['Seilsystem', 50, 1.8, 'rope'] };
// Lichtquellen einer Leuchte (Seilsystem = jeder Spot einzeln)
const emitters = d => {
  const L0 = LAMP[d.lamp] || LAMP.ceiling, R = num(d.radius, L0[2]) || L0[2], sp = num(d.beam_spread, L0[1]), dir = num(d.beam_dir, 180), tl = num(d.beam_tilt, 90), h = num(d.mount_height, 2.4) || 2.4;
  if (d.lamp === 'rope') return (d.spots || []).map((q, k) => ({ k, x: num(q.x), y: num(q.y), dir: num(q.dir, dir), spread: num(q.spread, sp), R: num(q.radius, R) || R, tilt: num(q.tilt, tl), ent: q.entity || d.entity, h }));
  return [{ k: -1, x: num(d.x), y: num(d.y), dir, spread: sp, R, tilt: tl, ent: d.entity, h }];
};
// Lichtfleck am Boden: c = Kreis (rundum), s = Sektor (waagerecht), e = Ellipse (geneigter Spot aus Montagehöhe h)
const beamShape = em => {
  if (em.spread >= 359) return { t: 'c' };
  if (em.tilt >= 89) return { t: 's' };
  const rad = a => a * Math.PI / 180, hs = em.spread / 2, near = em.h * Math.tan(rad(Math.max(-80, em.tilt - hs))), fa = em.tilt + hs;
  const far = fa >= 85 ? em.R : Math.min(em.R, em.h * Math.tan(rad(fa)));
  if (far - near < .1) return { t: 's' };
  const c = (near + far) / 2, a = (far - near) / 2, b = Math.min(em.R, Math.max(.15, Math.hypot(em.h, c) * Math.tan(rad(hs)))), an = rad(em.dir);
  return { t: 'e', cx: em.x + Math.sin(an) * c, cy: em.y - Math.cos(an) * c, a, b, rot: em.dir - 90 };
};
// Seilsystem: Liste von Linienzügen (alt: d.rope = ein Linienzug)
const ropeLines = d => Array.isArray(d.ropes) ? d.ropes : Array.isArray(d.rope) ? [d.rope] : [];
const ropeSegs = d => { const out = [], cl = d.ropes_closed || []; ropeLines(d).forEach((L, li) => { for (let j = 0; j + 1 < L.length; j++) out.push([L[j], L[j + 1]]); if (cl[li] && L.length > 2) out.push([L[L.length - 1], L[0]]); }); return out; };
const ropeSnap = (d, p) => { let best = null; ropeSegs(d).forEach(([a, b]) => { const pr = proj(p, a, b); if (!best || pr.d < best.d) best = pr; }); return best ? [r2(best.q[0]), r2(best.q[1])] : [r2(p[0]), r2(p[1])]; };
const ropeAt = (d, f) => {
  const sg = ropeSegs(d), lens = sg.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])), tot = lens.reduce((x, y) => x + y, 0); if (!tot) return [num(d.x), num(d.y)];
  let t = f * tot; for (let i = 0; i < sg.length; i++) { if (t <= lens[i] || i === sg.length - 1) { const k = lens[i] ? Math.min(1, t / lens[i]) : 0, [a, b] = sg[i]; return [r2(a[0] + (b[0] - a[0]) * k), r2(a[1] + (b[1] - a[1]) * k)]; } t -= lens[i]; }
};
const ropePreset = (d, kind) => {
  const cx = num(d.x), cy = num(d.y), W = 3, H = 2, l = r2(cx - W / 2), r = r2(cx + W / 2), t = r2(cy - H / 2), b = r2(cy + H / 2);
  const P = { I: [[[l, cy], [r, cy]]], L: [[[l, t], [l, b], [r, b]]], U: [[[l, t], [l, b], [r, b], [r, t]]], Z: [[[l, t], [r, t], [l, b], [r, b]]], T: [[[l, t], [r, t]], [[cx, t], [cx, b]]], O: [[[l, t], [r, t], [r, b], [l, b]]] }[kind];
  d.ropes = P; d.ropes_closed = P.map((_, i) => kind === 'O' && i === 0); delete d.rope;
};
const beamPath = em => {
  const P = a => [em.x + em.R * Math.sin(a * Math.PI / 180), em.y - em.R * Math.cos(a * Math.PI / 180)], a0 = P(em.dir - em.spread / 2), a1 = P(em.dir + em.spread / 2);
  return `M${em.x} ${em.y}L${a0[0].toFixed(3)} ${a0[1].toFixed(3)}A${em.R} ${em.R} 0 ${em.spread > 180 ? 1 : 0} 1 ${a1[0].toFixed(3)} ${a1[1].toFixed(3)}Z`;
};
// An der Wand montierte Geräte (Heizkörper, Tablet): Drehung; Anzeige sitzt versetzt auf der Raumseite
const mountRot = d => d.type === 'climate' && (d.heater || 'radiator') === 'radiator' ? num(d.heater_rotate) : d.type === 'tablet' ? num(d.rotate) : null;
const pillPos = d => {
  const r = mountRot(d), x = num(d.x), y = num(d.y); if (r == null) return [x, y];
  const th = r * Math.PI / 180, of = num(d.pill_offset, d.type === 'tablet' ? .35 : .42), sh = num(d.pill_shift, 0);
  return [x - Math.sin(th) * of + Math.cos(th) * sh, y + Math.cos(th) * of + Math.sin(th) * sh];
};
const roomGrp = r => r.part_of || r.id;
const hexA = (h, a) => { const n = parseInt(String(h || '#000').replace('#', '').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16); return isNaN(n) ? h : `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const roomShadow = st => `text-shadow:${num(st.room_shadow_x, 0)}px ${num(st.room_shadow_y, 1)}px ${num(st.room_shadow_blur, 4)}px ${hexA(st.room_shadow_color || '#000000', num(st.room_shadow_opacity, 1))};`;
// ---- HA-Bereiche: Raum ↔ Bereich (area_id); ohne Angabe automatisch über den Namen
const normN = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const haArea = (h, r) => {
  const A = h && h.areas; if (!A || !r || r.area === '-') return null;
  if (r.area) return A[r.area] ? r.area : null;
  const n = normN(r.name || ''); if (!n) return null;
  const a = Object.values(A).find(x => normN(x.name) === n || normN(x.area_id) === n); return a ? a.area_id : null;
};
const AREA_C = new WeakMap();
const areaEnts = (h, aid) => {
  if (!h || !h.entities || !aid) return [];
  let m = AREA_C.get(h.entities);
  if (!m) {
    m = new Map(); const D = h.devices || {};
    Object.values(h.entities).forEach(e => { if (!e || e.hidden || e.entity_category) return; const a = e.area_id || (e.device_id && D[e.device_id] && D[e.device_id].area_id); if (!a) return; if (!m.has(a)) m.set(a, []); m.get(a).push(e.entity_id); });
    AREA_C.set(h.entities, m);
  }
  return m.get(aid) || [];
};
// Gruppen für das Bereichs-Popup / die Editor-Vorschläge
const AREA_GRP = [
  ['licht', 'Licht', (d, a) => d === 'light'],
  ['schalter', 'Schalter', (d, a) => ['switch', 'input_boolean', 'fan'].includes(d)],
  ['klima', 'Heizung / Klima', (d, a) => ['climate', 'humidifier', 'water_heater'].includes(d)],
  ['offen', 'Fenster, Türen, Schlösser', (d, a) => ['lock', 'cover'].includes(d) || (d === 'binary_sensor' && ['door', 'window', 'opening', 'garage_door', 'lock'].includes(a.device_class))],
  ['bewegung', 'Bewegung / Anwesenheit', (d, a) => d === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(a.device_class)],
  ['medien', 'Medien', (d, a) => d === 'media_player'],
  ['werte', 'Messwerte', (d, a) => d === 'sensor' && ['temperature', 'humidity', 'carbon_dioxide', 'pm25', 'pm10', 'volatile_organic_compounds', 'aqi', 'illuminance', 'power'].includes(a.device_class)],
];
const areaGroups = (h, aid) => {
  const st = (h && h.states) || {}, G = AREA_GRP.map(([k, n]) => ({ k, n, ids: [] })), rest = [];
  areaEnts(h, aid).forEach(id => { const S = st[id]; if (!S) return; const d = id.split('.')[0], a = S.attributes || {}, gi = AREA_GRP.findIndex(g => g[2](d, a)); if (gi < 0) rest.push(id); else G[gi].ids.push(id); });
  G.forEach(g => g.ids.sort((x, y) => String((st[x].attributes || {}).friendly_name || x).localeCompare(String((st[y].attributes || {}).friendly_name || y), 'de')));
  return { G: G.filter(g => g.ids.length), rest };
};
const autoType = id => { const d = String(id || '').split('.')[0]; return d === 'light' ? 'light' : d === 'climate' ? 'climate' : d === 'binary_sensor' ? 'binary' : ['switch', 'input_boolean', 'fan'].includes(d) ? 'switch' : ['person', 'device_tracker'].includes(d) ? 'tracker' : 'sensor'; };
const FLOORTYPES = { wood: 'Holz / Parkett', beech: 'Buche-Laminat', maple: 'Ahorn-Laminat', tiles: 'Fliesen', marble: 'Fliesen Marmor-Optik', diag: 'Fliesen diagonal (gesprenkelt)', carpet: 'Teppich', concrete: 'Beton / Keller', screed: 'Beton glatt (grau)', outdoor: 'Balkon / Terrasse', plain: 'Einfarbig' };
// Außenflächen (unter den Räumen, ohne Wände): [Name, Standardbreite als Weg/Linie in m]
const AREATYPES = { lawn: ['Rasen', 1], garden: ['Beet / Garten', .8], hedge: ['Hecke / Sträucher', .6], deck: ['Terrasse Holz', 1.2], slabs: ['Terrasse Platten', 1.2], paving: ['Pflaster / Weg', 1], gravel: ['Kies / Schotter', 1], water: ['Wasser / Teich', 1], asphalt: ['Asphalt / Einfahrt', 3], plain: ['Einfarbig', 1] };
const areaFill = (a, u) => a.type === 'plain' || !AREATYPES[a.type] ? (a.color || '#2a2d33') : `url(#${u}a_${a.type})`;
const areaW = a => Math.max(.05, num(a.width, (AREATYPES[a.type] || AREATYPES.lawn)[1]));
const areaOk = a => a.points.length >= (a.line ? 2 : 3);
const lineLen = P => P.reduce((s, p, i) => i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0);
const lineMid = P => { let t = lineLen(P) / 2; for (let i = 0; i + 1 < P.length; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (t <= l || i + 2 === P.length) { const f = l ? Math.min(1, t / l) : 0; return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f]; } t -= l; } return P[0] || [0, 0]; };
const areaLbl = a => a.label_x != null ? [num(a.label_x), num(a.label_y)] : a.line ? lineMid(a.points) : centroid(a.points);
const fixY = o => { if (o && o.y == null && o['true'] != null) { o.y = o['true']; delete o['true']; } return o; };
const normPlan = p0 => {
  const p = clone(p0 || {});
  p.grid = num(p.grid, .05) || .05;
  p.wall = L({ outer: .3, inner: .12 }, p.wall);
  p.style = L({}, p.style); // room_label, label (Gerätenamen), door_arc (Öffnungsbogen)
  if (!Array.isArray(p.floors) || !p.floors.length) p.floors = [{ id: 'eg', name: 'Erdgeschoss', level: 0 }];
  p.floors.forEach((f, i) => {
    f.id = String(f.id || 'e' + i); f.name = f.name || f.id; f.level = num(f.level, i);
    ['rooms', 'walls', 'openings', 'devices', 'furniture', 'areas'].forEach(k => { f[k] = Array.isArray(f[k]) ? f[k] : []; });
    f.areas.forEach((a, k) => { fixY(a); a.id = a.id || 'aussen' + (k + 1); a.type = a.type || 'lawn'; a.points = (a.points || []).map(q => [num(q[0]), num(q[1])]); if (a.line) a.line = true; else delete a.line; });
    f.rooms.forEach((r, k) => { r.id = r.id || 'raum' + (k + 1); r.points = (r.points || []).map(q => [num(q[0]), num(q[1])]); r.floor = r.floor || 'wood';
      if (Array.isArray(r.wall_thickness)) { r.wall_thickness = r.points.map((_, j) => r.wall_thickness[j] == null || r.wall_thickness[j] === '' ? null : num(r.wall_thickness[j])); if (r.wall_thickness.every(v => v == null)) delete r.wall_thickness; } else delete r.wall_thickness;
      if (Array.isArray(r.edge_height)) { r.edge_height = r.points.map((_, j) => r.edge_height[j] == null || r.edge_height[j] === '' ? null : num(r.edge_height[j])); if (r.edge_height.every(v => v == null)) delete r.edge_height; } else delete r.edge_height;
      ['edge_style', 'edge_color'].forEach(k => { if (Array.isArray(r[k])) { r[k] = r.points.map((_, j) => r[k][j] || null); if (r[k].every(v => v == null)) delete r[k]; } else delete r[k]; }); });
    f.walls.forEach(w => { w.a = [num((w.a || [])[0]), num((w.a || [])[1])]; w.b = [num((w.b || [])[0]), num((w.b || [])[1])]; });
    f.openings.forEach((o, k) => { fixY(o); o.type = ['door', 'passage'].includes(o.type) ? o.type : 'window'; o.id = o.id || ({ door: 'T', passage: 'D' }[o.type] || 'F') + (k + 1); o.length = num(o.length, o.type === 'window' ? 1.2 : .9); o.rotate = num(o.rotate); });
    f.devices.forEach((d, k) => { fixY(d); d.id = d.id || 'g' + (k + 1); d.type = d.type || autoType(d.entity); });
    f.furniture.forEach(m => { fixY(m); m.w = num(m.w, 1); m.h = num(m.h, 1); m.rotate = num(m.rotate); });
  });
  p.views = (Array.isArray(p.views) ? p.views : []).map((v, k) => { fixY(v); return L({ id: 'ausschnitt' + (k + 1), name: '', floor: p.floors[0].id, x: 0, y: 0, w: 4, h: 3, rotate: 0 }, v); });
  return p;
};

// ------------------------------------------------------------------ Möbel-Symbole (viewBox 0 0 100 100)
const F1 = '#3a3e48', F2 = '#4a4e57', F3 = '#5a5f69', NS = 'vector-effect="non-scaling-stroke"';
const S = (d, x = '') => `<path d="${d}" fill="none" stroke="${F3}" stroke-width="1.2" ${NS} ${x}/>`;
const FURN = {
  sofa: ['Sofa', 2.2, .9, `<rect width="100" height="100" rx="10" fill="${F1}"/><rect width="100" height="30" rx="8" fill="${F2}"/><rect y="0" width="12" height="100" rx="6" fill="${F2}"/><rect x="88" width="12" height="100" rx="6" fill="${F2}"/>${S('M50 32V96')}`],
  ecksofa: ['Ecksofa', 2.6, 2, `<path d="M0 0H100V38H38V100H0Z" fill="${F1}"/><path d="M0 0H100V12H12V100H0Z" fill="${F2}"/>${S('M56 14V36M14 56H36')}`],
  sessel: ['Sessel', .9, .9, `<rect width="100" height="100" rx="14" fill="${F1}"/><rect width="100" height="28" rx="10" fill="${F2}"/><rect width="18" height="100" rx="8" fill="${F2}"/><rect x="82" width="18" height="100" rx="8" fill="${F2}"/>`],
  bett: ['Bett', 1.8, 2.1, `<rect width="100" height="100" rx="4" fill="${F1}"/><rect x="6" y="5" width="40" height="14" rx="4" fill="${F3}"/><rect x="54" y="5" width="40" height="14" rx="4" fill="${F3}"/><rect x="2" y="28" width="96" height="70" rx="3" fill="${F2}"/>${S('M2 40H98')}`],
  bett1: ['Einzelbett', 1, 2, `<rect width="100" height="100" rx="5" fill="${F1}"/><rect x="12" y="5" width="76" height="14" rx="5" fill="${F3}"/><rect x="3" y="28" width="94" height="70" rx="4" fill="${F2}"/>`],
  tisch: ['Tisch', 1.6, .9, `<rect x="4" y="4" width="92" height="92" rx="4" fill="${F2}"/>${S('M10 10H90V90H10Z', 'stroke-opacity=".5"')}`],
  tischrund: ['Runder Tisch', 1.1, 1.1, `<circle cx="50" cy="50" r="46" fill="${F2}"/><circle cx="50" cy="50" r="38" fill="none" stroke="${F3}" stroke-width="1" ${NS} stroke-opacity=".5"/>`],
  stuhl: ['Stuhl', .45, .45, `<rect x="8" y="22" width="84" height="74" rx="10" fill="${F1}"/><rect x="8" y="4" width="84" height="16" rx="6" fill="${F3}"/>`],
  schrank: ['Schrank', 2, .6, `<rect width="100" height="100" fill="${F1}"/>${S('M0 0L100 100M100 0L0 100', 'stroke-opacity=".45"')}${S('M1 1H99V99H1Z')}`],
  regal: ['Regal', 1, .35, `<rect width="100" height="100" fill="${F1}"/>${S('M25 0V100M50 0V100M75 0V100', 'stroke-opacity=".6"')}`],
  kueche: ['Küchenzeile', 2.8, .6, `<rect width="100" height="100" fill="${F1}"/><rect x="8" y="18" width="20" height="64" rx="4" fill="#2a2d33"/>${S('M10 20H26V80H10Z', 'stroke-opacity=".5"')}<circle cx="60" cy="32" r="9" fill="none" stroke="${F3}" stroke-width="1.2" ${NS}/><circle cx="80" cy="32" r="9" fill="none" stroke="${F3}" stroke-width="1.2" ${NS}/><circle cx="60" cy="68" r="9" fill="none" stroke="${F3}" stroke-width="1.2" ${NS}/><circle cx="80" cy="68" r="9" fill="none" stroke="${F3}" stroke-width="1.2" ${NS}/>`],
  wc: ['WC', .4, .65, `<rect x="10" y="0" width="80" height="26" rx="6" fill="${F2}"/><ellipse cx="50" cy="62" rx="40" ry="36" fill="${F2}"/><ellipse cx="50" cy="64" rx="26" ry="24" fill="#2a2d33"/>`],
  waschbecken: ['Waschbecken', .6, .45, `<rect width="100" height="100" rx="10" fill="${F2}"/><ellipse cx="50" cy="58" rx="36" ry="30" fill="#2a2d33"/><circle cx="50" cy="14" r="5" fill="${F3}"/>`],
  dusche: ['Dusche', .9, .9, `<rect width="100" height="100" fill="${F1}"/>${S('M0 0L100 100M100 0L0 100', 'stroke-opacity=".4"')}<circle cx="50" cy="50" r="6" fill="#2a2d33" stroke="${F3}" stroke-width="1" ${NS}/>`],
  wanne: ['Badewanne', 1.7, .75, `<rect width="100" height="100" rx="6" fill="${F2}"/><rect x="6" y="10" width="88" height="80" rx="30" fill="#2a2d33"/><circle cx="14" cy="50" r="4" fill="${F3}"/>`],
  waschmaschine: ['Waschmaschine', .6, .6, `<rect width="100" height="100" rx="6" fill="${F2}"/><circle cx="50" cy="54" r="30" fill="#2a2d33" stroke="${F3}" stroke-width="1.2" ${NS}/>`],
  schreibtisch: ['Schreibtisch', 1.6, .8, `<rect width="100" height="100" rx="3" fill="${F2}"/><rect x="30" y="8" width="40" height="8" rx="2" fill="#1c1d20"/><rect x="34" y="16" width="32" height="3" fill="#6fb2ff" opacity=".5"/>`],
  tv: ['TV / Sideboard', 1.8, .45, `<rect y="40" width="100" height="60" rx="3" fill="${F1}"/><rect x="15" y="10" width="70" height="16" rx="2" fill="#1c1d20" stroke="#4a4d54" stroke-width="1" ${NS}/><rect x="20" y="26" width="60" height="5" fill="#6fb2ff" opacity=".5"/>`],
  pflanze: ['Pflanze', .5, .5, `<circle cx="50" cy="50" r="44" fill="#2f5e3b"/><circle cx="34" cy="38" r="22" fill="#3f7a4d"/><circle cx="64" cy="62" r="18" fill="#3f7a4d"/>`],
  baum: ['Baum', 3, 3, `<circle cx="54" cy="56" r="46" fill="#000" opacity=".35"/><circle cx="50" cy="50" r="46" fill="#29452a"/><circle cx="36" cy="40" r="25" fill="#33572f"/><circle cx="64" cy="58" r="24" fill="#2e5029"/><circle cx="58" cy="32" r="17" fill="#3e6a35"/><circle cx="34" cy="66" r="16" fill="#355c30"/><circle cx="50" cy="50" r="5" fill="#4a3826"/>`],
  busch: ['Busch / Strauch', 1.2, 1.2, `<circle cx="53" cy="55" r="44" fill="#000" opacity=".3"/><circle cx="40" cy="44" r="30" fill="#2f5229"/><circle cx="62" cy="56" r="30" fill="#2a4a25"/><circle cx="52" cy="38" r="20" fill="#3b6533"/>`],
  teppich: ['Teppich', 2, 1.4, `<rect width="100" height="100" rx="4" fill="#3a3340" opacity=".85"/>${S('M6 6H94V94H6Z', 'stroke-dasharray="4 3" stroke-opacity=".6"')}`],
};

// ------------------------------------------------------------------ Icons (24er viewBox)
const IC = {
  light: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  switch: 'M16 7V3h-2v4h-4V3H8v4a2 2 0 0 0-2 2v5.5L9.5 18v3h5v-3l3.5-3.5V9a2 2 0 0 0-2-2z',
  temp: 'M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0zm-3-9a1 1 0 0 1 1 1v3h-2V5a1 1 0 0 1 1-1z',
  hum: 'M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z',
  flame: 'M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-6 1-8.5z',
  rad: 'M4 5h2v13H4zm4 0h2v13H8zm4 0h2v13h-2zm4 0h2v13h-2zM2 18h20v2H2z',
  motion: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5 5 0 0 1-4.3-2.4l-1-1.6a2 2 0 0 0-1.7-1 2 2 0 0 0-.8.2L6 8.3V13h2V9.6z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3 0-8 1.5-8 4.5V21h16v-2.5c0-3-5-4.5-8-4.5z',
  dot: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  ble: 'M4.93 4.93A9.97 9.97 0 0 0 2 12c0 2.76 1.12 5.26 2.93 7.07l1.41-1.41A7.95 7.95 0 0 1 4 12c0-2.21.89-4.22 2.34-5.66L4.93 4.93zm14.14 0-1.41 1.41A7.95 7.95 0 0 1 20 12c0 2.22-.89 4.22-2.34 5.66l1.41 1.41A9.97 9.97 0 0 0 22 12c0-2.76-1.12-5.26-2.93-7.07zM7.76 7.76A5.98 5.98 0 0 0 6 12c0 1.65.67 3.15 1.76 4.24l1.41-1.41A3.99 3.99 0 0 1 8 12c0-1.11.45-2.11 1.17-2.83L7.76 7.76zm8.48 0-1.41 1.41C15.55 9.89 16 10.89 16 12s-.45 2.11-1.17 2.83l1.41 1.41A5.98 5.98 0 0 0 18 12c0-1.65-.67-3.15-1.76-4.24zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  tset: 'M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0zm-3-9a1 1 0 0 1 1 1v6h-2V5a1 1 0 0 1 1-1zM19 3h3v2h-3zm0 4h3v2h-3z',
  aq: 'M6.5 19a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 17.6 9.1 4.95 4.95 0 0 1 17.5 19z',
  co2: 'M5 12a7 7 0 1 1 14 0 7 7 0 0 1-14 0zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  power: 'M7 2v11h3v9l7-12h-4l4-8z',
  floorlamp: 'M8 2h8l2.5 7h-13zM11 9h2v11h-2zM7 20h10v2H7z',
  walllamp: 'M3 4h3v16H3zM6 10h3l8-6v16l-8-6H6z',
  spot: 'M9 2h6v4H9zM7 6h10l-3 8h-4zM11 16h2v6h-2z',
  rope: 'M2 4h20v1.5H2zM5.25 5.5h1.5V8h-1.5zM11.25 5.5h1.5V8h-1.5zM17.25 5.5h1.5V8h-1.5zM4 8h4l-.8 4H4.8zM10 8h4l-.8 4h-2.4zM16 8h4l-.8 4h-2.4z',
  tablet: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM6 6v12h12V6z',
};
const svgI = k => `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${IC[k] || IC.dot}"/></svg>`;
// eigenes Symbol (mdi:… über HA-<ha-icon>), sonst eingebautes SVG
const icoH = (icon, def) => icon && /^[a-z-]+:[a-z0-9-]+$/i.test(String(icon).trim()) && customElements.get('ha-icon') ? `<ha-icon icon="${String(icon).trim()}"></ha-icon>` : svgI(def);
const TAB_ICONS = ['mdi:tablet', 'mdi:tablet-dashboard', 'mdi:monitor-dashboard', 'mdi:view-dashboard', 'mdi:cellphone', 'mdi:television', 'mdi:home-automation', 'mdi:map-marker', 'mdi:map-marker-account', 'mdi:map-marker-radius', 'mdi:account', 'mdi:human-greeting', 'mdi:crosshairs-gps', 'mdi:star'];

// ------------------------------------------------------------------ Zustände
const sOk = s => !!s && !NA.includes(String(s.state).toLowerCase());
const isOn = s => sOk(s) && ['on', 'open', 'offen', 'true', 'home', 'detected', 'heat', 'heating'].includes(String(s.state).toLowerCase());
const resolveEnt = (states, id) => {
  if (!id || String(id).includes('.') || !states) return id;
  const k = String(id).trim(); if (states['sensor.' + k]) return 'sensor.' + k; if (states['binary_sensor.' + k]) return 'binary_sensor.' + k;
  return Object.keys(states).find(x => x.split('.')[1] === k) || id;
};
// Helligkeit einer Farbe (0 dunkel … 1 hell) – dunkle Schrift bekommt einen hellen Schatten
const lumHex = h => { const m = String(h || '').match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return 1; let x = m[1]; if (x.length === 3) x = x.replace(/./g, c => c + c); const n = parseInt(x, 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
// Farbe der Luftqualität nach Einheit (CO₂ ppm, VOC ppb, Feinstaub µg/m³, AQI)
const aqCol = s => {
  if (!sOk(s)) return '';
  const v = Number(s.state), u = String((s.attributes || {}).unit_of_measurement || '').toLowerCase(); if (!Number.isFinite(v)) return '';
  const [g, y] = u === 'ppm' ? [800, 1200] : u === 'ppb' ? [250, 500] : /g\/m/.test(u) ? [12, 35] : [50, 100];
  return v <= g ? '#3ddc84' : v <= y ? '#ffd166' : '#ff5a5a';
};
const contactState = (states, ct) => {
  const o = states[resolveEnt(states, ct.entity)], t = ct.tilt ? states[resolveEnt(states, ct.tilt)] : undefined;
  const on = s => sOk(s) && ['on', 'open', 'offen', 'true'].includes(String(s.state).toLowerCase());
  const tilted = s => sOk(s) && ['tilted', 'gekippt', 'tilt'].includes(String(s.state).toLowerCase());
  if (!sOk(o) && !sOk(t)) return 'na';
  if (on(o)) return 'open';
  if (tilted(o) || on(t)) return 'tilt';
  return 'closed';
};
const CCOL = { closed: ['#3ddc84', 'ZU'], tilt: ['#ffb347', 'GEKIPPT'], open: ['#ff5a5a', 'OFFEN'], na: ['#979ca5', 'N.V.'] };
// offene Türen nicht rot, sondern hell (Fenster bleiben rot)
const DOOR_OPEN = '#e6e8ec';
// Heizkörper-Bauarten: [Name, Höhe, Tiefe, Abstand zum Boden] in m
const HEATERS = { panel: ['Plattenheizkörper', .6, .1, .15], column: ['Gliederheizkörper (Rippen)', .6, .14, .12], towel: ['Badheizkörper (Handtuch)', 1.2, .06, .25], convector: ['Bodenkonvektor (im Boden)', .02, .25, 0], storage: ['Nachtspeicher', .65, .25, .1], design: ['Designheizkörper (senkrecht)', 1.8, .08, .1] };
// lodernde Flamme (2D): Glimmen + zwei Flammenzungen, animiert
const flameSvg = (u, k = 1) => `<g transform="scale(${k.toFixed(2)})" pointer-events="none"><circle r=".2" fill="url(#${u}fglow)"><animate attributeName="opacity" values=".55;.95;.65;.85;.5;.55" dur="1.4s" repeatCount="indefinite"/></circle>
<path d="M0 .075C-.055 .075-.08 .03-.068-.012-.058-.045-.025-.058-.03-.115.008-.088.03-.064.022-.034.036-.046.046-.056.04-.082.072-.046.078.016.058.045.046.066.022.075 0 .075Z" fill="url(#${u}fgrad)"><animateTransform attributeName="transform" type="scale" values="1 1;1.06 .9;.95 1.1;1.03 .96;1 1" dur=".75s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.85;1;.92;1" dur=".5s" repeatCount="indefinite"/></path>
<path d="M0 .068C-.03 .068-.04 .04-.034.016-.028-.008-.01-.02-.012-.05.012-.03.024-.012.018.012.03 .03.026.068 0 .068Z" fill="#fff3c4" opacity=".9"><animateTransform attributeName="transform" type="scale" values="1 1;.92 1.12;1.05 .9;1 1" dur=".55s" repeatCount="indefinite"/></path></g>`;
const heaterDim = d => { const k = HEATERS[d.heater_kind] ? d.heater_kind : 'panel', D = HEATERS[k]; return { k, L: num(d.heater_length, k === 'design' ? .45 : 1) || 1, H: num(d.heater_height, D[1]) || D[1], T: num(d.heater_depth, D[2]) || D[2], E: num(d.heater_elev, D[3]) }; };
// Tür-Glasausschnitte: Vorlagen (x = von der Blattmitte, y = Mitte über Boden, alles in m)
const HANDLES = { lever: 'Drücker (Klinke)', knob: 'Knauf (fest)', knob_turn: 'Drehknauf', pull: 'Stangengriff (ziehen)', shell: 'Griffmulde', none: 'kein Griff' };
const RAIL_FILL = { none: 'nur Rahmen (Stäbe)', boards: 'beplankt – Bretter waagerecht', boards_v: 'beplankt – Bretter senkrecht', glass: 'Glasfüllung' };
const DOOR_MATS = { wood: 'Holz', plastic: 'Kunststoff', glass: 'Ganzglas (mit schmalem Rahmen)' };
const PANE_SHAPES = { rect: 'eckig', round: 'abgerundete Ecken', arch: 'oben rund (Bogen)', circle: 'rund / oval' };
const GLASS_PRESETS = { mitte: ['mittig', [{ x: 0, y: 1.25, w: .4, h: .9 }]], oben: ['oben', [{ x: 0, y: 1.6, w: .55, h: .55 }]], zwei: ['2 übereinander', [{ x: 0, y: 1.6, w: .4, h: .5 }, { x: 0, y: .85, w: .4, h: .5 }]], drei: ['3 Streifen quer', [{ x: 0, y: 1.75, w: .5, h: .12 }, { x: 0, y: 1.5, w: .5, h: .12 }, { x: 0, y: 1.25, w: .5, h: .12 }]], streifen: ['Streifen senkrecht', [{ x: .22, y: 1.05, w: .1, h: 1.6 }]], bullauge: ['Bullauge', [{ x: 0, y: 1.5, w: .36, h: .36, shape: 'circle' }]], bogen: ['Bogen', [{ x: 0, y: 1.25, w: .45, h: 1, shape: 'arch' }]], rund: ['abgerundet', [{ x: 0, y: 1.25, w: .45, h: .95, shape: 'round', r: .08 }]] };
const ocol = (op, s) => op && op.type === 'door' && s === 'open' ? [DOOR_OPEN, 'OFFEN'] : CCOL[s];
const fmt = (s, dig) => {
  if (!sOk(s)) return '--';
  const u = (s.attributes || {}).unit_of_measurement || '', n = Number(s.state);
  if (!Number.isFinite(n)) return String(s.state);
  const d = dig ?? (u === '%' || u === 'ppm' || Math.abs(n) >= 100 ? 0 : 1);
  return n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + (u === '°C' ? '°' : u ? (u === '%' ? '%' : ' ' + u) : '');
};
const kelvin = k => {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -.1332), g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -.0755), b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  return `rgb(${[r, g, b].map(v => Math.round(clamp(v, 0, 255))).join(',')})`;
};
const lightCol = s => {
  const a = (s && s.attributes) || {};
  if (a.color_mode && /^(hs|rgb|rgbw|rgbww|xy)$/.test(a.color_mode) && a.rgb_color) return `rgb(${a.rgb_color.join(',')})`;
  if (a.color_temp_kelvin) return kelvin(a.color_temp_kelvin);
  if (a.rgb_color) return `rgb(${a.rgb_color.join(',')})`;
  return '#ffc46b';
};
const heatingOn = s => { if (!sOk(s)) return false; const a = s.attributes || {}; return a.hvac_action === 'heating' || (a.hvac_action == null && s.state === 'heat'); };
const sensorIcon = s => {
  const a = (s && s.attributes) || {}, dc = a.device_class, u = a.unit_of_measurement;
  return dc === 'temperature' || u === '°C' ? 'temp' : dc === 'humidity' ? 'hum' : dc === 'carbon_dioxide' || u === 'ppm' ? 'co2' : dc === 'power' || dc === 'energy' || u === 'W' ? 'power' : 'dot';
};

// ------------------------------------------------------------------ Wände (aus Raumkanten)
const wallCache = new Map();
function floorWalls(fl, W) {
  const key = JSON.stringify([fl.rooms.map(r => [r.points, r.floor === 'outdoor', r.wall_thickness, r.edge_style, r.edge_color, r.edge_height, r.id, r.part_of]), fl.walls, W]);
  if (wallCache.has(key)) return wallCache.get(key);
  const rooms = fl.rooms.filter(r => r.points.length >= 3), ind = rooms.filter(r => r.floor !== 'outdoor');
  const inI = p => ind.some(r => pip(p, r.points)), inA = p => rooms.some(r => pip(p, r.points));
  const gI = p => { const g = new Set(); ind.forEach(r => { if (pip(p, r.points)) g.add(roomGrp(r)); }); return g; };
  const raw = [];
  rooms.forEach(r => {
    const P = r.points, n = P.length;
    for (let i = 0; i < n; i++) {
      const tw = r.wall_thickness ? r.wall_thickness[i] : null, es = r.edge_style ? r.edge_style[i] : null, ec = r.edge_color ? r.edge_color[i] : null, eh = r.edge_height ? r.edge_height[i] : null;
      const a = P[i], b = P[(i + 1) % n], Lg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (Lg < .01) continue;
      const ux = (b[0] - a[0]) / Lg, uy = (b[1] - a[1]) / Lg, nx = -uy, ny = ux, k = Math.max(1, Math.ceil(Lg / .05));
      let cur = null;
      for (let j = 0; j < k; j++) {
        const t = (j + .5) / k * Lg, mx = a[0] + ux * t, my = a[1] + uy * t, e = .03;
        const p1 = [mx + nx * e, my + ny * e], p2 = [mx - nx * e, my - ny * e], i1 = inI(p1), i2 = inI(p2);
        let kind = 'none', s = 0;
        if (i1 && i2) { const g1 = gI(p1), g2 = gI(p2); kind = [...g1].some(x => g2.has(x)) ? 'none' : 'int'; } else if (i1 !== i2) { kind = 'ext'; s = i1 ? -1 : 1; } else if (inA(p1) || inA(p2)) kind = 'rail';
        if (es === 'rail' && kind !== 'none') { kind = 'rail'; s = 0; }
        if (cur && cur.kind === kind && cur.s === s) cur.t1 = (j + 1) / k * Lg;
        else { if (cur) raw.push(cur); cur = { kind, s, t0: j / k * Lg, t1: (j + 1) / k * Lg, a, ux, uy, nx, ny, tw: es === 'rail' ? null : tw, ec, eh, rid: r.id }; }
      }
      if (cur) raw.push(cur);
    }
  });
  const seen = new Set(), out = [];
  raw.filter(c => c.kind !== 'none').forEach(c => {
    const t = c.tw != null ? c.tw : c.kind === 'ext' ? W.outer : c.kind === 'int' ? W.inner : .05;
    if (t <= 0) return;
    const off = c.kind === 'ext' ? c.s * t / 2 : 0;
    const a0 = [c.a[0] + c.ux * c.t0, c.a[1] + c.uy * c.t0], b0 = [c.a[0] + c.ux * c.t1, c.a[1] + c.uy * c.t1], ex = c.kind === 'ext' ? t / 2 : 0;
    const k = [a0, b0].map(p => p.map(v => v.toFixed(2)).join(',')).sort().join('|') + c.kind + t;
    if (seen.has(k)) return; seen.add(k);
    out.push({ col: c.ec || null, h: c.eh ?? null, rid: c.rid, kind: c.kind, t, a0, b0, a: [a0[0] + c.nx * off - c.ux * ex, a0[1] + c.ny * off - c.uy * ex], b: [b0[0] + c.nx * off + c.ux * ex, b0[1] + c.ny * off + c.uy * ex], on: [c.nx * c.s, c.ny * c.s] });
  });
  // Außenwände als Fläche mit Gehrung: äußere Ecke = Schnittpunkt der Außenkanten beider Wände
  const ext = out.filter(w => w.kind === 'ext'), same = (p, q) => Math.abs(p[0] - q[0]) < .01 && Math.abs(p[1] - q[1]) < .01;
  const cut = (p1, d1, p2, d2) => { const den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-6) return null; const k = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den; return [p1[0] + d1[0] * k, p1[1] + d1[1] * k]; };
  ext.forEach(w => {
    const L0 = Math.hypot(w.b0[0] - w.a0[0], w.b0[1] - w.a0[1]) || 1, u = [(w.b0[0] - w.a0[0]) / L0, (w.b0[1] - w.a0[1]) / L0];
    const oa = [w.a0[0] + w.on[0] * w.t, w.a0[1] + w.on[1] * w.t], ob = [w.b0[0] + w.on[0] * w.t, w.b0[1] + w.on[1] * w.t];
    const corner = (E, def) => {
      for (const n of ext) {
        if (n === w || !(same(n.a0, E) || same(n.b0, E))) continue;
        const Ln = Math.hypot(n.b0[0] - n.a0[0], n.b0[1] - n.a0[1]) || 1, un = [(n.b0[0] - n.a0[0]) / Ln, (n.b0[1] - n.a0[1]) / Ln];
        const X = cut(def, u, [n.a0[0] + n.on[0] * n.t, n.a0[1] + n.on[1] * n.t], un);
        if (X && Math.hypot(X[0] - E[0], X[1] - E[1]) < 3 * Math.max(w.t, n.t) + .05) return X;
      }
      return def;
    };
    w.poly = [w.a0, w.b0, corner(w.b0, ob), corner(w.a0, oa)];
  });
  fl.walls.forEach(w => out.push({ kind: 'free', h: w.h3d ?? null, t: num(w.t, W.inner), a0: w.a, b0: w.b, a: w.a, b: w.b, on: [0, 0] }));
  if (wallCache.size > 60) wallCache.clear();
  wallCache.set(key, out);
  return out;
}
// Art einer Raumkante (Mitte prüfen): int / ext / rail / none
function edgeKind(fl, r, j) {
  const P = r.points, a = P[j], b = P[(j + 1) % P.length], Lg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / Lg, ny = (b[0] - a[0]) / Lg, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], e = .03;
  const rooms = fl.rooms.filter(q => q.points.length >= 3), inI = q => rooms.some(x => x.floor !== 'outdoor' && pip(q, x.points)), inA = q => rooms.some(x => pip(q, x.points));
  const p1 = [m[0] + nx * e, m[1] + ny * e], p2 = [m[0] - nx * e, m[1] - ny * e];
  if (r.edge_style && r.edge_style[j] === 'rail') return 'rail';
  if (inI(p1) && inI(p2)) { const g = q => new Set(rooms.filter(x => x.floor !== 'outdoor' && pip(q, x.points)).map(roomGrp)), g1 = g(p1), g2 = g(p2); if ([...g1].some(x => g2.has(x))) return 'none'; }
  return inI(p1) && inI(p2) ? 'int' : inI(p1) !== inI(p2) ? 'ext' : inA(p1) || inA(p2) ? 'rail' : 'none';
}
// Kanten anderer Räume auf derselben Wandlinie (kollinear + überlappend) → [raumIndex, kantenIndex]
function coEdges(fl, ri, j) {
  const r = fl.rooms[ri], a = r.points[j], b = r.points[(j + 1) % r.points.length], out = [];
  const Lg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lg < .01) return out;
  const ux = (b[0] - a[0]) / Lg, uy = (b[1] - a[1]) / Lg, off = q => Math.abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux), along = q => (q[0] - a[0]) * ux + (q[1] - a[1]) * uy;
  fl.rooms.forEach((o, k) => {
    if (k === ri) return;
    o.points.forEach((c, m) => {
      const d = o.points[(m + 1) % o.points.length];
      if (off(c) > .01 || off(d) > .01) return;
      const t0 = Math.min(along(c), along(d)), t1 = Math.max(along(c), along(d));
      if (Math.min(t1, Lg) - Math.max(t0, 0) > .01) out.push([k, m]);
    });
  });
  return out;
}
const EDGE_ARRS = ['wall_thickness', 'edge_style', 'edge_color', 'edge_height'];
const setEdgeArr = (r, j, key, v) => {
  if (!Array.isArray(r[key])) r[key] = r.points.map(() => null);
  r[key][j] = v;
  if (r[key].every(x => x == null)) delete r[key];
};
const edgeArrSplice = (r, idx, del, dup) => EDGE_ARRS.forEach(k => { if (!Array.isArray(r[k])) return; if (del) r[k].splice(idx, 1); else r[k].splice(idx, 0, r[k][dup] ?? null); if (r[k].every(x => x == null)) delete r[k]; });
const setEdgeT = (r, j, v) => {
  if (!Array.isArray(r.wall_thickness)) r.wall_thickness = r.points.map(() => null);
  r.wall_thickness[j] = v;
  if (r.wall_thickness.every(x => x == null)) delete r.wall_thickness;
};

// Wandband an der Öffnung: y-Bereich im lokalen System der Öffnung (x entlang Wand, +y = Raumseite)
function openingBand(op, walls) {
  const th = op.rotate * Math.PI / 180, ly = [-Math.sin(th), Math.cos(th)], p = [op.x, op.y];
  let best = null;
  walls.forEach(w => { const pr = proj(p, w.a0, w.b0); if (pr.d < .08 && (!best || pr.d < best.pr.d)) best = { w, pr }; });
  if (!best) return [-.06, .06];
  const w = best.w;
  if (w.kind === 'ext') { const d = Math.sign(w.on[0] * ly[0] + w.on[1] * ly[1]) || 1, y = d * w.t; return y < 0 ? [y, 0] : [0, y]; }
  if (w.kind === 'rail') return [-.04, .04];
  return [-w.t / 2, w.t / 2];
}

// ------------------------------------------------------------------ Zeichnen
const DEFS = u => `<defs>
<radialGradient id="${u}fglow"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset=".45" stop-color="#ff7a1a" stop-opacity=".3"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}fgrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".35" stop-color="#ffb02e"/><stop offset=".75" stop-color="#ff5a12"/><stop offset="1" stop-color="#d9230f" stop-opacity=".6"/></linearGradient>
<pattern id="${u}wood" width=".9" height=".18" patternUnits="userSpaceOnUse"><rect width=".9" height=".18" fill="#2c261f"/><rect y=".09" width=".9" height=".09" fill="#2f2821"/><path d="M0 .089H.9M0 .179H.9M.28 0V.09M.72 .09V.18" stroke="#1f1a15" stroke-width=".008"/></pattern>
<pattern id="${u}tiles" width=".3" height=".3" patternUnits="userSpaceOnUse"><rect width=".3" height=".3" fill="#2a2d33"/><path d="M0 .297H.3M.297 0V.3" stroke="#1d2024" stroke-width=".01"/></pattern>
<pattern id="${u}carpet" width=".08" height=".08" patternUnits="userSpaceOnUse"><rect width=".08" height=".08" fill="#2b2a33"/><circle cx=".04" cy=".04" r=".012" fill="#33323d"/></pattern>
<pattern id="${u}concrete" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#25272b"/><circle cx=".3" cy=".4" r=".02" fill="#2c2e33"/><circle cx=".75" cy=".8" r=".015" fill="#2c2e33"/><circle cx=".8" cy=".2" r=".01" fill="#2c2e33"/></pattern>
<pattern id="${u}outdoor" width=".15" height="1" patternUnits="userSpaceOnUse"><rect width=".15" height="1" fill="#24272a"/><path d="M.146 0V1" stroke="#1b1d20" stroke-width=".012"/></pattern>
<pattern id="${u}plain" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#22252a"/></pattern>
<pattern id="${u}marble" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="#3a3c40"/><rect x=".004" y=".004" width=".592" height=".592" fill="#6a6d73"/><rect x=".604" y=".004" width=".592" height=".592" fill="#66696f"/><rect x=".004" y=".604" width=".592" height=".592" fill="#64676d"/><rect x=".604" y=".604" width=".592" height=".592" fill="#696c72"/><circle cx=".2" cy=".35" r=".22" fill="#74777d" opacity=".35"/><circle cx=".95" cy=".2" r=".25" fill="#5e6167" opacity=".35"/><circle cx=".35" cy=".95" r=".2" fill="#74777d" opacity=".3"/><circle cx=".85" cy=".9" r=".22" fill="#5f6268" opacity=".35"/><path d="M.02 .12C.14 .18 .2 .3 .33 .33S.5 .5 .58 .58" fill="none" stroke="#eceef2" stroke-opacity="0.42" stroke-width="0.006" stroke-linecap="round"/><path d="M.2 .05C.25 .15 .22 .25 .3 .32" fill="none" stroke="#eceef2" stroke-opacity="0.26" stroke-width="0.003" stroke-linecap="round"/><path d="M.06 .5C.16 .44 .26 .5 .38 .46" fill="none" stroke="#eceef2" stroke-opacity="0.20" stroke-width="0.003" stroke-linecap="round"/><path d="M.62 .5C.72 .42 .8 .44 .9 .3S1.1 .12 1.18 .06" fill="none" stroke="#eceef2" stroke-opacity="0.39" stroke-width="0.005" stroke-linecap="round"/><path d="M.85 .38C.92 .45 1 .44 1.1 .52" fill="none" stroke="#eceef2" stroke-opacity="0.21" stroke-width="0.003" stroke-linecap="round"/><path d="M.02 1.12C.12 1.02 .2 1.04 .3 .92S.48 .74 .58 .66" fill="none" stroke="#eceef2" stroke-opacity="0.36" stroke-width="0.005" stroke-linecap="round"/><path d="M.12 .7C.2 .78 .28 .76 .34 .86" fill="none" stroke="#eceef2" stroke-opacity="0.21" stroke-width="0.003" stroke-linecap="round"/><path d="M.62 .7C.7 .8 .82 .82 .9 .95S1.08 1.1 1.18 1.18" fill="none" stroke="#eceef2" stroke-opacity="0.39" stroke-width="0.006" stroke-linecap="round"/><path d="M1.05 .64C1.02 .74 1.08 .82 1.04 .9" fill="none" stroke="#eceef2" stroke-opacity="0.20" stroke-width="0.003" stroke-linecap="round"/></pattern>
<pattern id="${u}beech" width="1.2" height=".6" patternUnits="userSpaceOnUse"><rect width="1.2" height=".2" fill="#5c4632"/><rect y=".2" width="1.2" height=".2" fill="#614a35"/><rect y=".4" width="1.2" height=".2" fill="#594330"/><rect x=".4" y=".2" width=".8" height=".2" fill="#654d37"/><rect x=".8" y=".4" width=".4" height=".2" fill="#5f4834"/><rect width=".75" height=".2" fill="#604934"/><path d="M0 .05H1.2M0 .12H1.2M0 .16H1.2M0 .25H1.2M0 .31H1.2M0 .37H1.2M0 .44H1.2M0 .5H1.2M0 .56H1.2" stroke="#4b3926" stroke-opacity=".35" stroke-width=".004"/><path d="M.1 .085C.3 .07 .5 .1 .7 .08M.5 .28C.7 .27 .9 .3 1.1 .285M.2 .48C.4 .47 .6 .5 .75 .49" stroke="#7a5d42" stroke-opacity=".35" stroke-width=".006" fill="none"/><path d="M0 .199H1.2M0 .399H1.2M0 .599H1.2" stroke="#2e2318" stroke-width=".008"/><path d="M.75 0V.2M.4 .2V.4M0 .2V.4M.8 .4V.6" stroke="#2e2318" stroke-width=".008"/></pattern>
<pattern id="${u}maple" width="1.2" height=".6" patternUnits="userSpaceOnUse"><rect width="1.2" height=".2" fill="#8c7a60"/><rect y=".2" width="1.2" height=".2" fill="#917f64"/><rect y=".4" width="1.2" height=".2" fill="#88765c"/><rect width=".55" height=".2" fill="#927f65"/><rect x=".95" y=".2" width=".25" height=".2" fill="#8a785e"/><rect x=".3" y=".4" width=".9" height=".2" fill="#8f7d62"/><path d="M0 .06H1.2M0 .13H1.2M0 .26H1.2M0 .33H1.2M0 .46H1.2M0 .53H1.2" stroke="#76664f" stroke-opacity=".3" stroke-width=".004"/><path d="M.1 .09C.25 .08 .4 .1 .5 .09M.6 .29C.75 .28 .85 .31 .92 .295M.4 .49C.6 .48 .8 .5 1.1 .49" stroke="#a39073" stroke-opacity=".45" stroke-width=".006" fill="none"/><path d="M0 .199H1.2M0 .399H1.2M0 .599H1.2" stroke="#5a4c3a" stroke-width=".008"/><path d="M.55 0V.2M.95 .2V.4M.3 .4V.6M0 .4V.6" stroke="#5a4c3a" stroke-width=".008"/></pattern>
<pattern id="${u}diag" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#3a3c40"/><rect x="0.004" y="0.004" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.124" cy="0.051" r="0.017" fill="#45484d" opacity="0.75"/><circle cx="0.085" cy="0.135" r="0.013" fill="#a7aaaf" opacity="0.7"/><circle cx="0.245" cy="0.329" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.124" cy="0.182" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.109" cy="0.317" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="0.027" cy="0.131" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="0.236" cy="0.258" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="0.327" cy="0.026" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.338" cy="0.044" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="0.333" cy="0.153" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.239" cy="0.264" r="0.014" fill="#45484d" opacity="0.75"/><circle cx="0.301" cy="0.319" r="0.017" fill="#a7aaaf" opacity="0.7"/><circle cx="0.292" cy="0.117" r="0.008" fill="#45484d" opacity="0.75"/><circle cx="0.095" cy="0.154" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="0.166" cy="0.079" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="0.361" cy="0.025" r="0.012" fill="#45484d" opacity="0.75"/><circle cx="0.146" cy="0.323" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.185" cy="0.326" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.041" cy="0.129" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.267" cy="0.268" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.232" cy="0.184" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.334" cy="0.302" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.332" cy="0.242" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.181" cy="0.278" r="0.011" fill="#6d7176" opacity="0.7"/><circle cx="0.362" cy="0.043" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="0.216" cy="0.118" r="0.011" fill="#a7aaaf" opacity="0.7"/><circle cx="0.283" cy="0.107" r="0.006" fill="#a7aaaf" opacity="0.7"/><circle cx="0.376" cy="0.355" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.170" cy="0.147" r="0.015" fill="#e2e4e8" opacity="0.55"/><circle cx="0.037" cy="0.299" r="0.019" fill="#a7aaaf" opacity="0.7"/><circle cx="0.251" cy="0.361" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.068" cy="0.204" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.070" cy="0.351" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.237" cy="0.311" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.161" cy="0.163" r="0.014" fill="#45484d" opacity="0.75"/><circle cx="0.255" cy="0.139" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.209" cy="0.081" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.324" cy="0.276" r="0.016" fill="#a7aaaf" opacity="0.7"/><circle cx="0.093" cy="0.289" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.042" cy="0.295" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.055" cy="0.041" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.209" cy="0.299" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.363" cy="0.079" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.356" cy="0.084" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.103" cy="0.045" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.293" cy="0.057" r="0.005" fill="#e2e4e8" opacity="0.55"/><rect x="0.404" y="0.004" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.752" cy="0.280" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="0.424" cy="0.153" r="0.013" fill="#e2e4e8" opacity="0.55"/><circle cx="0.484" cy="0.104" r="0.019" fill="#c4c7cc" opacity="0.75"/><circle cx="0.692" cy="0.128" r="0.015" fill="#e2e4e8" opacity="0.55"/><circle cx="0.624" cy="0.122" r="0.019" fill="#45484d" opacity="0.75"/><circle cx="0.763" cy="0.096" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.450" cy="0.255" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.601" cy="0.202" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.652" cy="0.283" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.655" cy="0.158" r="0.018" fill="#6d7176" opacity="0.7"/><circle cx="0.605" cy="0.269" r="0.010" fill="#e2e4e8" opacity="0.55"/><circle cx="0.777" cy="0.164" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.427" cy="0.090" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.513" cy="0.196" r="0.007" fill="#6d7176" opacity="0.7"/><circle cx="0.638" cy="0.365" r="0.010" fill="#e2e4e8" opacity="0.55"/><circle cx="0.771" cy="0.300" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.573" cy="0.234" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.485" cy="0.385" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.432" cy="0.288" r="0.019" fill="#e2e4e8" opacity="0.55"/><circle cx="0.661" cy="0.259" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.569" cy="0.098" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.414" cy="0.303" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.652" cy="0.144" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.764" cy="0.132" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="0.590" cy="0.221" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.420" cy="0.141" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.569" cy="0.361" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.461" cy="0.292" r="0.011" fill="#c4c7cc" opacity="0.75"/><circle cx="0.592" cy="0.123" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.611" cy="0.283" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.651" cy="0.014" r="0.010" fill="#c4c7cc" opacity="0.75"/><circle cx="0.667" cy="0.343" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.764" cy="0.150" r="0.010" fill="#c4c7cc" opacity="0.75"/><circle cx="0.661" cy="0.016" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="0.518" cy="0.298" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.528" cy="0.211" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.740" cy="0.170" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.774" cy="0.239" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.528" cy="0.343" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.763" cy="0.352" r="0.015" fill="#a7aaaf" opacity="0.7"/><circle cx="0.556" cy="0.040" r="0.012" fill="#45484d" opacity="0.75"/><circle cx="0.639" cy="0.042" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.605" cy="0.061" r="0.010" fill="#6d7176" opacity="0.7"/><circle cx="0.491" cy="0.329" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.737" cy="0.313" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.517" cy="0.299" r="0.004" fill="#45484d" opacity="0.75"/><rect x="0.804" y="0.004" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.854" cy="0.229" r="0.015" fill="#e2e4e8" opacity="0.55"/><circle cx="1.095" cy="0.277" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="1.149" cy="0.189" r="0.013" fill="#c4c7cc" opacity="0.75"/><circle cx="1.095" cy="0.364" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="1.165" cy="0.185" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.825" cy="0.358" r="0.007" fill="#6d7176" opacity="0.7"/><circle cx="1.114" cy="0.236" r="0.020" fill="#e2e4e8" opacity="0.55"/><circle cx="0.845" cy="0.289" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.945" cy="0.303" r="0.013" fill="#e2e4e8" opacity="0.55"/><circle cx="1.161" cy="0.093" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="1.137" cy="0.086" r="0.012" fill="#c4c7cc" opacity="0.75"/><circle cx="1.011" cy="0.277" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="1.110" cy="0.187" r="0.009" fill="#c4c7cc" opacity="0.75"/><circle cx="1.165" cy="0.203" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.895" cy="0.153" r="0.017" fill="#a7aaaf" opacity="0.7"/><circle cx="0.836" cy="0.017" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="1.179" cy="0.140" r="0.012" fill="#a7aaaf" opacity="0.7"/><circle cx="0.848" cy="0.182" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.966" cy="0.209" r="0.017" fill="#e2e4e8" opacity="0.55"/><circle cx="1.054" cy="0.146" r="0.019" fill="#c4c7cc" opacity="0.75"/><circle cx="1.122" cy="0.239" r="0.010" fill="#6d7176" opacity="0.7"/><circle cx="0.999" cy="0.261" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="1.040" cy="0.096" r="0.011" fill="#a7aaaf" opacity="0.7"/><circle cx="0.839" cy="0.198" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="1.184" cy="0.049" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="1.013" cy="0.241" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="1.002" cy="0.311" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="1.022" cy="0.198" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.846" cy="0.080" r="0.018" fill="#e2e4e8" opacity="0.55"/><circle cx="1.109" cy="0.076" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="1.138" cy="0.209" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="1.166" cy="0.239" r="0.015" fill="#6d7176" opacity="0.7"/><circle cx="1.035" cy="0.119" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="1.032" cy="0.331" r="0.019" fill="#45484d" opacity="0.75"/><circle cx="1.097" cy="0.217" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="1.030" cy="0.315" r="0.015" fill="#6d7176" opacity="0.7"/><circle cx="0.953" cy="0.063" r="0.011" fill="#6d7176" opacity="0.7"/><circle cx="0.888" cy="0.265" r="0.009" fill="#a7aaaf" opacity="0.7"/><circle cx="0.970" cy="0.163" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="1.153" cy="0.032" r="0.017" fill="#a7aaaf" opacity="0.7"/><circle cx="1.167" cy="0.257" r="0.012" fill="#6d7176" opacity="0.7"/><circle cx="1.105" cy="0.290" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="1.130" cy="0.112" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="1.055" cy="0.068" r="0.017" fill="#45484d" opacity="0.75"/><circle cx="0.933" cy="0.193" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="1.134" cy="0.178" r="0.009" fill="#a7aaaf" opacity="0.7"/><rect x="0.004" y="0.404" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.381" cy="0.724" r="0.015" fill="#a7aaaf" opacity="0.7"/><circle cx="0.282" cy="0.525" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.242" cy="0.505" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.242" cy="0.549" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.249" cy="0.735" r="0.008" fill="#6d7176" opacity="0.7"/><circle cx="0.302" cy="0.544" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.089" cy="0.569" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.287" cy="0.723" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.014" cy="0.568" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.172" cy="0.659" r="0.014" fill="#e2e4e8" opacity="0.55"/><circle cx="0.268" cy="0.738" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.381" cy="0.454" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.367" cy="0.692" r="0.006" fill="#a7aaaf" opacity="0.7"/><circle cx="0.069" cy="0.656" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.149" cy="0.450" r="0.018" fill="#6d7176" opacity="0.7"/><circle cx="0.173" cy="0.545" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.315" cy="0.727" r="0.017" fill="#c4c7cc" opacity="0.75"/><circle cx="0.321" cy="0.433" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.214" cy="0.467" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.129" cy="0.449" r="0.016" fill="#c4c7cc" opacity="0.75"/><circle cx="0.020" cy="0.652" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.368" cy="0.710" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.139" cy="0.451" r="0.013" fill="#c4c7cc" opacity="0.75"/><circle cx="0.247" cy="0.607" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.131" cy="0.772" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.218" cy="0.605" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.127" cy="0.548" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.131" cy="0.527" r="0.012" fill="#a7aaaf" opacity="0.7"/><circle cx="0.241" cy="0.787" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.285" cy="0.726" r="0.010" fill="#c4c7cc" opacity="0.75"/><circle cx="0.243" cy="0.603" r="0.012" fill="#45484d" opacity="0.75"/><circle cx="0.084" cy="0.496" r="0.017" fill="#6d7176" opacity="0.7"/><circle cx="0.220" cy="0.639" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.341" cy="0.497" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.371" cy="0.734" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.183" cy="0.538" r="0.013" fill="#a7aaaf" opacity="0.7"/><circle cx="0.299" cy="0.461" r="0.011" fill="#e2e4e8" opacity="0.55"/><circle cx="0.228" cy="0.624" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.048" cy="0.674" r="0.013" fill="#6d7176" opacity="0.7"/><circle cx="0.369" cy="0.746" r="0.017" fill="#c4c7cc" opacity="0.75"/><circle cx="0.279" cy="0.417" r="0.012" fill="#6d7176" opacity="0.7"/><circle cx="0.067" cy="0.545" r="0.018" fill="#a7aaaf" opacity="0.7"/><circle cx="0.048" cy="0.473" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.024" cy="0.738" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.114" cy="0.779" r="0.019" fill="#6d7176" opacity="0.7"/><circle cx="0.341" cy="0.646" r="0.005" fill="#a7aaaf" opacity="0.7"/><rect x="0.404" y="0.404" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.489" cy="0.712" r="0.010" fill="#a7aaaf" opacity="0.7"/><circle cx="0.463" cy="0.497" r="0.008" fill="#6d7176" opacity="0.7"/><circle cx="0.769" cy="0.764" r="0.013" fill="#e2e4e8" opacity="0.55"/><circle cx="0.749" cy="0.588" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.565" cy="0.703" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.783" cy="0.700" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.703" cy="0.617" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.695" cy="0.518" r="0.015" fill="#a7aaaf" opacity="0.7"/><circle cx="0.658" cy="0.706" r="0.009" fill="#a7aaaf" opacity="0.7"/><circle cx="0.601" cy="0.674" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="0.728" cy="0.571" r="0.018" fill="#a7aaaf" opacity="0.7"/><circle cx="0.644" cy="0.656" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.694" cy="0.633" r="0.006" fill="#a7aaaf" opacity="0.7"/><circle cx="0.537" cy="0.734" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.616" cy="0.425" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.480" cy="0.746" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.751" cy="0.508" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.449" cy="0.640" r="0.008" fill="#c4c7cc" opacity="0.75"/><circle cx="0.587" cy="0.511" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="0.491" cy="0.519" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.770" cy="0.423" r="0.007" fill="#45484d" opacity="0.75"/><circle cx="0.513" cy="0.554" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.761" cy="0.641" r="0.017" fill="#c4c7cc" opacity="0.75"/><circle cx="0.700" cy="0.777" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.509" cy="0.750" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.682" cy="0.749" r="0.010" fill="#e2e4e8" opacity="0.55"/><circle cx="0.492" cy="0.449" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.448" cy="0.598" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.506" cy="0.718" r="0.015" fill="#45484d" opacity="0.75"/><circle cx="0.770" cy="0.441" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.583" cy="0.725" r="0.010" fill="#c4c7cc" opacity="0.75"/><circle cx="0.483" cy="0.422" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.659" cy="0.628" r="0.008" fill="#45484d" opacity="0.75"/><circle cx="0.787" cy="0.628" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="0.487" cy="0.488" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="0.784" cy="0.509" r="0.007" fill="#6d7176" opacity="0.7"/><circle cx="0.560" cy="0.560" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.771" cy="0.415" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.645" cy="0.709" r="0.014" fill="#a7aaaf" opacity="0.7"/><circle cx="0.528" cy="0.770" r="0.013" fill="#a7aaaf" opacity="0.7"/><circle cx="0.455" cy="0.454" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.492" cy="0.729" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.565" cy="0.758" r="0.008" fill="#45484d" opacity="0.75"/><circle cx="0.543" cy="0.478" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.576" cy="0.443" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.547" cy="0.773" r="0.008" fill="#6d7176" opacity="0.7"/><rect x="0.804" y="0.404" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.934" cy="0.739" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="1.171" cy="0.477" r="0.019" fill="#6d7176" opacity="0.7"/><circle cx="1.123" cy="0.691" r="0.009" fill="#a7aaaf" opacity="0.7"/><circle cx="1.078" cy="0.736" r="0.016" fill="#c4c7cc" opacity="0.75"/><circle cx="0.976" cy="0.705" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.993" cy="0.762" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.874" cy="0.719" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="1.018" cy="0.628" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="1.184" cy="0.484" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.949" cy="0.562" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="1.171" cy="0.494" r="0.014" fill="#a7aaaf" opacity="0.7"/><circle cx="0.817" cy="0.486" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="1.176" cy="0.517" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.935" cy="0.556" r="0.011" fill="#c4c7cc" opacity="0.75"/><circle cx="0.896" cy="0.640" r="0.009" fill="#45484d" opacity="0.75"/><circle cx="1.056" cy="0.458" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.935" cy="0.687" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="0.920" cy="0.446" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.838" cy="0.636" r="0.009" fill="#45484d" opacity="0.75"/><circle cx="1.047" cy="0.763" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="1.138" cy="0.531" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="1.149" cy="0.549" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="1.144" cy="0.657" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="1.050" cy="0.769" r="0.009" fill="#a7aaaf" opacity="0.7"/><circle cx="1.112" cy="0.448" r="0.011" fill="#e2e4e8" opacity="0.55"/><circle cx="1.103" cy="0.622" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.906" cy="0.659" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.977" cy="0.584" r="0.011" fill="#c4c7cc" opacity="0.75"/><circle cx="1.172" cy="0.530" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="0.957" cy="0.452" r="0.019" fill="#a7aaaf" opacity="0.7"/><circle cx="0.996" cy="0.455" r="0.015" fill="#e2e4e8" opacity="0.55"/><circle cx="0.852" cy="0.634" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="1.078" cy="0.773" r="0.005" fill="#6d7176" opacity="0.7"/><circle cx="1.043" cy="0.689" r="0.016" fill="#c4c7cc" opacity="0.75"/><circle cx="1.145" cy="0.431" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="1.143" cy="0.747" r="0.016" fill="#c4c7cc" opacity="0.75"/><circle cx="0.992" cy="0.783" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="1.173" cy="0.548" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="1.027" cy="0.623" r="0.007" fill="#e2e4e8" opacity="0.55"/><circle cx="1.094" cy="0.612" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="1.187" cy="0.484" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="0.981" cy="0.652" r="0.010" fill="#a7aaaf" opacity="0.7"/><circle cx="0.848" cy="0.428" r="0.013" fill="#e2e4e8" opacity="0.55"/><circle cx="1.062" cy="0.490" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.879" cy="0.709" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.881" cy="0.480" r="0.016" fill="#e2e4e8" opacity="0.55"/><rect x="0.004" y="0.804" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.248" cy="0.840" r="0.016" fill="#45484d" opacity="0.75"/><circle cx="0.172" cy="1.068" r="0.009" fill="#a7aaaf" opacity="0.7"/><circle cx="0.266" cy="1.044" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.220" cy="0.986" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.335" cy="1.181" r="0.011" fill="#e2e4e8" opacity="0.55"/><circle cx="0.104" cy="0.818" r="0.006" fill="#a7aaaf" opacity="0.7"/><circle cx="0.053" cy="0.824" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.065" cy="0.946" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.220" cy="0.828" r="0.019" fill="#a7aaaf" opacity="0.7"/><circle cx="0.373" cy="0.984" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.367" cy="0.989" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.114" cy="0.950" r="0.015" fill="#45484d" opacity="0.75"/><circle cx="0.304" cy="0.962" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.363" cy="1.185" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.035" cy="1.058" r="0.008" fill="#6d7176" opacity="0.7"/><circle cx="0.095" cy="1.009" r="0.013" fill="#6d7176" opacity="0.7"/><circle cx="0.303" cy="1.033" r="0.010" fill="#6d7176" opacity="0.7"/><circle cx="0.235" cy="1.027" r="0.013" fill="#a7aaaf" opacity="0.7"/><circle cx="0.374" cy="1.001" r="0.016" fill="#e2e4e8" opacity="0.55"/><circle cx="0.061" cy="1.160" r="0.016" fill="#e2e4e8" opacity="0.55"/><circle cx="0.212" cy="1.107" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.263" cy="0.812" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.266" cy="1.063" r="0.012" fill="#e2e4e8" opacity="0.55"/><circle cx="0.216" cy="1.174" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.012" cy="1.069" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.038" cy="0.995" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="0.124" cy="1.101" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.249" cy="0.894" r="0.006" fill="#6d7176" opacity="0.7"/><circle cx="0.382" cy="0.829" r="0.020" fill="#c4c7cc" opacity="0.75"/><circle cx="0.184" cy="1.139" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.096" cy="0.914" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.043" cy="0.817" r="0.013" fill="#6d7176" opacity="0.7"/><circle cx="0.272" cy="1.164" r="0.018" fill="#e2e4e8" opacity="0.55"/><circle cx="0.180" cy="1.003" r="0.019" fill="#a7aaaf" opacity="0.7"/><circle cx="0.025" cy="0.832" r="0.014" fill="#a7aaaf" opacity="0.7"/><circle cx="0.263" cy="1.049" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.375" cy="1.037" r="0.009" fill="#45484d" opacity="0.75"/><circle cx="0.201" cy="1.126" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="0.031" cy="1.046" r="0.014" fill="#6d7176" opacity="0.7"/><circle cx="0.180" cy="0.890" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.072" cy="0.821" r="0.007" fill="#45484d" opacity="0.75"/><circle cx="0.203" cy="1.028" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.222" cy="0.812" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="0.262" cy="0.919" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.278" cy="0.872" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.375" cy="1.055" r="0.007" fill="#6d7176" opacity="0.7"/><rect x="0.404" y="0.804" width=".392" height=".392" fill="#8a8d92"/><circle cx="0.671" cy="0.921" r="0.005" fill="#45484d" opacity="0.75"/><circle cx="0.529" cy="0.827" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.539" cy="1.116" r="0.005" fill="#a7aaaf" opacity="0.7"/><circle cx="0.751" cy="1.075" r="0.014" fill="#45484d" opacity="0.75"/><circle cx="0.785" cy="1.144" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.539" cy="0.872" r="0.017" fill="#45484d" opacity="0.75"/><circle cx="0.774" cy="0.881" r="0.010" fill="#e2e4e8" opacity="0.55"/><circle cx="0.567" cy="0.945" r="0.008" fill="#c4c7cc" opacity="0.75"/><circle cx="0.650" cy="0.947" r="0.017" fill="#c4c7cc" opacity="0.75"/><circle cx="0.616" cy="0.966" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="0.502" cy="0.858" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.748" cy="0.842" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.528" cy="0.828" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.465" cy="1.134" r="0.010" fill="#a7aaaf" opacity="0.7"/><circle cx="0.706" cy="1.182" r="0.015" fill="#a7aaaf" opacity="0.7"/><circle cx="0.760" cy="1.094" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="0.706" cy="0.893" r="0.010" fill="#6d7176" opacity="0.7"/><circle cx="0.776" cy="1.090" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.436" cy="0.887" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="0.725" cy="1.141" r="0.014" fill="#a7aaaf" opacity="0.7"/><circle cx="0.456" cy="0.818" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="0.556" cy="0.832" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="0.772" cy="0.998" r="0.014" fill="#6d7176" opacity="0.7"/><circle cx="0.748" cy="0.991" r="0.007" fill="#45484d" opacity="0.75"/><circle cx="0.622" cy="1.182" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.721" cy="1.092" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.776" cy="1.108" r="0.018" fill="#a7aaaf" opacity="0.7"/><circle cx="0.506" cy="1.058" r="0.012" fill="#45484d" opacity="0.75"/><circle cx="0.447" cy="0.922" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.414" cy="1.045" r="0.008" fill="#45484d" opacity="0.75"/><circle cx="0.459" cy="1.087" r="0.017" fill="#a7aaaf" opacity="0.7"/><circle cx="0.577" cy="1.113" r="0.012" fill="#a7aaaf" opacity="0.7"/><circle cx="0.665" cy="1.050" r="0.013" fill="#45484d" opacity="0.75"/><circle cx="0.733" cy="1.144" r="0.006" fill="#c4c7cc" opacity="0.75"/><circle cx="0.610" cy="1.166" r="0.014" fill="#a7aaaf" opacity="0.7"/><circle cx="0.651" cy="1.001" r="0.007" fill="#e2e4e8" opacity="0.55"/><circle cx="0.450" cy="1.103" r="0.015" fill="#c4c7cc" opacity="0.75"/><circle cx="0.419" cy="0.954" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.624" cy="1.146" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.613" cy="0.840" r="0.017" fill="#45484d" opacity="0.75"/><circle cx="0.633" cy="1.103" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.457" cy="0.985" r="0.012" fill="#6d7176" opacity="0.7"/><circle cx="0.720" cy="0.981" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.749" cy="1.114" r="0.017" fill="#45484d" opacity="0.75"/><circle cx="0.777" cy="1.144" r="0.010" fill="#c4c7cc" opacity="0.75"/><circle cx="0.646" cy="1.024" r="0.010" fill="#c4c7cc" opacity="0.75"/><rect x="0.804" y="0.804" width=".392" height=".392" fill="#8a8d92"/><circle cx="1.043" cy="0.860" r="0.013" fill="#a7aaaf" opacity="0.7"/><circle cx="1.108" cy="1.122" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="1.041" cy="0.844" r="0.010" fill="#e2e4e8" opacity="0.55"/><circle cx="0.964" cy="0.968" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="0.899" cy="1.170" r="0.006" fill="#45484d" opacity="0.75"/><circle cx="0.981" cy="1.068" r="0.016" fill="#a7aaaf" opacity="0.7"/><circle cx="1.164" cy="0.937" r="0.011" fill="#45484d" opacity="0.75"/><circle cx="1.178" cy="1.162" r="0.007" fill="#c4c7cc" opacity="0.75"/><circle cx="1.116" cy="0.819" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="1.141" cy="1.017" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="1.066" cy="0.973" r="0.011" fill="#c4c7cc" opacity="0.75"/><circle cx="0.944" cy="1.098" r="0.019" fill="#e2e4e8" opacity="0.55"/><circle cx="1.145" cy="1.083" r="0.006" fill="#e2e4e8" opacity="0.55"/><circle cx="0.816" cy="0.853" r="0.010" fill="#45484d" opacity="0.75"/><circle cx="1.093" cy="1.030" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="1.053" cy="1.010" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="1.053" cy="1.054" r="0.019" fill="#6d7176" opacity="0.7"/><circle cx="1.060" cy="0.864" r="0.005" fill="#c4c7cc" opacity="0.75"/><circle cx="1.113" cy="1.049" r="0.004" fill="#45484d" opacity="0.75"/><circle cx="0.900" cy="1.074" r="0.007" fill="#a7aaaf" opacity="0.7"/><circle cx="1.098" cy="0.852" r="0.004" fill="#a7aaaf" opacity="0.7"/><circle cx="0.825" cy="1.073" r="0.016" fill="#a7aaaf" opacity="0.7"/><circle cx="0.983" cy="1.163" r="0.009" fill="#6d7176" opacity="0.7"/><circle cx="1.079" cy="0.867" r="0.004" fill="#c4c7cc" opacity="0.75"/><circle cx="0.816" cy="0.959" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="1.178" cy="0.821" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.880" cy="1.161" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.960" cy="0.955" r="0.012" fill="#c4c7cc" opacity="0.75"/><circle cx="0.984" cy="1.050" r="0.014" fill="#c4c7cc" opacity="0.75"/><circle cx="1.126" cy="0.856" r="0.012" fill="#6d7176" opacity="0.7"/><circle cx="1.132" cy="0.938" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="1.025" cy="0.972" r="0.005" fill="#e2e4e8" opacity="0.55"/><circle cx="0.940" cy="0.954" r="0.010" fill="#6d7176" opacity="0.7"/><circle cx="0.831" cy="1.157" r="0.019" fill="#e2e4e8" opacity="0.55"/><circle cx="1.179" cy="0.839" r="0.020" fill="#45484d" opacity="0.75"/><circle cx="0.950" cy="0.956" r="0.008" fill="#45484d" opacity="0.75"/><circle cx="1.058" cy="1.112" r="0.004" fill="#e2e4e8" opacity="0.55"/><circle cx="0.942" cy="0.901" r="0.016" fill="#6d7176" opacity="0.7"/><circle cx="1.029" cy="1.110" r="0.004" fill="#6d7176" opacity="0.7"/><circle cx="0.938" cy="1.053" r="0.019" fill="#a7aaaf" opacity="0.7"/><circle cx="0.942" cy="1.032" r="0.008" fill="#e2e4e8" opacity="0.55"/><circle cx="1.052" cy="0.916" r="0.016" fill="#45484d" opacity="0.75"/><circle cx="1.096" cy="0.855" r="0.007" fill="#45484d" opacity="0.75"/><circle cx="1.054" cy="1.108" r="0.008" fill="#a7aaaf" opacity="0.7"/><circle cx="0.895" cy="1.001" r="0.011" fill="#e2e4e8" opacity="0.55"/><circle cx="1.031" cy="1.144" r="0.004" fill="#45484d" opacity="0.75"/></pattern>
<pattern id="${u}a_lawn" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#1e2c1c"/><path d="M.12 .2l.03-.07M.46 .62l.02-.08M.8 .3l.03-.07M1.3 .5l.02-.08M1.7 1.1l.03-.07M.3 1.4l.02-.08M1.1 1.7l.03-.07M.7 1.05l.02-.08M1.55 .15l.03-.07M1.9 1.6l.02-.08M.15 .95l.03-.07M1.35 1.25l.02-.08" stroke="#2e432b" stroke-width=".015" stroke-linecap="round"/></pattern>
<pattern id="${u}a_garden" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#28211a"/><circle cx=".5" cy=".12" r=".012" fill="#352c23"/><circle cx=".1" cy=".5" r=".01" fill="#352c23"/><circle cx=".45" cy=".45" r=".012" fill="#1f1914"/><circle cx=".25" cy=".25" r=".14" fill="#2a4527"/><circle cx=".25" cy=".25" r=".06" fill="#365b31"/><circle cx=".72" cy=".68" r=".17" fill="#284224"/><circle cx=".72" cy=".68" r=".07" fill="#3a6034"/><circle cx=".8" cy=".18" r=".08" fill="#2f4c2b"/><circle cx=".2" cy=".78" r=".1" fill="#2f4c2b"/><circle cx=".2" cy=".78" r=".03" fill="#5b4a6e"/><circle cx=".8" cy=".18" r=".025" fill="#7a6a3a"/></pattern>
<pattern id="${u}a_hedge" width=".6" height=".6" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#1d361a"/><circle cx=".15" cy=".15" r=".14" fill="#25451f"/><circle cx=".45" cy=".3" r=".14" fill="#2a4d23"/><circle cx=".2" cy=".46" r=".13" fill="#22401d"/><circle cx=".46" cy=".08" r=".07" fill="#2e5227"/><circle cx=".12" cy=".14" r=".05" fill="#2f5428"/><circle cx=".42" cy=".27" r=".05" fill="#335a2b"/></pattern>
<pattern id="${u}a_deck" width="1.2" height=".7" patternUnits="userSpaceOnUse"><rect width="1.2" height=".7" fill="#3b3026"/><rect y=".14" width="1.2" height=".14" fill="#3f3329"/><rect y=".42" width="1.2" height=".14" fill="#372c23"/><path d="M0 .139H1.2M0 .279H1.2M0 .419H1.2M0 .559H1.2M0 .699H1.2" stroke="#251d16" stroke-width=".014"/><path d="M.4 0V.14M1 .14V.28M.2 .28V.42M.7 .42V.56M1.1 .56V.7" stroke="#251d16" stroke-width=".01"/></pattern>
<pattern id="${u}a_slabs" width=".6" height=".6" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#2a2c2f"/><rect x=".008" y=".008" width=".584" height=".584" fill="#434549"/><circle cx=".2" cy=".3" r=".15" fill="#4a4c50" opacity=".5"/><circle cx=".45" cy=".45" r=".1" fill="#3e4044" opacity=".5"/></pattern>
<pattern id="${u}a_paving" width=".4" height=".2" patternUnits="userSpaceOnUse"><rect width=".4" height=".2" fill="#2a2623"/><rect x=".006" y=".006" width=".188" height=".088" fill="#423b35"/><rect x=".206" y=".006" width=".188" height=".088" fill="#3d3631"/><rect x="-.094" y=".106" width=".188" height=".088" fill="#3f3833"/><rect x=".106" y=".106" width=".188" height=".088" fill="#443d37"/><rect x=".306" y=".106" width=".188" height=".088" fill="#3f3833"/></pattern>
<pattern id="${u}a_gravel" width=".3" height=".3" patternUnits="userSpaceOnUse"><rect width=".3" height=".3" fill="#393731"/><circle cx=".03" cy=".05" r=".016" fill="#4a4740"/><circle cx=".12" cy=".03" r=".012" fill="#2b2a26"/><circle cx=".22" cy=".08" r=".018" fill="#44413b"/><circle cx=".07" cy=".16" r=".013" fill="#504d45"/><circle cx=".17" cy=".19" r=".016" fill="#2e2d29"/><circle cx=".27" cy=".2" r=".012" fill="#4a4740"/><circle cx=".05" cy=".26" r=".014" fill="#2e2d29"/><circle cx=".15" cy=".27" r=".011" fill="#4d4a43"/><circle cx=".25" cy=".28" r=".01" fill="#3f3d37"/><circle cx=".11" cy=".1" r=".008" fill="#575349"/></pattern>
<pattern id="${u}a_water" width="1.5" height=".5" patternUnits="userSpaceOnUse"><rect width="1.5" height=".5" fill="#15303f"/><path d="M0 .14q.1875 -.06 .375 0t.375 0t.375 0t.375 0M-.19 .38q.1875 -.06 .375 0t.375 0t.375 0t.375 0t.375 0" fill="none" stroke="#22485d" stroke-width=".018"/></pattern>
<pattern id="${u}a_asphalt" width=".5" height=".5" patternUnits="userSpaceOnUse"><rect width=".5" height=".5" fill="#222326"/><circle cx=".1" cy=".12" r=".008" fill="#2c2d31"/><circle cx=".33" cy=".07" r=".006" fill="#1a1b1d"/><circle cx=".41" cy=".3" r=".008" fill="#2c2d31"/><circle cx=".2" cy=".38" r=".006" fill="#1a1b1d"/><circle cx=".06" cy=".44" r=".007" fill="#2c2d31"/><circle cx=".27" cy=".22" r=".005" fill="#2f3034"/></pattern>
<pattern id="${u}screed" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="#3a3c40"/><circle cx=".5" cy=".6" r=".7" fill="#3d3f43" opacity=".35"/><circle cx="1.8" cy="1.5" r=".9" fill="#37393d" opacity=".35"/><circle cx="1.6" cy=".3" r=".5" fill="#3d3f43" opacity=".3"/><circle cx=".6" cy="1.9" r=".6" fill="#38393d" opacity=".3"/><circle cx="2.3" cy="2.3" r=".4" fill="#3d3f43" opacity=".3"/><circle cx=".9" cy="1.1" r=".012" fill="#2f3135"/><circle cx="1.4" cy=".9" r=".008" fill="#2f3135"/><circle cx="2" cy=".7" r=".01" fill="#2f3135"/><circle cx=".3" cy="1.4" r=".009" fill="#2f3135"/><circle cx="1.7" cy="2.1" r=".011" fill="#2f3135"/></pattern>
</defs>`;

function floorBBox(plan, fl) {
  const pts = [];
  fl.rooms.forEach(r => pts.push(...r.points));
  (fl.areas || []).forEach(a => pts.push(...a.points));
  fl.walls.forEach(w => pts.push(w.a, w.b));
  fl.furniture.forEach(m => pts.push([m.x - m.w / 2, m.y - m.h / 2], [m.x + m.w / 2, m.y + m.h / 2]));
  fl.devices.forEach(d => d.x != null && pts.push([num(d.x), num(d.y)]));
  if (!pts.length) return [0, 0, 10, 8];
  const m = plan.wall.outer + .35;
  return [Math.min(...pts.map(p => p[0])) - m, Math.min(...pts.map(p => p[1])) - m, Math.max(...pts.map(p => p[0])) + m, Math.max(...pts.map(p => p[1])) + m];
}

function furnSvg(m, k, edit) {
  const inner = m.model !== undefined ? (m.top ? `<image href="${esc(m.top)}" width="${m.w}" height="${m.h}" preserveAspectRatio="none"/>` : `<rect width="${m.w}" height="${m.h}" rx=".04" fill="#3a3f48" fill-opacity=".55" stroke="#9cc4ff" stroke-width=".02" stroke-dasharray=".08 .05"/><g transform="translate(${m.w / 2 - .18} ${m.h / 2 - .18}) scale(.015)"><path d="M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.7 8 12 11.7 5.3 8zM5 9.7l6 3.3v6.6l-6-3.3zm8 9.9V13l6-3.3v6.6z" fill="#9cc4ff"/></g>`)
    : m.src ? `<image href="${esc(m.src)}" width="${m.w}" height="${m.h}" preserveAspectRatio="none"/>`
    : `<svg width="${m.w}" height="${m.h}" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">${(FURN[m.symbol] || FURN.tisch)[3]}</svg>`;
  return `<g ${edit ? `data-k="furn:${k}"` : ''} transform="translate(${m.x} ${m.y}) rotate(${m.rotate || 0}) translate(${-m.w / 2} ${-m.h / 2})" opacity="${m.opacity ?? 1}">${inner}${edit ? `<rect width="${m.w}" height="${m.h}" fill="transparent"/>` : ''}</g>`;
}

function openingSvg(op, st, walls, k, edit, sty = {}) {
  const [col] = ocol(op, st), Ln = op.length, hl = Ln / 2, [y0, y1] = openingBand(op, walls), yc = (y0 + y1) / 2, sw = .045;
  if (op.type === 'passage') {
    // Durchgang: Wand ausgespart, Laibungen an beiden Seiten, Schwelle angedeutet
    const jc = op.frame_color || '#6c717b';
    let g = `<rect x="${-hl}" y="${y0}" width="${Ln}" height="${y1 - y0}" fill="#2a2c30"/>`;
    g += `<line x1="${-hl}" y1="${y0}" x2="${-hl}" y2="${y1}" stroke="${jc}" stroke-width=".04"/><line x1="${hl}" y1="${y0}" x2="${hl}" y2="${y1}" stroke="${jc}" stroke-width=".04"/>`;
    g += `<line x1="${-hl}" y1="${y0}" x2="${hl}" y2="${y0}" stroke="${jc}" stroke-opacity=".5" stroke-width=".012" stroke-dasharray=".05 .04"/><line x1="${-hl}" y1="${y1}" x2="${hl}" y2="${y1}" stroke="${jc}" stroke-opacity=".5" stroke-width=".012" stroke-dasharray=".05 .04"/>`;
    return `<g ${edit ? `data-k="op:${k}"` : ''} transform="translate(${op.x} ${op.y}) rotate(${op.rotate || 0})">${g}${edit ? `<rect x="${-hl}" y="${Math.min(y0, -.2)}" width="${Ln}" height="${Math.max(y1, .2) - Math.min(y0, -.2)}" fill="transparent"/>` : ''}</g>`;
  }
  const under = (x1, yy1, x2, yy2) => `<line x1="${x1}" y1="${yy1}" x2="${x2}" y2="${yy2}" stroke="${col}" stroke-opacity=".28" stroke-width=".16" stroke-linecap="round"/><line x1="${x1}" y1="${yy1}" x2="${x2}" y2="${yy2}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
  let g = `<rect x="${-hl}" y="${y0}" width="${Ln}" height="${y1 - y0}" fill="#121418"/>`;
  const wedge = `<path d="M${-hl} ${y1} L0 ${y1 + Ln * .22} L${hl} ${y1}" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-width=".02"/>`;
  if (op.type !== 'door') {
    g += `<line x1="${-hl}" y1="${y0}" x2="${hl}" y2="${y0}" stroke="#8fc9ff" stroke-opacity=".3" stroke-width=".02"/><line x1="${-hl}" y1="${y1}" x2="${hl}" y2="${y1}" stroke="#8fc9ff" stroke-opacity=".3" stroke-width=".02"/>`;
    if (st === 'open') { const a = 55 * Math.PI / 180, ex = hl * Math.cos(a), ey = hl * Math.sin(a); g += under(-hl, y1, -hl + ex, y1 + ey) + under(hl, y1, hl - ex, y1 + ey); }
    else g += under(-hl, yc, hl, yc);
    if (st === 'tilt') g += wedge;
  } else {
    // Tür ohne Öffnungsbogen: Blatt liegt geschlossen in der Wand, nicht geschlossen nur ein Stück auf (heller Spalt)
    const a = (st === 'open' || st === 'tilt' ? 24 : 0) * Math.PI / 180, ex = -hl + Ln * Math.cos(a), ey = y1 + Ln * Math.sin(a);
    if (a) g += `<path d="M${-hl} ${y1}L${hl} ${y1}L${ex} ${ey}Z" fill="${col}" fill-opacity=".22"/>`;
    g += under(-hl, y1, ex, ey);
    if (st === 'tilt') g += wedge;
  }
  const sx = op.hinge === 'right' ? -1 : 1;
  return `<g ${edit ? `data-k="op:${k}"` : ''} transform="translate(${op.x} ${op.y}) rotate(${op.rotate || 0}) scale(${sx} 1)">${g}${edit ? `<rect x="${-hl}" y="${Math.min(y0, -.2)}" width="${Ln}" height="${Math.max(y1, .2) - Math.min(y0, -.2) + (op.type === 'door' ? Ln * .6 : .1)}" fill="transparent"/>` : ''}</g>`;
}

// Inhalt einer Etage als SVG (ohne äußeres <svg>)
// „Du bist hier“: Wand-Tablet, auf dessen Dashboard (URL) bzw. Browser-Mod-Gerät diese Karte gerade läuft
const normUrl = u => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
const bmId = () => { try { return localStorage.getItem('browser_mod-browser-id') || ''; } catch (e) { return ''; } };
function hereMatch(d, cfg = {}) {
  if (!d || d.type !== 'tablet') return false;
  const h = cfg.hier ?? cfg.here;
  if (h === false) return false;
  if (typeof h === 'string' && h) return [d.name, d.dashboard, d.browser].some(v => v && normUrl(v) === normUrl(h));
  if (d.browser && d.browser === bmId()) return true;
  const t = normUrl(d.dashboard), p = normUrl(location.pathname);
  if (!t || !t.startsWith('/')) return false;
  return p === t || (t.split('/').length === 2 && p.startsWith(t + '/'));
}
const hereCol = (plan, cfg = {}) => cfg.hier_farbe || cfg.here_color || (plan.style || {}).here || '#3ddc84';
const herePulse = (cfg = {}) => (cfg.hier_puls ?? cfg.here_pulse) !== false;
// Modus „fenster“ (Flur-Tablet): Fenster/Türen hausweit, Puls bei Alarm scharf / Heizung im Raum, zuschaltbare Ebenen
const LAYERS = { licht: 'Licht', bewegung: 'Bewegung', heizung: 'Heizung', werte: 'Werte', ble: 'Personen' };
const winMode = c => /^(fenster|windows?)$/i.test(String(c.modus ?? c.mode ?? ''));
const armedSt = (c, s) => {
  if (!sOk(s)) return false;
  const z = c.alarm_zustaende ?? c.alarm_states, v = String(s.state).toLowerCase();
  return Array.isArray(z) ? z.map(x => String(x).toLowerCase()).includes(v) : /^(armed|arming|pending|triggered)/.test(v);
};
const roomAt = (fl, p) => { const r = fl.rooms.find(r => r.points.length >= 3 && pip(p, r.points)); return r ? (r.part_of && fl.rooms.find(q => q.id === r.part_of)) || r : null; };
// Räume beiderseits einer Öffnung (Innen = +Normale, wie in der Legende)
const opRooms = (fl, o) => { const a = num(o.rotate) * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a); return [.3, -.3].map(k => roomAt(fl, [o.x + nx * k, o.y + ny * k])).filter((r, i, A) => r && A.indexOf(r) === i); };
const sinceTxt = iso => {
  const t = new Date(iso); if (isNaN(t)) return '';
  const now = new Date(), m = Math.max(0, Math.round((now - t) / 60000)), hm = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const at = t.toDateString() === now.toDateString() ? hm : `${t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`;
  const dur = m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} min` : m < 1440 ? `vor ${Math.floor(m / 60)} h ${m % 60} min` : `vor ${Math.floor(m / 1440)} T ${Math.floor(m % 1440 / 60)} h`;
  return `${at} · ${dur}`;
};
// ---------- Gebäude (Mehrfamilienhaus): andere Wohnungen, Treppenhaus, Nachbarhaus – gedämpft um die eigene Wohnung
// building: { floor, own, storeys:[{name,short,h,roof}], knee, parts:[{id,name,kind own|unit|stair|hall|neighbor,points,storeys:[von,bis],color}], roofs:[{rect,ridge x|y,pitch,type}] }
const bldOf = (plan, cfg) => { const b = (plan && plan.building) || (cfg && cfg.building); return b && b.on !== false && Array.isArray(b.parts) && Array.isArray(b.storeys) && b.storeys.length ? b : null; };
const bldNorm = v => { const t = String(v ?? '').toLowerCase(); return /^(w|apart|aus|off|false|nein)/.test(t) ? 'wohnung' : /^(e|floor|stock)/.test(t) ? 'etage' : /^(h|haus|house|ganz|all|true|an|on)/.test(t) ? 'haus' : ''; };
const bldShowNorm = v => { const t = String(v ?? '').toLowerCase(); return /^(aus|off|false|nein|hide|keine)/.test(t) ? 'aus' : /^(glas|glass|rahmen|frame)/.test(t) ? 'glas' : /^(an|on|true|ja|zeigen|show|voll|solid)/.test(t) ? 'an' : ''; };
const BLDK = { unit: ['#2b2e34', '#454a53', 'Wohnung'], own: ['#2b2e34', '#454a53', 'Wohnung'], stair: ['#383a3f', '#50545b', 'Treppenhaus'], hall: ['#35373b', '#4b4e55', 'Flur'], neighbor: ['#212327', '#3a3d43', 'Nachbarhaus'] };
function bldSvg(b, st, bb, u, op = {}) {
  let s = `<defs><pattern id="${u}bh" width=".45" height=".45" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.45" stroke="#fff" stroke-opacity=".045" stroke-width=".07"/></pattern></defs>`, t = '';
  const own = num(b.own, 0);
  b.parts.forEach(p => {
    const P = p.points; if (!Array.isArray(P) || P.length < 3) return;
    const r = p.storeys || [0, b.storeys.length - 1]; if (st < num(r[0]) || st > num(r[1] ?? r[0])) return;
    if (p.kind === 'own' && st === own) return;
    const sel = p.kind === 'neighbor' ? op.nb || 'an' : op.un || 'an'; if (sel === 'aus') return;
    const gl = sel === 'glas', k = BLDK[p.kind] || BLDK.unit, d = `M${P.map(q => q.join(' ')).join('L')}Z`;
    if (gl) s += `<path d="${d}" fill="#9cc4ff" fill-opacity=".035" stroke="#9cc4ff" stroke-opacity=".5" stroke-width=".06" stroke-dasharray=".3 .16" pointer-events="none"/>`;
    else {
      s += `<path d="${d}" fill="${p.color2d || k[0]}" stroke="${k[1]}" stroke-width=".24" stroke-linejoin="miter" pointer-events="none"/>`;
      if (p.kind !== 'stair' && p.kind !== 'hall') s += `<path d="${d}" fill="url(#${u}bh)" pointer-events="none"/>`;
    }
    const xs = P.map(q => q[0]), ys = P.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (p.kind === 'stair' && !gl) {   // Stufen quer zur langen Seite, mittig
      const lx = x1 - x0 >= y1 - y0, L0 = lx ? x0 : y0, L1 = lx ? x1 : y1, Q0 = lx ? y0 : x0, Q1 = lx ? y1 : x1, a = L0 + (L1 - L0) * .22, e = L1 - (L1 - L0) * .22;
      let ln = ''; for (let v = a; v <= e; v += .28) ln += lx ? `M${v.toFixed(2)} ${(Q0 + .15).toFixed(2)}V${(Q1 - .15).toFixed(2)}` : `M${(Q0 + .15).toFixed(2)} ${v.toFixed(2)}H${(Q1 - .15).toFixed(2)}`;
      s += `<path d="${ln}" stroke="#5d6169" stroke-width=".03" fill="none" pointer-events="none"/>`;
      s += lx ? `<path d="M${a.toFixed(2)} ${((Q0 + Q1) / 2).toFixed(2)}H${e.toFixed(2)}" stroke="#6d717a" stroke-width=".04" fill="none" pointer-events="none"/>` : `<path d="M${((Q0 + Q1) / 2).toFixed(2)} ${a.toFixed(2)}V${e.toFixed(2)}" stroke="#6d717a" stroke-width=".04" fill="none" pointer-events="none"/>`;
    }
    // Beschriftung: Mitte des sichtbaren Teils
    const vx0 = Math.max(x0, bb[0]), vx1 = Math.min(x1, bb[2]), vy0 = Math.max(y0, bb[1]), vy1 = Math.min(y1, bb[3]);
    if (p.label === false || vx1 - vx0 < 1.2 || vy1 - vy0 < .7) return;
    const nm = p.kind === 'own' ? (p.name_other || 'Wohnung') : (p.name || k[2]), cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2, rot = vy1 - vy0 > (vx1 - vx0) * 1.6 ? ' transform="rotate(-90 ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')"' : '';
    const fs = clamp(Math.min(vx1 - vx0, vy1 - vy0) * .22, .22, .42);
    t += `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}"${rot} text-anchor="middle" dominant-baseline="middle" font-family="Rajdhani,sans-serif" font-weight="500" font-size="${fs.toFixed(2)}" letter-spacing=".04" fill="${gl ? '#9cc4ff' : '#8a8f99'}" fill-opacity="${gl ? .6 : .85}" pointer-events="none">${esc(String(nm).toUpperCase())}</text>`;
  });
  return s + t;
}
function floorSvg(plan, fl, hass, u, edit, cfg = null, bx = null) {
  const states = (hass && hass.states) || {}, walls = floorWalls(fl, plan.wall), bb = floorBBox(plan, fl), fx = cfg && cfg._fx;
  const real = isReal(plan, cfg);
  let s = real ? realDefs(DEFS(u), u, fl) : DEFS(u), clips = '', glows = '';
  if (real) s += `<defs><filter id="${u}ao" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".11"/></filter>
<filter id="${u}wsh" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx=".05" dy=".09" stdDeviation=".07" flood-color="#000" flood-opacity=".7"/></filter>
<filter id="${u}fsh" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx=".04" dy=".07" stdDeviation=".05" flood-color="#000" flood-opacity=".6"/></filter>
<linearGradient id="${u}sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>`;
  const roomOf = p => fl.rooms.findIndex(r => r.points.length >= 3 && pip(p, r.points));
  fl.rooms.forEach((r, i) => { if (r.points.length >= 3) clips += `<clipPath id="${u}c${i}">${fl.rooms.filter(x => x.points.length >= 3 && roomGrp(x) === roomGrp(r)).map(x => `<path d="M${x.points.map(p => p.join(' ')).join('L')}Z"/>`).join('')}</clipPath>`; });
  s += `<defs>${clips}</defs>`;
  // Außenflächen (Rasen, Beete, Terrasse, Wege …) – unter den Räumen, ohne Wände
  (fl.areas || []).forEach((a, i) => {
    if (!areaOk(a)) return;
    const d = `M${a.points.map(p => p.join(' ')).join('L')}${a.line ? '' : 'Z'}`, f = areaFill(a, u), op = a.opacity != null && a.opacity !== '' ? ` opacity="${num(a.opacity, 1)}"` : '', dk = edit ? `data-k="area:${i}"` : '';
    if (a.line) { const w = areaW(a), cap = a.cap === 'butt' ? 'butt' : 'round'; s += `<g${op}><path d="${d}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="${(w + .05).toFixed(3)}" stroke-linejoin="round" stroke-linecap="${cap}" pointer-events="none"/><path ${dk} d="${d}" fill="none" stroke="${f}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="${cap}"/></g>`; }
    else s += `<path ${dk} d="${d}" fill="${f}" stroke="#000" stroke-opacity=".25" stroke-width=".02"${op}/>`;
  });
  // Gebäude: Nachbarwohnungen, Treppenhaus, Nachbarhaus (unter den eigenen Räumen)
  if (bx && bx.b && (!bx.b.floor || bx.b.floor === fl.id)) s += bldSvg(bx.b, bx.st, bb, u, bx);
  // Böden
  fl.rooms.forEach((r, i) => {
    if (r.points.length < 3) return;
    s += `<path ${edit ? `data-k="room:${i}"` : ''} d="M${r.points.map(p => p.join(' ')).join('L')}Z" fill="url(#${u}${FLOORTYPES[r.floor] ? r.floor : 'wood'})"/>`;
  });
  // Realistisch: weiche Schatten an den Wandkanten (Umgebungsverdeckung) + leichter Lichtverlauf über den Boden
  if (real) fl.rooms.forEach((r, i) => {
    if (r.points.length < 3 || r.floor === 'outdoor') return;
    let d = ''; r.points.forEach((a, j) => { if (edgeKind(fl, r, j) === 'none') return; const b = r.points[(j + 1) % r.points.length]; d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`; });
    const P = `M${r.points.map(p => p.join(' ')).join('L')}Z`;
    s += `<path d="${P}" fill="url(#${u}sky)" pointer-events="none"/>`;
    if (d) s += `<g clip-path="url(#${u}c${i})" pointer-events="none"><path d="${d}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width=".42" stroke-linecap="square" filter="url(#${u}ao)"/></g>`;
  });
  // Modus fenster, Ebene Licht: Räume mit eingeschaltetem Licht warm tönen
  if (fx) fl.rooms.forEach(r => { if (r.points.length >= 3 && fx.light.has(roomGrp(r))) s += `<path d="M${r.points.map(p => p.join(' ')).join('L')}Z" fill="#ffd166" fill-opacity=".16" pointer-events="none"/>`; });
  // Lichtkegel der eingeschalteten Leuchten (auf den Raum begrenzt); realistisch + Nacht: erst nach dem Abdunkeln gezeichnet
  const dl = real && !fx && cfg ? dayLight(states, cfg) : null, dark = dl ? clamp(.62 * (1 - dl.df), 0, .62) : 0, night = dark > .03, deep = dark > .25;
  const litRoom = new Map();   // Raumgruppe → hellste Leuchte (für den Lichtschein durch offene Türen)
  const s0 = s; s = '';
  fl.devices.forEach((d, i) => {
    if (d.type !== 'light' || d.glow === false || (fx && !fx.lay.licht)) return;
    emitters(d).forEach(em => {
      const st = states[em.ent]; if (!isOn(st)) return;
      const col = d.glow_color || lightCol(st), bri = (st.attributes || {}).brightness, k = bri == null ? .8 : clamp(bri / 255, .15, 1), sh = beamShape(em);
      const ri = roomOf([em.x, em.y]), gid = `${u}g${i}_${em.k + 1}`;
      if (ri >= 0) { const gk = roomGrp(fl.rooms[ri]), o = litRoom.get(gk); if (!o) litRoom.set(gk, { col, k, sum: k }); else { o.sum += k; if (o.k < k) { o.k = k; o.col = col; } } }
      glows += `<radialGradient id="${gid}" ${sh.t === 'e' ? '' : `gradientUnits="userSpaceOnUse" cx="${em.x}" cy="${em.y}" r="${em.R}"`}><stop offset="0" stop-color="${col}" stop-opacity="${(.18 + .42 * k).toFixed(2)}"/><stop offset=".55" stop-color="${col}" stop-opacity="${(.06 + .14 * k).toFixed(2)}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
      const shp = sh.t === 'c' ? `<circle cx="${em.x}" cy="${em.y}" r="${em.R}"` : sh.t === 'e' ? `<ellipse cx="${sh.cx.toFixed(3)}" cy="${sh.cy.toFixed(3)}" rx="${sh.a.toFixed(3)}" ry="${sh.b.toFixed(3)}" transform="rotate(${sh.rot} ${sh.cx.toFixed(3)} ${sh.cy.toFixed(3)})"` : `<path d="${beamPath(em)}"`;
      s += `${shp} fill="url(#${gid})" ${ri >= 0 ? `clip-path="url(#${u}c${ri})"` : ''} style="mix-blend-mode:${deep ? 'plus-lighter' : 'screen'}" pointer-events="none"/>`;
      if (deep) s += `${shp} fill="url(#${gid})" ${ri >= 0 ? `clip-path="url(#${u}c${ri})"` : ''} style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    });
  });
  const lightSvg = s + `<defs>${glows}</defs>`; s = s0;
  if (!night) s += lightSvg;
  // Fußbodenheizung (Heizschleifen im Raum des Thermostats)
  fl.devices.forEach((d, i) => {
    if (d.type !== 'climate' || d.heater !== 'floor') return;
    const ri = roomOf([num(d.x), num(d.y)]); if (ri < 0) return;
    const r = fl.rooms[ri], heat = heatingOn(states[d.entity]), xs = r.points.map(q => q[0]), ys = r.points.map(q => q[1]);
    const c = centroid(r.points), R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + .2, st = num(d.loop_spacing, .15);
    let path = '', dir = 1;
    for (let y = c[1] - R, n = 0; y <= c[1] + R && n < 400; y += st, n++) { const xa = dir > 0 ? c[0] - R : c[0] + R, xb = dir > 0 ? c[0] + R : c[0] - R; path += (path ? `L${xa.toFixed(2)} ${y.toFixed(2)}` : `M${xa.toFixed(2)} ${y.toFixed(2)}`) + `L${xb.toFixed(2)} ${y.toFixed(2)}`; dir = -dir; }
    s += `<g clip-path="url(#${u}c${ri})" pointer-events="none"><g transform="rotate(${num(d.heater_rotate)} ${c[0]} ${c[1]})"><path d="${path}" fill="none" stroke="${heat ? '#ff8a3d' : '#a3a9b3'}" stroke-opacity="${heat ? .45 : .3}" stroke-width=".025" stroke-linejoin="round"/></g></g>`;
  });
  // Möbel
  if (real && fl.furniture.length) s += `<g filter="url(#${u}fsh)">`;
  fl.furniture.forEach((m, k) => { s += furnSvg(m, k, edit); });
  if (real && fl.furniture.length) s += '</g>';
  // Seilsysteme: Linienzüge + Spots (Richtung als Strich, Farbe je eigenem Zustand)
  fl.devices.forEach((d, i) => {
    if (d.type !== 'light' || d.lamp !== 'rope') return;
    const cl = d.ropes_closed || [];
    ropeLines(d).forEach((L, li) => { if (L.length > 1) s += `<path d="M${L.map(q => q.join(' ')).join('L')}${cl[li] ? 'Z' : ''}" fill="none" stroke="#9aa0aa" stroke-opacity=".8" stroke-width=".016" stroke-linejoin="round" pointer-events="none"/>`; });
    emitters(d).forEach(em => {
      const q = d.spots[em.k], st = states[em.ent], on = isOn(st), col = on ? (d.glow_color || lightCol(st)) : '#8a8f98', an = em.dir * Math.PI / 180, ln = .06 + .12 * Math.min(1, em.tilt / 90);
      const sn = ropeSnap(d, [em.x, em.y]);
      if (Math.hypot(sn[0] - em.x, sn[1] - em.y) > .02) s += `<line x1="${sn[0]}" y1="${sn[1]}" x2="${em.x}" y2="${em.y}" stroke="#9aa0aa" stroke-opacity=".5" stroke-width=".008" pointer-events="none"/>`;
      s += `<g ${edit ? `data-k="spot:${i}:${em.k}"` : ''} transform="translate(${em.x} ${em.y})">${em.tilt > 5 ? `<line x1="0" y1="0" x2="${(Math.sin(an) * ln).toFixed(3)}" y2="${(-Math.cos(an) * ln).toFixed(3)}" stroke="${col}" stroke-width=".035" stroke-linecap="round"/>` : ''}<circle r=".065" fill="${on ? col : '#1b1d20'}" fill-opacity="${on ? .35 : 1}" stroke="${col}" stroke-width=".025"/>${q && q.entity ? '<circle r=".025" fill="#e3e5e9"/>' : ''}${edit ? '<circle r=".14" fill="transparent"/>' : ''}</g>`;
    });
  });
  // Wand-Tablets (Bildschirm zeigt zur Raumseite)
  fl.devices.forEach((d, i) => {
    if (d.type !== 'tablet') return;
    if (fx && cfg.tablets !== true && !hereMatch(d, cfg)) return;
    const here = cfg && hereMatch(d, cfg), tc = here ? hereCol(plan, cfg) : '#4dc3ff';
    s += `<g ${edit ? `data-k="dev:${i}"` : ''} transform="translate(${num(d.x)} ${num(d.y)}) rotate(${num(d.rotate)})">${here ? `${herePulse(cfg) ? `<circle r=".3" fill="${tc}" fill-opacity=".14" stroke="${tc}" stroke-width=".02"><animate attributeName="r" values=".2;.6;.2" dur="2.4s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".9;0;.9" dur="2.4s" repeatCount="indefinite"/><animate attributeName="fill-opacity" values=".25;0;.25" dur="2.4s" repeatCount="indefinite"/></circle>` : ''}` : ''}
<rect x="-.14" y="-.03" width=".28" height=".065" rx=".012" fill="#1b1d20" stroke="${here ? tc : '#6c717b'}" stroke-width=".012"/><rect x="-.12" y=".012" width=".24" height=".014" fill="${tc}" opacity=".9"/></g>`;
  });
  // Heizkörper (am Thermostat, drehbar)
  fl.devices.forEach((d, i) => {
    if (d.type !== 'climate' || (d.heater || 'radiator') !== 'radiator') return;
    const heat = heatingOn(states[d.entity]), hd0 = heaterDim(d), Ln = hd0.L, hl = Ln / 2, n = Math.max(3, Math.round(Ln / .06)), q = Math.max(.03, hd0.T / 2);
    let fins = '';
    for (let k = 1; k < n; k++) { const x = -hl + Ln * k / n; fins += `M${x.toFixed(3)} ${(-q * .75).toFixed(3)}V${(q * .75).toFixed(3)}`; }
    const sty = plan.style || {}, hc = d.heater_color || sty.heater || '#5a5f69', hh = d.heater_heat_color || sty.heater_heat || '#ff8a3d';
    const body = hc, edge = hc, flame = heat ? flameSvg(u, Math.min(1.3, Math.max(.7, Ln))) : '';
    s += `<g ${edit ? `data-k="dev:${i}"` : ''} transform="translate(${num(d.x)} ${num(d.y)}) rotate(${num(d.heater_rotate)})">` +
      '' +
      `<rect x="${-hl}" y="${-q}" width="${Ln}" height="${2 * q}" rx=".025" fill="#1b1d20"/><rect x="${-hl}" y="${-q}" width="${Ln}" height="${2 * q}" rx=".025" fill="${body}" fill-opacity=".55" stroke="${edge}" stroke-width=".015"/><path d="${fins}" stroke="${edge}" stroke-opacity=".7" stroke-width=".01"/>${flame}</g>`;
  });
  if (night) {
    // Lichtschein durch offene Türen / Durchgänge in den Nachbarraum
    let spill = '', sd = '';
    if (deep) fl.openings.forEach((op, k) => {
      if (op.type === 'window') return;
      const st = op.type === 'passage' ? 'open' : op.entity ? contactState(states, op) : 'na'; if (st !== 'open' && st !== 'tilt') return;
      const rs = opRooms(fl, op); if (rs.length < 2) return;
      rs.forEach((A, ai) => { const L0 = litRoom.get(roomGrp(A)), B = rs[1 - ai]; if (!L0 || litRoom.has(roomGrp(B))) return;
        const bi = fl.rooms.indexOf(B), id = `${u}sp${k}_${ai}`, R0 = (st === 'tilt' ? 1 : 1.9) * (.5 + .5 * L0.k);
        sd += `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${op.x}" cy="${op.y}" r="${R0.toFixed(2)}"><stop offset="0" stop-color="${L0.col}" stop-opacity="${(.5 * L0.k).toFixed(2)}"/><stop offset=".5" stop-color="${L0.col}" stop-opacity="${(.16 * L0.k).toFixed(2)}"/><stop offset="1" stop-color="${L0.col}" stop-opacity="0"/></radialGradient>`;
        spill += `<circle cx="${op.x}" cy="${op.y}" r="${R0.toFixed(2)}" fill="url(#${id})" ${bi >= 0 ? `clip-path="url(#${u}c${bi})"` : ''} style="mix-blend-mode:plus-lighter" pointer-events="none"/>`; });
    });
    // ganzer Raum aufgehellt (Streulicht), je nach Helligkeit/Anzahl der Leuchten und Raumgröße
    let fill = '';
    fl.rooms.forEach(r => { const L0 = r.points.length >= 3 && litRoom.get(roomGrp(r)); if (!L0) return; const ga = fl.rooms.filter(x => x.points.length >= 3 && roomGrp(x) === roomGrp(r)).reduce((a, x) => a + area(x.points), 0) || 10, op = clamp((.12 + .3 * Math.min(1.6, L0.sum) / Math.max(1, Math.sqrt(ga) / 3.2)) * (dark / .62), .05, .45);
      fill += `<path d="M${r.points.map(p => p.join(' ')).join('L')}Z" fill="${L0.col}" fill-opacity="${op.toFixed(3)}" style="mix-blend-mode:${deep ? 'plus-lighter' : 'screen'}" pointer-events="none"/>`; });
    s += `<rect x="${bb[0] - 5}" y="${bb[1] - 5}" width="${bb[2] - bb[0] + 10}" height="${bb[3] - bb[1] + 10}" fill="#02040a" fill-opacity="${dark.toFixed(3)}" pointer-events="none"/>${fill}${lightSvg}<defs>${sd}</defs>${spill}`;
  }
  // Wände mit Aussparungen für Fenster/Türen
  let mask = `<rect x="${bb[0] - 5}" y="${bb[1] - 5}" width="${bb[2] - bb[0] + 10}" height="${bb[3] - bb[1] + 10}" fill="#fff"/>`;
  fl.openings.forEach(op => { const [y0, y1] = openingBand(op, walls), hl = op.length / 2; mask += `<rect transform="translate(${op.x} ${op.y}) rotate(${op.rotate || 0})" x="${-hl}" y="${y0 - .01}" width="${op.length}" height="${y1 - y0 + .02}" fill="#000"/>`; });
  s += `<mask id="${u}m" maskUnits="userSpaceOnUse" x="${bb[0] - 5}" y="${bb[1] - 5}" width="${bb[2] - bb[0] + 10}" height="${bb[3] - bb[1] + 10}">${mask}</mask>${real ? `<g filter="url(#${u}wsh)">` : ''}<g mask="url(#${u}m)">`;
  const wl = (w, col, extra = '') => `<line x1="${r2(w.a[0])}" y1="${r2(w.a[1])}" x2="${r2(w.b[0])}" y2="${r2(w.b[1])}" stroke="${col}" stroke-width="${w.t}" stroke-linecap="square" ${extra}/>`;
  const sty = plan.style || {};
  walls.filter(w => w.kind === 'rail').forEach(w => {
    const c = w.col || sty.rail || '#6c717b', L0 = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), n = Math.max(1, Math.round(L0 / .6));
    const rr = fl.rooms.find(x => x.id === w.rid) || {}, bd = rr.rail_fill === 'boards' || rr.rail_fill === 'boards_v';
    if (bd) s += `<line x1="${r2(w.a[0])}" y1="${r2(w.a[1])}" x2="${r2(w.b[0])}" y2="${r2(w.b[1])}" stroke="${rr.rail_board_color || '#8a6a4a'}" stroke-width="${Math.max(.04, num(rr.rail_board_t, .02) + .05).toFixed(3)}" stroke-linecap="butt"/>`;
    s += `<line x1="${r2(w.a[0])}" y1="${r2(w.a[1])}" x2="${r2(w.b[0])}" y2="${r2(w.b[1])}" stroke="${c}" stroke-width=".05" stroke-linecap="square"/>`;
    for (let k = 0; k <= n; k++) { const x = w.a[0] + (w.b[0] - w.a[0]) * k / n, y = w.a[1] + (w.b[1] - w.a[1]) * k / n; s += `<rect x="${r2(x - .035)}" y="${r2(y - .035)}" width=".07" height=".07" fill="${c}"/>`; }
  });
  walls.filter(w => w.kind === 'int').forEach(w => { s += wl(w, w.col || '#4b505c'); });
  walls.filter(w => w.kind === 'ext').forEach(w => { const c = w.col || '#5b5f67'; s += w.poly ? `<path d="M${w.poly.map(q => r2(q[0]) + ' ' + r2(q[1])).join('L')}Z" fill="${c}" stroke="${c}" stroke-width=".01" stroke-linejoin="miter"/>` : wl(w, c); });
  walls.filter(w => w.kind === 'free').forEach(w => { s += wl(w, '#4b505c'); });
  s += real ? '</g></g>' : '</g>';
  if (edit) fl.walls.forEach((w, k) => { s += `<line data-k="wall:${k}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width="${Math.max(num(w.t, plan.wall.inner), .25)}"/>`; });
  // Fenster & Türen
  fl.openings.forEach((op, k) => {
    // Puls: offen/gekippt bei Alarm scharf (rot) oder Heizung im Raum (orange)
    const pz = fx && fx.pulse.get(k);
    if (pz) { const pc = pz === 'alarm' ? '#ff3b3b' : '#ff8a3d', hl = op.length / 2 + .3; s += `<g transform="translate(${op.x} ${op.y}) rotate(${op.rotate || 0})" pointer-events="none"><rect x="${-hl}" y="-.45" width="${hl * 2}" height=".9" rx=".45" fill="${pc}" stroke="${pc}" stroke-width=".03"><animate attributeName="fill-opacity" values=".75;.1;.75" dur="${pz === 'alarm' ? '.9s' : '1.6s'}" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="1;.2;1" dur="${pz === 'alarm' ? '.9s' : '1.6s'}" repeatCount="indefinite"/></rect></g>`; }
    s += openingSvg(op, op.entity ? contactState(states, op) : 'na', walls, k, edit, plan.style || {});
  });
  return s;
}

// ------------------------------------------------------------------ YAML-Ausgabe
const yKey = k => /^(y|n|yes|no|on|off|true|false|null)$/i.test(k) ? `'${k}'` : k;
const yVal = v => typeof v === 'string' ? (/^[\w./:@ -]+$/.test(v) && !/^(y|n|yes|no|on|off|true|false|null|~|-?\d[\d.]*)$/i.test(v) && !/^[ -]|[ ]$|: /.test(v) ? v : JSON.stringify(v)) : String(v);
const inline = v => Array.isArray(v) ? `[${v.map(inline).join(', ')}]` : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${yKey(k)}: ${inline(x)}`).join(', ')} }` : yVal(v);
const isScalarObj = v => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every(y => typeof y !== 'object')));
function toYaml(v, ind = 0) {
  const pad = ' '.repeat(ind);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(x => typeof x !== 'object' || (Array.isArray(x) && x.every(y => typeof y !== 'object')))) return inline(v);
    return '\n' + v.map(x => isScalarObj(x) && JSON.stringify(x).length < 110 ? `${pad}- ${inline(x)}` : `${pad}- ${toYaml(x, ind + 2).replace(/^\n\s*/, '')}`).join('\n');
  }
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined && x !== '');
    if (!e.length) return '{}';
    return '\n' + e.map(([k, x]) => { const y = toYaml(x, ind + 2); return `${pad}${yKey(k)}:${y.startsWith('\n') ? y : ' ' + y}`; }).join('\n');
  }
  return yVal(v);
}

// ------------------------------------------------------------------ Plan-Quelle (Dashboard mit Master-Karte)
const isMaster = c => c && typeof c === 'object' && (c.type === 'custom:haus-grundriss' || c.type === 'custom:home-twin-card') && c.plan && typeof c.plan === 'object';
const walk = (o, fn) => { if (!o || typeof o !== 'object') return false; if (fn(o)) return true; for (const v of Object.values(o)) if (v && typeof v === 'object' && walk(v, fn)) return true; return false; };
const SRC = {};
// Plan-Quelle: bevorzugt Integration home_twin (MariaDB, Live-Updates), sonst Lovelace-Dashboard (url) wie bis 1.9.
// mode: null (unbekannt) | 'twin' | 'lovelace'
function planSource(hass, url, planId, twin = true) {
  const key = url || '', pid = planId || 'main', sk = (twin ? 'tw:' + pid + '|' : '') + key;
  if (SRC[sk]) return SRC[sk];
  const e = SRC[sk] = { plan: null, subs: new Set(), err: null, mode: null, rev: 0, writable: false, planId: pid };
  try { const c = (twin && localStorage.getItem('home-twin:plan:' + pid)) || localStorage.getItem('haus-grundriss:plan:' + key); if (c) e.plan = normPlan(JSON.parse(c)); } catch (_) { }
  const fire = () => e.subs.forEach(f => f());
  const load = async () => {
    if (e.mode === 'twin') return;
    try {
      const cfg = await hass.callWS({ type: 'lovelace/config', url_path: url || null });
      let found = null; walk(cfg, c => { if (isMaster(c)) { found = c.plan; e.building = c.building || null; return true; } return false; });
      if (!found) throw new Error(`Keine Haus-Grundriss-Karte mit Plan im Dashboard „${url}“`);
      if (e.mode === 'twin') return;
      e.mode = 'lovelace'; e.plan = normPlan(found); e.err = null;
      try { localStorage.setItem('haus-grundriss:plan:' + key, JSON.stringify(found)); } catch (_) { }
    } catch (err) { if (e.mode !== 'twin') e.err = err.message || String(err); }
    fire();
  };
  const fetchB = async () => {
    try {
      const cfg = await hass.callWS({ type: 'lovelace/config', url_path: url || null }); let b = null;
      walk(cfg, c => { if (isMaster(c)) { b = c.building || null; return true; } return false; });
      const ch = JSON.stringify(b) !== JSON.stringify(e.building ?? null); e.building = b;
      try { localStorage.setItem('haus-grundriss:bld:' + key, JSON.stringify(b)); } catch (_) { }
      if (ch) fire();
    } catch (_) { }
  };
  try { const cb = localStorage.getItem('haus-grundriss:bld:' + key); if (cb) e.building = JSON.parse(cb); } catch (_) { }
  const onTwin = s => {
    if (!s || !s.plan) { if (e.mode === 'twin') { e.writable = !!(s && s.writable); fire(); } else load(); return; }
    const changed = e.mode !== 'twin' || s.revision !== e.rev;
    e.mode = 'twin'; e.writable = !!s.writable; e.dbSource = s.source; e.err = null;
    if (!e.bTried) { e.bTried = true; fetchB(); }
    if (changed) {
      e.rev = s.revision; e.plan = normPlan(s.plan);
      try { localStorage.setItem('home-twin:plan:' + pid, JSON.stringify(s.plan)); } catch (_) { }
    }
    fire();
  };
  e.load = load;
  if (twin) hass.connection.subscribeMessage(onTwin, { type: 'home_twin/plan/subscribe', plan_id: pid }).then(u => { e.unsub = u; }, () => load());
  else load();
  try { hass.connection.subscribeEvents(ev => { if (((ev.data || {}).url_path || '') === key) { if (e.mode === 'twin') fetchB(); else load(); } }, 'lovelace_updated'); } catch (_) { }
  return e;
}
const dashFromPath = () => { const p = location.pathname.split('/')[1] || ''; return p === 'lovelace' ? null : p; };

// ------------------------------------------------------------------ CSS
const CSS = `
:host{display:block;position:relative}
*{box-sizing:border-box}
.hp{height:100%;display:flex;flex-direction:column;gap:12px;font-family:Rajdhani,'Segoe UI',sans-serif;color:#c9ccd2;background:#141519;border-radius:16px;padding:14px;-webkit-user-select:none;user-select:none;line-height:1.2;-webkit-tap-highlight-color:transparent}
.hp.bare{background:none;padding:0;border-radius:0}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bar h2{margin:0 8px 0 0;font:700 18px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#e3e5e9}
.sp{flex:1}
.btn{background:linear-gradient(#2a2d33,#1d1f23);border:1px solid #33363d;color:#c9ccd2;border-radius:9px;padding:5px 11px;font:600 14px Rajdhani,sans-serif;cursor:pointer;white-space:nowrap;line-height:1.2}
.btn:hover{border-color:#4a4e57}.btn.on{color:#4dc3ff;border-color:rgba(77,195,255,.45);box-shadow:0 0 8px rgba(77,195,255,.2)}
.btn.warn{color:#ffb347}.btn.dirty{color:#3ddc84;border-color:rgba(61,220,132,.5);box-shadow:0 0 8px rgba(61,220,132,.25)}
.btn:disabled{opacity:.4;cursor:default}
.lcd{background:#0b0c0e;border:1px solid #26292e;border-radius:8px;padding:4px 10px;font:14px 'Share Tech Mono',monospace;box-shadow:inset 0 2px 6px #000}
.main{flex:1;min-height:0;display:flex;gap:14px}
.hp.auto .main{flex:none}
.planbox{flex:1;min-width:0;min-height:0;border-radius:14px;background:#0d0f12;box-shadow:inset 0 3px 10px #000,0 1px 0 rgba(255,255,255,.07);position:relative;display:grid;place-items:center;container-type:size;overflow:hidden}
.hp.auto .planbox{aspect-ratio:var(--ar);width:100%;flex:none}
.hp.bare .planbox{background:none;box-shadow:none;border-radius:0}
/* rund: abgerundete Plan-Ecken · rahmen: schmaler Rand um den Plan · schatten: Schlagschatten, der am Rahmen ansetzt
   --rw Rahmenbreite · --rc Rahmenfarbe · --ss Schattenstärke (Größe) · --sa Deckkraft (= 1 − Transparenz) · --sp Platz für Rahmen + Schatten */
.hp.rnd .planar{border-radius:var(--rad)}
.hp.rnd .planar.zoomed{overflow:hidden}.hp.rnd .zm>svg{clip-path:inset(0 round var(--rad));border-radius:var(--rad)}
.hp.look .planbox{overflow:visible;padding:var(--sp)}
.hp.look .planar{background:#0d0f12;box-shadow:0 0 0 var(--rw) var(--rc)}
.hp.shd .planar{box-shadow:0 0 0 var(--rw) var(--rc),0 calc(8px * var(--ss)) calc(22px * var(--ss)) var(--rw) rgba(0,0,0,var(--sa)),0 calc(2px * var(--ss)) calc(6px * var(--ss)) var(--rw) rgba(0,0,0,calc(var(--sa) * .8))}
.planar{position:relative;width:min(100cqw,100cqh * var(--ar));height:min(100cqh,100cqw / var(--ar));container-type:size}
.zm{position:absolute;inset:0;transform-origin:0 0}
.planbox.d3 .planar{width:100%;height:100%;overflow:hidden;border-radius:inherit}.v3{position:absolute;inset:0;overflow:hidden;border-radius:inherit}.v3 .err{position:absolute;inset:0}
.mk.m3>*{transition:none}
.vfoot{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.35em 1.1em;padding:.45em .9em .5em;margin-top:6px;border-radius:0 0 var(--rad,12px) var(--rad,12px);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));border-top:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:clamp(11px,2.6cqmin,16px) 'Share Tech Mono',monospace;color:#dfe3e9}
.vfoot .tv{display:flex;align-items:center;gap:1em}.vfoot .rv{display:flex;align-items:center;gap:.25em;cursor:pointer;white-space:nowrap}.vfoot .rv svg{width:1.1em;height:1.1em;fill:currentColor;opacity:.85}
.vfoot .rv i{font:500 .75em Rajdhani,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-right:.15em;font-style:normal}
.room.tafel .rv i{writing-mode:vertical-rl;transform:rotate(180deg);font-size:.36em;line-height:.85;margin:0 .15em 0 -.45em;letter-spacing:0;opacity:.8;font-weight:600}
.vfoot .rv.ist{color:#e9ecf1}.vfoot .rv.soll{color:#9fb4cf}.vfoot .rv.soll.heat{color:#ffab5e}.vfoot .rv.h{color:#8fc9ff}.vfoot .rv.m{color:#c08bff}.zbar.z3 button{font-size:15px}.zbar.z3 button.on{color:#4dc3ff;border-color:#4dc3ff}
.v3dl{position:absolute;inset:0;pointer-events:none;z-index:3}.v3dl span{position:absolute;transform:translate(-50%,-100%);font:600 11px/1 'Share Tech Mono',monospace;color:#e8ecf2;background:rgba(13,15,18,.78);border:1px solid rgba(77,195,255,.5);border-radius:6px;padding:3px 5px;white-space:nowrap}.planar.zoomed{overflow:hidden}
.zm>svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden}
.planbox.zmok{touch-action:pan-y}.planbox.zmok.zin{touch-action:none;cursor:grab}.planbox.zin.pan{cursor:grabbing}
.zbar{position:absolute;right:10px;bottom:10px;z-index:8;display:flex;flex-direction:column;gap:6px}
.bldm{position:absolute;right:54px;bottom:10px;z-index:9;display:grid;gap:5px;padding:10px 12px;background:rgba(20,21,25,.94);border:1px solid #33363d;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.5);font:600 13px Rajdhani,sans-serif;color:#c9ccd2}
.bldm b{font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#80858f;margin-top:3px}
.bldm .sg{display:flex;gap:4px}.bldm .sg button{flex:1;background:#1d1f23;border:1px solid #33363d;color:#c9ccd2;border-radius:8px;padding:4px 9px;font:600 13px Rajdhani,sans-serif;cursor:pointer;white-space:nowrap}
.bldm .sg button.on{background:#1f3a55;border-color:#4a90d9;color:#e3eefb}
.zbar button{width:34px;height:34px;border-radius:10px;border:1px solid #33363d;background:rgba(29,31,35,.88);color:#c9ccd2;font:700 20px/1 Rajdhani,sans-serif;cursor:pointer;display:grid;place-items:center;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.zbar button:hover{border-color:#4a4e57;color:#4dc3ff}.zbar .zr{font-size:15px}.planbox:not(.zin) .zbar .zr{display:none}
.mk{position:absolute;inset:0;font-size:calc(var(--zi,1) * clamp(calc(9px * var(--mz,1)),calc(var(--mz,1) * 2.4cqmin),calc(15px * var(--mz,1))));pointer-events:none}
.mk>*{pointer-events:auto}
.dv{position:absolute;transform:translate(-50%,-50%);cursor:pointer;z-index:3}
.ic{width:2.1em;height:2.1em;border-radius:50%;background:#1b1d20;border:2px solid var(--c,#6f737c);display:grid;place-items:center;color:var(--c,#979ca5);box-shadow:0 0 .7em var(--g,transparent);transition:color .3s,border-color .3s,box-shadow .3s}
.ic svg{width:1.25em;height:1.25em;fill:currentColor}
.ic ha-icon{--mdc-icon-size:1.25em;width:1.25em;height:1.25em;display:flex;color:currentColor}
.ic.nor{border-color:transparent}.ic.nobg{background:transparent}
.ic.nor.nobg{filter:drop-shadow(0 1px 2px #000)}
.pill{display:flex;align-items:center;gap:.25em;padding:.18em .55em .18em .35em;border-radius:1em;background:rgba(20,22,26,.88);border:1px solid var(--b,#33363d);font:1em 'Share Tech Mono',monospace;color:var(--c,#c9ccd2);white-space:nowrap;box-shadow:0 0 .6em var(--g,transparent)}
.pill svg{width:1.1em;height:1.1em;fill:currentColor;flex:none}
.pill small{color:#7d828c;font-size:.85em}
.nm{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:.25em;font:600 .82em Rajdhani,sans-serif;color:#aeb2b9;white-space:nowrap;text-shadow:0 1px 3px #000,0 0 6px #000;pointer-events:none}
.pulse .ic{animation:hpp 1.6s infinite}
@keyframes hpp{50%{box-shadow:0 0 1.4em var(--c)}}
.dv.here{z-index:6}.ic.here{animation:hph 2.4s infinite}.ic.here.still{animation:none;box-shadow:0 0 .9em var(--c)}
.ic.nor,.ic.here.nor,.ic.here.still.nor{box-shadow:none;animation:none}


@keyframes hph{50%{box-shadow:0 0 1.3em var(--c)}}
.here-b{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:.45em;padding:.12em .55em;border-radius:.8em;background:var(--c);color:#06120b;font:700 .8em Rajdhani,sans-serif;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;box-shadow:0 0 .8em var(--c);pointer-events:none}
.here-b::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:.3em solid transparent;border-top-color:var(--c)}
.na{opacity:.45}
.room{position:absolute;transform:translate(-50%,-50%);text-align:center;pointer-events:none;z-index:1;display:flex;flex-direction:column;align-items:center;gap:.2em}
.nm.free{top:auto;left:auto;margin:0;transform:translate(-50%,-50%);z-index:3}
.drag{pointer-events:auto!important;cursor:move;border-radius:4px;outline:1px dashed transparent;outline-offset:2px}.drag:hover{outline-color:rgba(77,195,255,.7)}.drag.on{outline:1px dashed #ffb347}
.room b{font:600 calc(1.05em * var(--rz,1)) Rajdhani,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#80858f;text-shadow:0 1px 4px #000;white-space:nowrap}
.room .pill{font-size:.95em}
.room.tafel{gap:0;perspective:14em;z-index:5}
.room.tafel .tf{display:flex;flex-direction:column;align-items:center;gap:.25em;padding:.38em .7em .42em;border-radius:.55em;background:linear-gradient(180deg,rgba(46,50,58,.94),rgba(22,24,29,.94));border:1px solid rgba(255,255,255,.16);box-shadow:0 .55em .9em -.2em rgba(0,0,0,.75),0 .15em .25em rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.14);transform:rotateX(20deg);transform-origin:50% 100%;pointer-events:auto}
.room.tafel .tf::after{content:'';position:absolute;left:12%;right:12%;bottom:-.42em;height:.32em;border-radius:50%;background:radial-gradient(rgba(0,0,0,.55),transparent 70%);z-index:-1}
.room.tafel .tf{position:relative}.room.tafel b{color:#e9ecf1;text-shadow:0 1px 2px #000;font-weight:500;font-size:calc(.92em * var(--rz,1));letter-spacing:.1em}
.room.tafel .tv{display:flex;align-items:center;gap:.55em;flex-wrap:nowrap;font:.9em 'Share Tech Mono',monospace;color:#dfe3e9}
.room.tafel .rv{display:flex;align-items:center;gap:.18em;cursor:pointer;white-space:nowrap}.room.tafel .rv svg{width:1em;height:1em;fill:currentColor;opacity:.85}
.room.tafel .rv.h{color:#8fc9ff}.room.tafel .rv.m{color:#c08bff}
.room.tafel .rv i{font:500 .72em Rajdhani,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-right:.15em;font-style:normal}
.room.tafel .rv.ist{color:#e9ecf1}.room.tafel .rv.soll{color:#9fb4cf}.room.tafel .rv.soll.heat{color:#ffab5e}.room.tafel .rv.soll.heat svg{opacity:1}
.room.tafel .tv .pill{font-size:.95em;padding:.05em .4em .05em .25em;background:rgba(0,0,0,.35)}
.oph{position:absolute;width:2.6em;height:2.6em;transform:translate(-50%,-50%);border-radius:50%;cursor:pointer;z-index:2}
.oid{position:absolute;transform:translate(-50%,-50%);width:1.9em;height:1.9em;border-radius:50%;background:#1b1d20;border:2px solid var(--c);display:grid;place-items:center;font:700 .8em Rajdhani,sans-serif;color:var(--c);box-shadow:0 0 .6em var(--g);cursor:pointer;z-index:2}
.oid.open{animation:hpo 1.6s infinite}.oid.open.door{animation:none}@keyframes hpo{50%{box-shadow:0 0 1.2em var(--c)}}
.lg{width:270px;flex:none;overflow:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}
.lg h3{margin:0 0 4px;font:700 13px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#80858f;display:flex;gap:8px}
.lg h3 span{margin-left:auto;font:13px 'Share Tech Mono',monospace;color:#c9ccd2;letter-spacing:0}
.lg .r{display:flex;align-items:center;gap:8px;font:600 14px Rajdhani,sans-serif;color:#aeb2b9;padding:3px 0;cursor:pointer;min-width:0}
.lg .r .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lg .r b{margin-left:auto;font:400 13px 'Share Tech Mono',monospace;color:var(--c,#c9ccd2);white-space:nowrap}
.led{width:9px;height:9px;border-radius:50%;flex:none;background:var(--c,#6f737c);box-shadow:0 0 6px var(--c,#6f737c)}
.err{padding:16px;color:#ffb347;font:600 15px Rajdhani,sans-serif}
@media (max-width:800px){.main{flex-direction:column}.lg{width:auto;max-height:40%}}
/* ---------- Editor */
.ed{display:flex;flex-direction:column;gap:10px;height:100%}
.tb{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tb .grp{display:flex;gap:4px;padding-right:8px;border-right:1px solid #2a2d33;margin-right:2px}
.edm{flex:1;min-height:0;display:flex;gap:12px}
.cv{flex:1;min-width:0;position:relative;border-radius:12px;background:#0b0c0e;overflow:hidden;touch-action:none;box-shadow:inset 0 2px 8px #000}
.cv>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.cv .mk{font-size:calc(12px * var(--mz,1))}
.cv .room{z-index:4}.cv .nm.drag,.cv .oid.drag{z-index:5}.cv .dv{cursor:move}.cv .dv.sel .ic,.cv .dv.sel .pill{outline:2px solid #4dc3ff;outline-offset:2px}
.hint{position:absolute;left:10px;bottom:8px;font:600 13px Rajdhani,sans-serif;color:#80858f;pointer-events:none;text-shadow:0 1px 3px #000}
.side{width:300px;flex:none;overflow:auto;background:#17181c;border:1px solid #26292e;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;font:600 14px Rajdhani,sans-serif}
.side h4{margin:4px 0 0;font:700 13px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#80858f}
.side label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#8a8f98;letter-spacing:.04em}
.side .row{display:flex;gap:8px}.side .row>*{flex:1;min-width:0}
.side input,.side select,.side textarea{width:100%;background:#0d0e11;border:1px solid #2c2f35;border-radius:7px;color:#e3e5e9;padding:6px 8px;font:14px 'Share Tech Mono',monospace}
.side textarea{min-height:110px;resize:vertical}
.side input[type=checkbox]{width:auto}
.side .chk{flex-direction:row;align-items:center;gap:8px;font-size:13px;color:#c9ccd2}
.side .btns{display:flex;flex-wrap:wrap;gap:6px}
.side .li{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:7px;cursor:pointer;color:#c9ccd2}
.side .li:hover{background:#22252a}.side .li small{margin-left:auto;color:#979ca5;font-family:'Share Tech Mono',monospace}
.side p{margin:0;color:#8a8f98;font-weight:500;font-size:13px;line-height:1.35}
.pal{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.pal button{background:#1d1f23;border:1px solid #2c2f35;border-radius:8px;padding:4px;color:#aeb2b9;font:600 11px Rajdhani,sans-serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
.pal button.on{border-color:#4dc3ff;color:#4dc3ff}
.pal svg{width:44px;height:30px}
.modal{position:absolute;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:20}
.modal>div{width:min(900px,94%);max-height:90%;display:flex;flex-direction:column;gap:10px;background:#17181c;border:1px solid #2c2f35;border-radius:14px;padding:14px}
.modal textarea{flex:1;min-height:360px;background:#0d0e11;color:#e3e5e9;border:1px solid #2c2f35;border-radius:8px;font:13px 'Share Tech Mono',monospace;padding:10px}
.modal .pv{height:min(60vh,520px)}
@media (max-width:900px){.edm{flex-direction:column}.side{width:auto;max-height:45%}}
.mk.ble{z-index:5}
.bt{position:absolute;transform:translate(-50%,-50%);cursor:pointer;z-index:4}
.bt .ic{width:1.8em;height:1.8em;--c:#a36bff;box-shadow:0 0 .8em rgba(163,107,255,.6)}
.bt .ic.img{overflow:hidden}.bt .ic.img img{width:100%;height:100%;object-fit:cover;display:block}
.bt .dotq{width:1.05em;height:1.05em;border-radius:50%;background:#3a3e48;border:1px solid #80858f;color:#c9ccd2;font:700 .62em/1 Rajdhani,sans-serif;display:grid;place-items:center}
.bt.unk{opacity:.7}.bt.rpa{opacity:.35}
.acc{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1;border-radius:50%;background:radial-gradient(rgba(163,107,255,.2),rgba(163,107,255,.04) 70%);border:1px dashed rgba(163,107,255,.5);pointer-events:none!important}
.sugl{display:flex;flex-wrap:wrap;gap:6px}.sugl .btn.sm{padding:4px 8px;font-size:12px}
.blem{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:30;padding:16px}
.blem .box{background:#1b1d20;color:#e3e5e9;border:1px solid #33363d;border-radius:16px;width:min(560px,100%);max-height:88vh;overflow:auto;padding:16px;font-family:Roboto,system-ui,sans-serif;--secondary-background-color:#24272c;--primary-color:#4dc3ff;--divider-color:#33363d;--success-color:#3ddc84}
.blem .fuss{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:12px}
.blem .fuss span{flex:1;font-size:.8em;opacity:.6}
/* ---------- Modus fenster / etagen: alle */
.mf{flex:1;min-height:0;display:flex;gap:14px}
.hp.auto .mf{flex:none;align-items:flex-start}
.mfc{min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}
.mft{font:700 13px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#80858f;text-align:center}
.mft span{font:12px 'Share Tech Mono',monospace;letter-spacing:0;margin-left:6px}
.mfh{flex:1;min-height:0}
.btn.ly{padding:5px 9px}.btn.ly.on{color:#ffd166;border-color:rgba(255,209,102,.45);box-shadow:0 0 8px rgba(255,209,102,.2)}
.mot{width:1.7em;height:1.7em;border-radius:50%;display:grid;place-items:center;background:#1b1d20;border:2px solid #a36bff;color:#a36bff;animation:hpm 1.4s infinite}
.mot svg{width:1.1em;height:1.1em;fill:currentColor}@keyframes hpm{50%{box-shadow:0 0 1.1em #a36bff}}
.oid.pz{animation:hpo .9s infinite}
.hp.teil{gap:0;justify-content:safe center;overflow:auto;scrollbar-width:none}
.teil .bar{flex-wrap:wrap;align-content:safe center;min-height:100%}
.t-titel .bar>:not(h2),.t-etagen .bar>:not([data-fl]):not(.fln),.t-summe .bar>:not(.lcd),.t-ebenen .bar>:not(.ly):not([data-a=labels]):not([data-a=ble]){display:none}
.t-titel .bar h2{margin:0}.t-summe .bar{justify-content:center}.t-summe .lcd{flex:1;text-align:center}
.t-legende .lg{width:auto;max-height:none;height:100%}
.lcd.alarm{color:#ff3b3b!important;animation:hpl 1s infinite}@keyframes hpl{50%{box-shadow:inset 0 2px 6px #000,0 0 10px rgba(255,59,59,.6)}}
.opi{font-family:Rajdhani,'Segoe UI',sans-serif}
.room b.ar{pointer-events:auto;cursor:pointer}
.ari h4{margin:14px 0 4px;font:700 13px Rajdhani,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8f98}.ari h4 small{opacity:.6;margin-left:4px}
.arr{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;cursor:pointer;font:500 15px Roboto,system-ui,sans-serif}.arr:hover{background:#24272c}
.arr .led{width:9px;height:9px;border-radius:50%;background:#4a4e56;flex:none}.arr.on .led{background:#ffc94d;box-shadow:0 0 8px #ffc94d}.arr.na{opacity:.45}
.arr .an{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arr b{font-weight:500;color:#c9ccd2;white-space:nowrap}
.arr .tg{border:1px solid #33363d;background:#24272c;color:#e3e5e9;border-radius:8px;padding:3px 10px;font:600 13px Rajdhani,sans-serif;cursor:pointer}.arr .tg.on{border-color:#ffc94d;color:#ffc94d}
.ari .arm{padding:6px 8px;color:#4dc3ff;cursor:pointer;font:600 14px Rajdhani,sans-serif}
.opi h3{margin:0 0 2px;font:700 22px Rajdhani,sans-serif;color:#e3e5e9}
.opi .rm{color:#8a8f98;font:600 14px Rajdhani,sans-serif;letter-spacing:.06em;text-transform:uppercase}
.opi .stt{display:flex;align-items:center;gap:10px;margin:14px 0 6px;font:700 26px Rajdhani,sans-serif;letter-spacing:.1em;color:var(--c)}
.opi .stt .led{width:14px;height:14px}
.opi .sn{font:17px 'Share Tech Mono',monospace;color:#c9ccd2}
.opi .wn{margin-top:10px;padding:7px 10px;border-radius:9px;font:700 15px Rajdhani,sans-serif;background:rgba(255,59,59,.14);color:#ff6b6b;border:1px solid rgba(255,59,59,.4)}
.opi .wn.heat{background:rgba(255,138,61,.12);color:#ff9d5c;border-color:rgba(255,138,61,.4)}
`;

// ------------------------------------------------------------------ Karte
let UID = 0;
// teil: (raum-panel „frei anordnen“) – Instanzen derselben Konfiguration teilen Etage, Namen, Ebenen und BLE-Modus
const TEIL = new Map();
class HausGrundriss extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: 'open' }); loadFonts();
    this._u = 'hp' + (++UID) + '_'; this._edit = false; this._sel = null; this._floor = null; this._labels = null; this._sig = '';
    this._ble = new Map(); this._bleSc = []; this._bleMode = null; this._bleUnsub = null; this._bleOpen = null;
  }
  static getStubConfig() { return { plan: { floors: [{ id: 'eg', name: 'Erdgeschoss', level: 0 }] } }; }
  getCardSize() { return 8; }
  // Bausteine für raum-panel (✥ Anordnen, layout: custom unter type: card) – siehe RPExtCard in raum-panel.js
  static get rpTeile() {
    return { titel: { h: 26 }, etagen: { h: 34 }, summe: { h: 32 }, ebenen: { h: 34 }, leiste: { h: 40 }, plan: { h: 300 }, legende: { h: 160 } };
  }
  static get rpDesign() { return { breite: 520, hoehe: 400 }; }
  static get rpStart() {
    return { grid: { columns: 12, row_height: 20, gap: 6, width: 520 },
      elements: { leiste: { col: 1, row: 1, w: 12, h: 2 }, plan: { col: 1, row: 3, w: 12, h: 13 } } };
  }
  setConfig(c) {
    // teil: nur ein Baustein, randlos und füllend; plan = Plan ohne Leiste/Legende, sonst Leiste bzw. Teile davon / Legende
    const T = c.teil ? String(c.teil) : null;
    if (T) {
      const k = Object.assign({}, c); delete k.teil; this._tkey = JSON.stringify(k);
      c = Object.assign(k, { teil: T, fill: true, frame: false, height: undefined }, T === 'plan' ? { bar: false, legend: false } : {});
    }
    this._teil = T;
    const view = c.view ?? c.ausschnitt, floor = c.floor ?? c.etage;
    const win = winMode(c);
    this._cfg = L(L({ ids: c.ids ?? c.kuerzel, source: c.source ?? c.quelle ?? 'haus-grundriss', labels: view ? false : true, legend: view ? false : true, frame: !view, title: view ? '' : 'Grundriss', zoom: 1 }, win ? { legend: false, title: 'Haus', ids: c.ids ?? c.kuerzel ?? false } : {}), c);
    this._cfg.view = view; this._cfg.floorId = floor; this._cfg._win = win;
    if (win) { const e = [].concat(c.ebenen ?? c.layers ?? []); this._lay = Object.fromEntries(Object.keys(LAYERS).map(k => [k, e.includes(k)])); this._reC = null; }
    else this._lay = null;
    // Master-Karte: plan: aus der Konfiguration nur, solange home_twin nicht liefert (danach nur noch Rückfall)
    if (c.plan) { this._master = true; if (!(this._edit && this._dirty) && !(this._src && this._src.mode === 'twin')) this._plan = normPlan(c.plan); }
    else this._master = false;
    if (c.height) this.style.height = c.height; else if (this._hset) this.style.height = '';
    this._hset = !!c.height;
    this._shareJoin();
    this._render(true);
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this._src && h) {
      const c = this._cfg, src = this._src = planSource(h, this._master ? (c.dashboard ?? dashFromPath()) : c.source, c.plan_id, c.twin !== false);
      const use = () => src.plan && (!this._master || src.mode === 'twin');
      this._onSrc = () => { if (this._edit) { this._edStatus(); return; } if (use()) { this._plan = src.plan; this._render(true); } else if (!this._plan) this._render(true); };
      src.subs.add(this._onSrc); if (use()) this._plan = src.plan;
    }
    this._bleStart();
    if (this._kids) Object.values(this._kids).forEach(k => { k.hass = h; });
    if (first) return this._render(true);
    if (this._edit) { this._editRender(); return; }
    if (this._opOpen && this._opOpen.area && Date.now() - (this._arT || 0) > 1000) { this._arT = Date.now(); this._areaInfo(this._opOpen); }
    const sig = this._watch().map(id => { const s = h.states[resolveEnt(h.states, id)]; return s ? s.last_updated + s.state : '-'; }).join('|');
    if (sig !== this._sig) { this._sig = sig; this._paint(); if (this._opOpen) this._opInfo(this._opOpen); }
  }
  // gemeinsamer Zustand der teil:-Instanzen einer Konfiguration
  _shareJoin() {
    if (this._tE) { this._tE.set.delete(this); this._tE = null; }
    if (!this._teil) return;
    let E = TEIL.get(this._tkey); if (!E) TEIL.set(this._tkey, E = { set: new Set(), st: null });
    E.set.add(this); this._tE = E;
    if (E.st) this._shareApply(E.st);
  }
  _shareApply(s) { if (this._floor !== s.floor) this._z = null; this._floor = s.floor; this._labels = s.labels; this._ids = s.ids; this._rn = s.rn; this._bleMode = s.ble; if (s.lay && this._lay) this._lay = Object.assign({}, s.lay); }
  _share() {
    const E = this._tE; if (!E) return;
    E.st = { floor: this._floor, labels: this._labels, ids: this._ids, rn: this._rn, ble: this._bleMode, lay: this._lay && Object.assign({}, this._lay) };
    E.set.forEach(p => { if (p === this || !p.isConnected) return; p._shareApply(E.st); p._sig = ''; p._bleStart(); if (!p._bleWanted()) p._bleStop(); p._render(); });
  }
  connectedCallback() { HG_CARDS.add(this); if (this._plan && this._cfg && !this._edit && this._is3d()) requestAnimationFrame(() => this._paint()); if (this._tE) this._tE.set.add(this); this._bleStart(); if (this._src && this._onSrc) this._src.subs.add(this._onSrc); this._loc = this._loc || (() => { if (!this._edit && this._plan) this._render(); }); window.addEventListener('location-changed', this._loc); window.addEventListener('popstate', this._loc); this._ro = this._ro || new ResizeObserver(() => this._edit && this._editRender()); this._ro.observe(this); }
  disconnectedCallback() { HG_CARDS.delete(this); this._v3drop(); if (this._tE) this._tE.set.delete(this); this._opClose(); this._bleStop(); if (this._src && this._onSrc) this._src.subs.delete(this._onSrc); if (this._loc) { window.removeEventListener('location-changed', this._loc); window.removeEventListener('popstate', this._loc); } if (this._ro) this._ro.disconnect(); this._keyOff && this._keyOff(); }

  _fl() {
    const P = this._plan; if (!P) return null;
    const v = this._viewObj();
    const id = v ? v.floor : this._floor || this._cfg.floorId || (P.floors.find(f => f.devices.some(d => hereMatch(d, this._cfg))) || {}).id;
    return P.floors.find(f => f.id === id) || P.floors[0];
  }
  // 3D-Ansicht: Karte ansicht: 3d (oder Umschalter in der Leiste); nicht für mehrere Etagen / Bausteine außer plan
  _btn3d() { const c = this._cfg || {}, v = c.knopf3d ?? c.button_3d; return c.view ? v === true : v !== false; }
  _dimKey() { return 'haus-grundriss:ansicht:' + ((this._cfg || {}).view || 'plan'); }
  _is3d() {
    const c = this._cfg || {}; if (this._multi() || (this._teil && this._teil !== 'plan')) return false;
    if (this._dim == null && this._btn3d()) { try { const v = localStorage.getItem(this._dimKey()); if (v) this._dim = v; } catch (e) { /* egal */ } }
    return this._dim ? this._dim === '3d' : /^3/.test(String(c.ansicht ?? c.dimension ?? c.view_mode ?? ''));
  }
  _wallMode() {
    const c = this._cfg || {}, nm = v => { const t = String(v ?? '').toLowerCase(); return /^(voll|full|aus|off|false)/.test(t) ? 'voll' : /^(halb|half|flach|flat|alle)/.test(t) ? 'halb' : /^(schr|diag|hinten|back)/.test(t) ? 'schraeg' : ''; };
    if (!(c.view && !this._btn3d())) { try { const v = localStorage.getItem('haus-grundriss:3d-wand'); if (v) return nm(v) || 'schraeg'; if (localStorage.getItem('haus-grundriss:3d-halb') === '0') return 'voll'; } catch (e) { /* egal */ } }
    const cv = c.halbe_waende ?? c.half_walls; if (cv === false) return 'voll';
    const cs = nm(c.wand_schnitt ?? c.wall_cut); if (cv != null || c.view) return cs === 'halb' ? 'halb' : 'schraeg';
    const st = (this._plan && this._plan.style) || {}; return nm(st.wall3d) || cs || (st.half3d === false ? 'voll' : 'schraeg');
  }
  _halfOld() {
    const c = this._cfg || {}, cv = c.halbe_waende ?? c.half_walls;
    if (c.view && !this._btn3d()) return cv != null ? cv !== false : true;   // Raum-Dashboard: Einstellung des Panels, Standard halbe Wände
    try { const v = localStorage.getItem('haus-grundriss:3d-halb'); if (v != null) return v === '1'; } catch (e) { /* egal */ }
    return cv != null ? cv !== false : ((this._plan && this._plan.style) || {}).half3d !== false;   // Standard: Schnitt an (Plan → Darstellung)
  }
  _bld() { return bldOf(this._plan, this._cfg) || bldOf(null, { building: this._src && this._src.building }); }
  // Nachbarhaus (nb) / andere Wohnungen + Treppenhaus (un): an | glas | aus
  _bldShow(k) {
    const c = this._cfg || {}, b = this._bld() || {}, ck = k === 'nb' ? c.nachbarhaus ?? c.neighbor_house : c.nachbarwohnungen ?? c.neighbor_units;
    if (!c.view) { try { const v = localStorage.getItem('haus-grundriss:gb-' + k); if (v) return bldShowNorm(v) || 'an'; } catch (e) { /* egal */ } }
    return bldShowNorm(ck) || bldShowNorm(k === 'nb' ? b.show_neighbor : b.show_units) || 'an';
  }
  // Raum-Dashboard 3D: nur den eigenen Raum bauen (Standard: ja, sobald das Gebäude gezeigt wird)
  _onlyRoom(fl) {
    const c = this._cfg || {}; if (!c.view) return null;
    const v = c.nur_raum ?? c.room_only, on = v != null && v !== '' ? v !== false && String(v) !== 'false' : this._bldMode() !== 'wohnung';
    return on ? this._viewRoom(fl) : null;
  }
  _bldMenu() {
    if (!this._bldOpen || !this._bld()) return '';
    const seg = (k, cur, o) => `<div class="sg">${o.map(([v, n]) => `<button data-a="bldset:${k}:${v}" class="${cur === v ? 'on' : ''}">${n}</button>`).join('')}</div>`, sh = [['an', 'Zeigen'], ['glas', 'Glasrahmen'], ['aus', 'Aus']];
    return `<div class="bldm"><b>Gebäude</b>${seg('mode', this._bldMode(), [['haus', 'Ganzes Haus'], ['etage', 'Eure Etage'], ['wohnung', 'Nur Wohnung']])}<b>Nachbarhaus</b>${seg('nb', this._bldShow('nb'), sh)}<b>Andere Wohnungen &amp; Treppenhaus</b>${seg('un', this._bldShow('un'), sh)}</div>`;
  }
  // wohnung | etage | haus – Raum-Dashboards nur auf ausdrücklichen Wunsch (gebaeude:)
  _bldMode() {
    const c = this._cfg || {}, b = this._bld(); if (!b) return 'wohnung';
    const cv = bldNorm(c.gebaeude ?? c.building_mode);
    if (c.view) return cv || 'wohnung';
    try { const v = localStorage.getItem('haus-grundriss:gebaeude'); if (v) return bldNorm(v) || 'haus'; } catch (e) { /* egal */ }
    return cv || bldNorm(b.mode) || 'haus';
  }
  _bx(fl) { const b = this._bld(), m = this._bldMode(); return b && m !== 'wohnung' && (!b.floor || b.floor === fl.id) ? { b, st: num(b.own, 0), mode: m, nb: this._bldShow('nb'), un: this._bldShow('un') } : null; }
  _rnOn(labels) { const c = this._cfg || {}, v = this._rn ?? c.raumnamen ?? c.room_names; return v != null ? v !== false : ((this._plan && this._plan.style) || {}).room_names === false ? false : !!labels; }
  _v3go(fl, g) {
    const host = this.shadowRoot.getElementById('v3'), mk = this.shadowRoot.getElementById('mk'); if (!host) return;
    if (!this._v3) {
      if (!this._v3p) this._v3p = load3D().then(m => { if (!this._v3p) return; this._v3 = new m.Twin3D(); this._paint(); })
        .catch(e => { this._v3p = null; const h = this.shadowRoot.getElementById('v3'); if (h) h.innerHTML = `<div class="err">3D-Ansicht nicht verfügbar: ${esc(e.message || e)}</div>`; });
      return;
    }
    let rot = g.rot; const bl = String(this._cfg.blick3d ?? this._cfg.view_3d ?? 'tablet').toLowerCase();
    if (bl === 'tablet' || bl === '') { const tb = fl.devices.find(d => d.type === 'tablet' && hereMatch(d, this._cfg) && (!this._cfg.view || g.inside(num(d.x), num(d.y)))); if (tb) { const a = num(tb.rotate) * Math.PI / 180; rot = Math.round(Math.atan2(-Math.sin(a), Math.cos(a)) * 180 / Math.PI); } }
    else if (/^-?\d+(\.\d+)?$/.test(bl)) rot = num(bl);
    try { this._v3.attach(host, mk); this._v3.dims(this._v3dimsOn()); this._v3.update({ plan: this._plan, fl, hass: this._hass, cfg: Object.assign({}, this._cfg, { _half: this._wallMode() !== 'voll', wand_schnitt: this._wallMode() === 'halb' ? 'halb' : 'schraeg', _bld: (this._bx(fl) || {}).b || (this._onlyRoom(fl) && this._bld() && (!this._bld().floor || this._bld().floor === fl.id) ? this._bld() : null), _bldMode: (this._bx(fl) || {}).mode || 'wohnung', _nb: this._bldShow('nb'), _un: this._bldShow('un'), _only: this._onlyRoom(fl) }), rect: g.rect, rot, view: !!this._cfg.view }); }
    catch (e) { console.error('home-twin-3d', e); host.innerHTML = `<div class="err">3D-Fehler: ${esc(e.message || e)}</div>`; this._v3 = null; this._v3p = null; }
  }
  _v3dimsOn() { return false; }   // Raumhöhen werden nicht angezeigt
  _v3drop() { if (this._v3) { try { this._v3.dispose(); } catch (e) { /* egal */ } } this._v3 = null; this._v3p = null; }
  // Raum eines Ausschnitts: Ausschnitt-Einstellung raum / Karten-Option raum / Raum in der Mitte des Ausschnitts
  _viewRoom(fl) {
    const v = this._viewObj(), c = this._cfg; if (!v || (c.raum_filter ?? c.room_filter) === false) return null;
    const id = c.raum ?? c.room ?? v.room;
    const r = (id && fl.rooms.find(x => x.id === id)) || roomAt(fl, [v.x + v.w / 2, v.y + v.h / 2]);
    return r ? roomGrp(r) : null;
  }
  // Raum-Tafel: an (Standard) – aus per Karte raum_tafel: false oder Plan style.room_badge = false
  _tafel() { const c = this._cfg || {}, v = c.raum_tafel ?? c.room_badge; return v != null ? v !== false : ((this._plan && this._plan.style) || {}).room_badge !== false; }
  // welche Werte auf der Tafel: Karte raum_werte: [temperatur, feuchte, luft] oder Plan-Einstellung
  _roomVals() {
    const c = this._cfg || {}, cv = c.raum_werte ?? c.room_values, sty = (this._plan && this._plan.style) || {};
    if (cv != null) { const a = [].concat(cv).map(x => String(x).toLowerCase()); return { temp: a.some(x => /^temp/.test(x)), hum: a.some(x => /^(feucht|hum|luftf)/.test(x)), air: a.some(x => /^(luft$|luftq|air|aq|co2|qual)/.test(x)) }; }
    return { temp: sty.rv_temp !== false, hum: sty.rv_hum !== false, air: sty.rv_air !== false };
  }
  // Ausschnitt: Werte des eigenen Raums als Leiste unter dem Grundriss (statt Tafel im Plan)
  _footOn() { const c = this._cfg || {}; return !!c.view && (c.werte_unten ?? c.values_below) !== false; }
  _footFill(fl, st) {
    const ft = this.shadowRoot.getElementById('vfoot'); if (!ft) return;
    const vr = this._viewRoom(fl), r = vr && (fl.rooms.find(x => x.id === vr) || fl.rooms.find(x => roomGrp(x) === vr));
    const rr = r ? this._roomRows(fl, r, st, this._cfg._fx) : { row1: '', row2: '' };
    ft.innerHTML = rr.row1 || rr.row2 ? `${rr.row1}${rr.row2}` : '';
    ft.style.display = rr.row1 || rr.row2 ? '' : 'none';
  }
  // Werte eines Raums: Ist/Soll (Sensor oder Thermostat), Luftfeuchte, Luftqualität
  _roomRows(fl, r, st, fx) {
    const rw = this._roomVals(), f1 = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const t = r.temperature && rw.temp ? st[resolveEnt(st, r.temperature)] : null, hu = r.humidity && rw.hum ? st[resolveEnt(st, r.humidity)] : null, aqS = r.air_quality && rw.air ? st[resolveEnt(st, r.air_quality)] : null;
    const gk = roomGrp(r), cd = fl.devices.find(d => d.type === 'climate' && d.entity && (() => { const x = roomAt(fl, [num(d.x), num(d.y)]); return x && roomGrp(x) === gk; })());
    const cid = r.climate ? resolveEnt(st, r.climate) : cd && cd.entity, cs = cid ? st[cid] : null, ca = (cs && cs.attributes) || {}, heat = cs ? heatingOn(cs) : false;
    const tsrc = r.temp_src || 'auto', hsrc = r.hum_src || 'auto';
    let ist = null, istE = null; if (rw.temp && (!fx || fx.lay.werte || fx.lay.heizung)) { if (tsrc !== 'thermostat' && t && sOk(t)) { ist = fmt(t); istE = resolveEnt(st, r.temperature); } else if (tsrc !== 'sensor' && ca.current_temperature != null) { ist = f1(ca.current_temperature) + '°'; istE = cid; } }
    let fe = null, feE = null; if (rw.hum) { if (hsrc !== 'thermostat' && hu && sOk(hu)) { fe = fmt(hu); feE = resolveEnt(st, r.humidity); } else if (hsrc !== 'sensor' && ca.current_humidity != null) { fe = Math.round(ca.current_humidity) + ' %'; feE = cid; } }
    const soll = cs && sOk(cs) && ca.temperature != null && (!fx || fx.lay.heizung) ? f1(ca.temperature) + '°' : null;
    const rv = (ent, ic, lab, val, cls = '', col = '') => val ? `<span class="rv ${cls}" data-act="more:${esc(ent)}" style="${col ? `color:${col};` : ''}">${svgI(ic)}${lab ? `<i>${lab}</i>` : ''}${val}</span>` : '';
    const row1 = rv(istE, 'temp', 'Ist', ist, 'ist') + rv(cid, heat ? 'flame' : 'tset', 'Soll', soll, 'soll' + (heat ? ' heat' : ''));
    const row2 = rv(feE, 'hum', '', fe, 'h') + rv(aqS ? resolveEnt(st, r.air_quality) : '', 'aq', '', aqS && sOk(aqS) ? fmt(aqS) : '', 'a', aqCol(aqS)) + (fx && fx.motion && fx.motion.has(r.id) ? `<span class="rv m">${svgI('motion')}</span>` : '');
    return { row1: row1 ? `<div class="tv">${row1}</div>` : '', row2: row2 ? `<div class="tv">${row2}</div>` : '' };
  }
  _viewObj() { const v = this._cfg.view; return v && this._plan ? this._plan.views.find(x => x.id === v) : null; }
  _watch() {
    const fl = this._fl(); if (!fl) return [];
    const ids = [], c = this._cfg;
    if (this._multi()) { this._floors().forEach(f => f.openings.forEach(o => ids.push(o.entity, o.tilt))); return ids.concat(c.alarm_entity).filter(Boolean); }
    fl.openings.forEach(o => ids.push(o.entity, o.tilt)); fl.devices.forEach(d => { ids.push(d.entity, d.humidity); (d.spots || []).forEach(q => ids.push(q.entity)); });
    fl.rooms.forEach(r => ids.push(r.temperature, r.humidity, r.air_quality, r.climate));
    if (this._is3d() || isReal(this._plan, c)) ids.push('sun.sun', weatherEnt(this._hass && this._hass.states, c));
    if (c._win) { ids.push(c.alarm_entity); const re = this._roomEnts(fl); Object.values(re).forEach(e => ids.push(...e.licht, ...e.bewegung)); }
    return ids.filter(Boolean);
  }
  // ---------------------------------------------------------- Modus fenster / etagen: alle
  // etagen: alle | [ids] → je Etage eine eigene Kind-Karte nebeneinander (gleicher Plan, gleiche Optionen)
  _multi() { const c = this._cfg || {}, e = c.etagen ?? c.floors; return !c._child && !c.view && !c.floorId && !this._master && (Array.isArray(e) || /^(alle|all)$/i.test(String(e || ''))); }
  _floors() {
    const P = this._plan; if (!P) return [];
    const e = this._cfg.etagen ?? this._cfg.floors, fs = [...P.floors].sort((a, b) => b.level - a.level);
    return Array.isArray(e) ? e.map(id => fs.find(f => f.id === id || f.name === id)).filter(Boolean) : fs;
  }
  _layList() { return this._lay ? Object.keys(this._lay).filter(k => this._lay[k]) : []; }
  // Licht/Bewegung je Raum: raeume: { <raum-id>: { licht: [...], bewegung: [...] } }, sonst automatisch über das Raumkürzel (fl_room → light.fl_light_zone*, binary_sensor.fl_*pzm*presence_detection_state / fl_light_motion_active)
  _roomEnts(fl) {
    const st = (this._hass && this._hass.states) || {}, n = Object.keys(st).length, key = `${fl.id}|${n}|${this._plan && this._plan.floors.length}`;
    if (this._reC && this._reC.key === key) return this._reC.v;
    const ks = Object.keys(st), ov = this._cfg.raeume || this._cfg.rooms || {}, arr = v => v == null ? null : [].concat(v), v = {};
    fl.rooms.forEach(r => {
      if (r.part_of) return;
      const o = ov[r.id] || ov[r.name] || {}, m = /^([a-z]{2,3})_room$/.exec(r.id || ''), p = m && m[1];
      v[r.id] = {
        licht: arr(o.licht ?? o.light) || (p ? ks.filter(k => k.startsWith(`light.${p}_light_zone`)) : []),
        bewegung: arr(o.bewegung ?? o.motion) || (p ? ks.filter(k => k.startsWith(`binary_sensor.${p}_`) && (/_pzm.*presence_detection_state$/.test(k) || /_light_motion_active$/.test(k))) : []),
      };
    });
    this._reC = { key, v };
    return v;
  }
  _fx(fl, st) {
    const c = this._cfg; if (!c._win) return null;
    const lay = this._lay, heat = new Set(), armed = armedSt(c, st[c.alarm_entity]), pulse = new Map(), light = new Set(), motion = new Set();
    fl.devices.forEach(d => { if (d.type === 'climate' && heatingOn(st[d.entity])) { const r = roomAt(fl, [num(d.x), num(d.y)]); if (r) heat.add(r.id); } });
    fl.openings.forEach((o, k) => {
      if (!o.entity) return;
      const s = contactState(st, o); if (s !== 'open' && s !== 'tilt') return;
      if (armed) pulse.set(k, 'alarm');
      else if (o.type !== 'door' && (c.puls_heizung ?? c.heat_pulse) !== false && opRooms(fl, o).some(r => heat.has(r.id))) pulse.set(k, 'heat');
    });
    const re = this._roomEnts(fl);
    Object.entries(re).forEach(([id, e]) => { if (lay.licht && e.licht.some(x => isOn(st[x]))) light.add(id); if (lay.bewegung && e.bewegung.some(x => isOn(st[x]))) motion.add(id); });
    return { lay, pulse, armed, heat, light, motion };
  }
  _sumFill(floors, st) {
    const sum = this.shadowRoot.getElementById('sum'); if (!sum) return;
    const c = this._cfg, armed = c._win && armedSt(c, st[c.alarm_entity]);
    let open = 0, openW = 0, tilt = 0, n = 0;
    floors.forEach(fl => fl.openings.forEach(o => { if (!o.entity) return; n++; const s = contactState(st, o); if (s === 'open') { open++; if (o.type !== 'door') openW++; } if (s === 'tilt') tilt++; }));
    const col = openW ? '#ff5a5a' : tilt ? '#ffb347' : open ? DOOR_OPEN : '#3ddc84';
    sum.textContent = (armed ? 'ALARM SCHARF · ' : '') + (!n ? `${floors.reduce((a, f) => a + f.rooms.filter(r => !r.part_of).length, 0)} RÄUME` : open || tilt ? [open ? `${open} OFFEN` : '', tilt ? `${tilt} KIPP` : ''].filter(Boolean).join(' · ') : 'ALLES ZU');
    sum.style.color = n ? col : '#c9ccd2';
    sum.classList.toggle('alarm', !!(armed && (open || tilt)));
  }
  _renderMulti(bar) {
    const c = this._cfg, root = this.shadowRoot, fill = !!(this.style.height || c.fill), fs = this._floors();
    root.innerHTML = `<style>${CSS}</style><div class="hp ${c.frame ? '' : 'bare'} ${fill ? '' : 'auto'}">${bar}<div class="mf">${fs.map(f => { const b = floorBBox(this._plan, f), ar = Math.max(.2, (b[2] - b[0]) / Math.max(.1, b[3] - b[1])); return `<div class="mfc" style="flex:${ar.toFixed(3)} 1 0"><div class="mft">${esc(f.name)}<span data-fs="${esc(f.id)}"></span></div><div class="mfh" data-f="${esc(f.id)}"></div></div>`; }).join('')}</div></div>`;
    root.querySelector('.hp').addEventListener('click', e => this._click(e));
    this._kids = this._kids || {};
    const base = Object.assign({}, c); ['etagen', 'floors', 'title', 'height', 'fill', 'type', 'teil'].forEach(k => delete base[k]);
    fs.forEach(f => {
      const k = this._kids[f.id] || (this._kids[f.id] = document.createElement('haus-grundriss'));
      k.setConfig(Object.assign({}, base, { etage: f.id, _child: true, bar: false, frame: false, legend: false, title: '', ebenen: this._layList(), labels: this._labels ?? c.labels, ...(fill ? { height: '100%' } : {}) }));
      [...root.querySelectorAll('.mfh')].find(x => x.dataset.f === f.id).appendChild(k);
      if (this._hass) k.hass = this._hass;
    });
    this._paint();
  }
  // Tipp auf einen Raumnamen: Geräte des verknüpften HA-Bereichs
  _areaAct(r) {
    const c = this._cfg || {}, on = c.raum_tippen ?? c.room_tap ?? !c.view;
    if (on === false || !r || r.part_of) return '';
    return haArea(this._hass, r) ? `class="ar" data-act="area:${esc(r.id)}"` : '';
  }
  _areaInfo(ref) {
    const h = this._hass, P = this._plan; if (!h || !P) return;
    let r = null; P.floors.some(f => (r = f.rooms.find(x => x.id === ref.area)));
    const aid = r && haArea(h, r); if (!aid) { this._opClose(); return; }
    if (!this._opOpen || this._opOpen.area !== ref.area) this._arMore = false;
    this._opOpen = ref;
    let m = this._opHost && this._opHost.shadowRoot.getElementById('opm');
    if (!m) {
      const hh = this._opHost = document.createElement('div'); hh.style.cssText = 'position:fixed;inset:0;z-index:9000';
      hh.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style>`;
      m = document.createElement('div'); m.id = 'opm'; m.className = 'blem'; hh.shadowRoot.appendChild(m); document.body.appendChild(hh);
      m.addEventListener('click', e => {
        const tg = e.target.closest('[data-tog]'); if (tg) { e.stopPropagation(); this._hass.callService('homeassistant', 'toggle', { entity_id: tg.dataset.tog }); return; }
        const mo = e.target.closest('[data-mehr]'); if (mo) { this._arMore = !this._arMore; if (this._opOpen) this._opInfo(this._opOpen); return; }
        const b = e.target.closest('[data-x],[data-more],[data-nav]');
        if (b && b.dataset.nav) { history.pushState(null, '', b.dataset.nav); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }
        if (b && b.dataset.more) this._more(b.dataset.more);
        if (e.target === m || b) this._opClose();
      });
    }
    const st = h.states || {}, A = h.areas[aid], { G, rest } = areaGroups(h, aid), an = normN(A.name);
    const nm = id => { const S = st[id], f = String((S && S.attributes.friendly_name) || id); const k = f.toLowerCase().startsWith(A.name.toLowerCase() + ' ') ? f.slice(A.name.length + 1) : f; return k || f; };
    const val = id => { const S = st[id]; if (!S) return '–'; try { if (h.formatEntityState) return h.formatEntityState(S); } catch (e) { /* egal */ } return S.state + (S.attributes.unit_of_measurement ? ' ' + S.attributes.unit_of_measurement : ''); };
    const tog = id => ['light', 'switch', 'input_boolean', 'fan'].includes(id.split('.')[0]);
    const row = id => { const S = st[id], on = S && ['on', 'open', 'unlocked', 'playing', 'heat', 'home'].includes(S.state), na = !S || S.state === 'unavailable';
      return `<div class="arr${on ? ' on' : ''}${na ? ' na' : ''}" data-more="${esc(id)}"><span class="led"></span><span class="an">${esc(nm(id))}</span><b>${esc(val(id))}</b>${tog(id) && !na ? `<button class="tg${on ? ' on' : ''}" data-tog="${esc(id)}">${on ? 'Aus' : 'Ein'}</button>` : ''}</div>`; };
    const LIM = 8, admin = h.user && h.user.is_admin;
    const body = G.map(g => { const ids = this._arMore ? g.ids : g.ids.slice(0, LIM); return `<h4>${esc(g.n)} <small>${g.ids.length}</small></h4>${ids.map(row).join('')}${g.ids.length > ids.length ? `<div class="arm" data-mehr>+ ${g.ids.length - ids.length} weitere</div>` : ''}`; }).join('')
      + (rest.length ? (this._arMore ? `<h4>Sonstiges <small>${rest.length}</small></h4>${rest.map(row).join('')}` : `<div class="arm" data-mehr>Sonstiges: ${rest.length} weitere Entitäten anzeigen</div>`) : '');
    m.innerHTML = `<div class="box opi ari"><h3>${esc(r.name || r.id)}</h3><div class="rm">HA-Bereich: ${esc(A.name)}${an !== normN(r.name) ? ' (zugeordnet)' : ''}</div>
      ${body || '<p class="sn">Diesem Bereich sind in Home Assistant noch keine Geräte zugeordnet.</p>'}
      <div class="fuss"><span></span>${admin ? `<button class="btn" data-nav="/config/areas/area/${esc(aid)}">Bereich in HA öffnen</button>` : ''}<button class="btn" data-x>Schließen</button></div></div>`;
  }
  _opClose() { this._opOpen = null; clearInterval(this._opT); if (this._opHost) { this._opHost.remove(); this._opHost = null; } }
  _opInfo(ref) {
    const fl = this._plan && this._plan.floors.find(f => f.id === ref.f), o = fl && fl.openings[ref.i];
    if (ref && ref.area) return this._areaInfo(ref);
    let m = this._opHost && this._opHost.shadowRoot.getElementById('opm');
    if (!o) { this._opClose(); return; }
    this._opOpen = ref;
    if (!m) {
      // eigenes Element an document.body (eigener Shadow-Root): Transform/overflow eines Raum-Panels schneiden es nicht ab
      const h = this._opHost = document.createElement('div'); h.style.cssText = 'position:fixed;inset:0;z-index:9000';
      h.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style>`;
      m = document.createElement('div'); m.id = 'opm'; m.className = 'blem'; h.shadowRoot.appendChild(m); document.body.appendChild(h);
      m.addEventListener('click', e => {
        const tg = e.target.closest('[data-tog]'); if (tg) { e.stopPropagation(); this._hass.callService('homeassistant', 'toggle', { entity_id: tg.dataset.tog }); return; }
        const mo = e.target.closest('[data-mehr]'); if (mo) { this._arMore = !this._arMore; if (this._opOpen) this._opInfo(this._opOpen); return; }
        const b = e.target.closest('[data-x],[data-more],[data-nav]');
        if (b && b.dataset.nav) { history.pushState(null, '', b.dataset.nav); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }
        if (b && b.dataset.more) this._more(b.dataset.more);
        if (e.target === m || b) this._opClose();
      });
      clearInterval(this._opT); this._opT = setInterval(() => this._opOpen ? this._opInfo(this._opOpen) : clearInterval(this._opT), 30000);
    }
    const st = (this._hass && this._hass.states) || {}, c = this._cfg, s = contactState(st, o), [col, txt] = ocol(o, s);
    const me = st[resolveEnt(st, o.entity)], te = o.tilt ? st[resolveEnt(st, o.tilt)] : null;
    const src = s === 'tilt' && te && isOn(te) ? te : me, nm = o.name || (me && me.attributes.friendly_name) || o.id;
    const rooms = opRooms(fl, o).map(r => r.name || r.id).join(' ↔ ');
    const fx = this._fx(fl, st) || { pulse: new Map() }, pz = fx.pulse.get(ref.i);
    const lbl = { open: 'offen seit', tilt: 'gekippt seit', closed: 'zu seit', na: 'nicht verfügbar seit' }[s];
    m.innerHTML = `<div class="box opi" style="--c:${col}"><h3>${esc(nm)}</h3><div class="rm">${esc(o.id)}${rooms ? ' · ' + esc(rooms) : ''}${this._plan.floors.length > 1 ? ' · ' + esc(fl.name) : ''}</div>
      <div class="stt"><span class="led"></span>${txt}</div>
      <div class="sn">${src && src.last_changed ? `${lbl} ${esc(sinceTxt(src.last_changed))}` : ''}</div>
      ${pz === 'alarm' ? '<div class="wn">⚠ Alarmanlage ist scharf</div>' : pz === 'heat' ? '<div class="wn heat">♨ Heizung im Raum heizt</div>' : ''}
      <div class="fuss"><span>${c.alarm_entity && !st[c.alarm_entity] ? 'Alarm-Entität nicht gefunden' : ''}</span>${me ? `<button class="btn" data-more="${esc(me.entity_id)}">Verlauf</button>` : ''}<button class="btn" data-x>Schließen</button></div></div>`;
  }

  // ---------------------------------------------------------- Anzeige
  _render(force) {
    if (!this._cfg) return;
    if (this._edit) return this._editBuild();
    const c = this._cfg, root = this.shadowRoot;
    if (!this._plan) {
      root.innerHTML = `<style>${CSS}</style><div class="hp"><div class="err">${this._src && this._src.err ? esc(this._src.err) : 'Grundriss wird geladen …'}</div></div>`;
      return;
    }
    if (c.view && !this._viewObj()) { root.innerHTML = `<style>${CSS}</style><div class="hp"><div class="err">Ausschnitt „${esc(c.view)}“ nicht gefunden</div></div>`; return; }
    const P = this._plan, fl = this._fl(), labels = this._labels ?? c.labels, admin = this._master && this._hass && this._hass.user && this._hass.user.is_admin && c.editor !== false;
    const floors = [...P.floors].sort((a, b) => b.level - a.level);
    const T = this._teil, bar = (T ? T === 'plan' : c.view || c.bar === false) ? '' : `<div class="bar">${c.title ? `<h2>${esc(c.title)}</h2>` : ''}
      ${this._multi() ? '' : floors.length > 1 && !c.floorId ? floors.map(f => `<button class="btn ${f === fl ? 'on' : ''}" data-fl="${esc(f.id)}">${esc(f.name)}</button>`).join('') : `<span class="fln" style="color:#80858f">${esc(fl.name)}</span>`}
      <span class="sp"></span><span class="lcd" id="sum">--</span>
      ${c._win ? [].concat(c.ebenen_schalter ?? c.layer_buttons ?? ['licht', 'bewegung', 'heizung', 'ble']).filter(k => k && LAYERS[k]).map(k => `<button class="btn ly ${this._lay[k] ? 'on' : ''}" data-ly="${k}">${LAYERS[k]}</button>`).join('') : ''}
      <button class="btn ${labels ? 'on' : ''}" data-a="labels">Namen</button>
      ${(c.knopf_kuerzel ?? c.ids_button) !== false && this._plan && this._plan.floors.some(f => f.openings.some(o => o.entity)) ? (() => { const iv = this._ids ?? c.ids ?? ((P.style || {}).ids === false ? false : undefined), on = (labels && iv !== false) || iv === true; return `<button class="btn ${on ? 'on' : ''}" data-a="ids" title="Kürzel der Fenster und Türen (T1, F1 …) ein-/ausblenden">T1·F1</button>`; })() : ''}
      ${(c.knopf_raeume ?? c.rooms_button) !== false ? `<button class="btn ${this._rnOn(labels) ? 'on' : ''}" data-a="rnames" title="Raumnamen ein-/ausblenden">Räume</button>` : ''}
      ${!this._multi() && (c.knopf3d ?? c.button_3d) !== false ? `<button class="btn ${this._is3d() ? 'on' : ''}" data-a="dim" title="Zwischen Grundriss (2D) und 3D-Ansicht wechseln">${this._is3d() ? '3D' : '2D'}</button>` : ''}
      ${!c._win && (this._bleWanted() || T === 'ebenen' || T === 'leiste') && !this._bleOff ? `<button class="btn ${this._bleModeGet() !== 'aus' ? 'on' : ''}" data-a="ble" title="BLE-Geräte im Plan: alle / nur hinzugefügte / aus">BLE: ${{ alle: 'Alle', bekannt: 'Meine', aus: 'Aus' }[this._bleModeGet()]}</button>` : ''}
      ${admin ? `<button class="btn" data-a="edit">✎ Bearbeiten</button>` : ''}</div>`;
    if (T && T !== 'plan') {
      root.innerHTML = `<style>${CSS}</style><div class="hp bare teil t-${esc(T)}">${T === 'legende' ? '<div class="lg" id="lg"></div>' : bar}</div>`;
      root.querySelector('.hp').addEventListener('click', e => this._click(e));
      this._paint(); return;
    }
    if (this._multi()) return this._renderMulti(bar);
    if (this._kids) { this._kids = null; }
    const d3 = this._is3d(); if (!d3 && this._v3) this._v3drop();
    const auto = !this.style.height && !c.fill;
    const rad = c.rund === true ? 14 : num(c.rund, 0), rw = Math.max(0, c.rahmen === true ? 3 : num(c.rahmen, 0)), shd = !!c.schatten;
    const ss = clamp(num(c.schatten_staerke, 1), 0, 5), sa = clamp(1 - num(c.schatten_transparenz, 45) / 100, 0, 1);
    const sp = c.schatten_abstand != null ? num(c.schatten_abstand, 0) : rw + (shd ? Math.ceil(16 * ss) : 0);
    const look = `${rad > 0 ? ' rnd' : ''}${rw || shd ? ' look' : ''}${shd ? ' shd' : ''}" style="--rad:${rad}px;--rw:${rw}px;--rc:${c.rahmen_farbe || 'rgba(255,255,255,.16)'};--ss:${ss};--sa:${sa.toFixed(2)};--sp:${sp}px`;
    root.innerHTML = `<style>${CSS}</style><div class="hp ${c.frame ? '' : 'bare'} ${auto ? 'auto' : ''}${look}">${bar}
      ${this._footOn() ? '' : ''}<div class="main"><div class="planbox${d3 ? ' d3' : ''}"><div class="planar" id="ar">${d3 ? `<div class="v3" id="v3"></div><div class="mk m3" id="mk" style="--mz:${num(c.zoom, 1) * num((P.style || {}).scale, 1)};--rz:${num((P.style || {}).room_scale, 1)}"></div></div>${(c.bewegen3d ?? c.controls_3d) !== false ? this._btn3d() ? `<div class="zbar z3">${c.view ? '<button data-a="dim" title="Zur 2D-Ansicht">2D</button>' : ''}${(() => { const w = this._wallMode(); return `<button data-a="v3half" class="${w !== 'voll' ? 'on' : ''}" title="Wände: ${w === 'schraeg' ? 'hinterste Wände voll, Rest abgeschnitten' : w === 'halb' ? 'alle Wände abgeschnitten' : 'volle Höhe'} (tippen zum Wechseln)">${w === 'schraeg' ? '◩' : w === 'halb' ? '½' : '▮'}</button>`; })()}${this._bld() && !c.view ? (() => { const m = this._bldMode(); return `<button data-a="v3bldm" class="${m !== 'wohnung' ? 'on' : ''}" title="Gebäude, Nachbarhaus, andere Wohnungen">${m === 'haus' ? '🏢' : m === 'etage' ? '▤' : '⌂'}</button>`; })() : ''}<button data-a="v3reset" title="Ansicht zurücksetzen">⤢</button></div>${c.view ? '' : this._bldMenu()}` : '' : ''}</div>${c.legend && !c.view ? '<div class="lg" id="lg"></div>' : ''}</div></div>` : ''}${d3 ? '' : `<div class="zm" id="zm"><svg id="svg"></svg><div class="mk" id="mk" style="--mz:${num(c.zoom, 1) * num((P.style || {}).scale, 1)};--rz:${num((P.style || {}).room_scale, 1)}"></div><div class="mk ble" id="ble" style="--mz:${num(c.zoom, 1) * num((P.style || {}).scale, 1)}"></div></div></div>${this._zoomOn() ? '<div class="zbar"><button data-z="in" title="Vergrößern">+</button><button data-z="out" title="Verkleinern">−</button><button class="zr" data-z="reset" title="Ganzer Plan">⤢</button></div>' : ''}${c.view && !this._zoomOn() && this._btn3d() ? '<div class="zbar z3"><button data-a="dim" title="Zur 3D-Ansicht">3D</button></div>' : ''}</div>${c.legend && !c.view ? '<div class="lg" id="lg"></div>' : ''}</div></div>`}`;
    if (this._footOn()) { const hp0 = root.querySelector('.hp'), ft = document.createElement('div'); ft.className = 'vfoot'; ft.id = 'vfoot'; hp0.appendChild(ft); }
    root.querySelector('.hp').addEventListener('click', e => this._click(e));
    this._bindHold(root.querySelector('.hp'));
    this._bindZoom();
    this._paint();
    this._paintBle();
    if (this._z) this._zApply(); // Zoom/Ausschnitt nach dem Neuaufbau (BLE-Filter, Namen, neue Plandaten) wieder anwenden
  }
  _geom() {
    const P = this._plan, fl = this._fl(), v = this._viewObj();
    let rect, rot = deg(v ? v.rotate : num(this._cfg.rotate)) ;
    rot = Math.round(rot / 90) * 90 % 360;
    if (v) rect = [v.x, v.y, v.x + v.w, v.y + v.h]; else rect = floorBBox(P, fl);
    const cs = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]].map(p => rotP(p, rot));
    const vb = [Math.min(...cs.map(p => p[0])), Math.min(...cs.map(p => p[1])), 0, 0];
    vb[2] = Math.max(...cs.map(p => p[0])) - vb[0]; vb[3] = Math.max(...cs.map(p => p[1])) - vb[1];
    const pos = (x, y) => { const q = rotP([x, y], rot); return `left:${((q[0] - vb[0]) / vb[2] * 100).toFixed(2)}%;top:${((q[1] - vb[1]) / vb[3] * 100).toFixed(2)}%`; };
    const inside = (x, y) => !v || (x >= rect[0] - .05 && x <= rect[2] + .05 && y >= rect[1] - .05 && y <= rect[3] + .05);
    return { rect, rot, vb, pos, inside };
  }
  _paint() {
    const root = this.shadowRoot, st0 = (this._hass && this._hass.states) || {};
    if (this._teil && this._teil !== 'plan') {
      if (!this._plan) return;
      const fs = this._multi() ? this._floors() : [this._fl()];
      this._sumFill(fs, st0);
      const lg = root.getElementById('lg'); if (lg) lg.innerHTML = fs.map(f => this._legend(f, st0)).join('');
      return;
    }
    if (this._kids && this._plan) {
      const fs = this._floors(); this._sumFill(fs, st0);
      fs.forEach(f => { const el = [...root.querySelectorAll('[data-fs]')].find(x => x.dataset.fs === f.id); if (!el) return; let o = 0, w = 0, t = 0; f.openings.forEach(op => { if (!op.entity) return; const s = contactState(st0, op); if (s === 'open') { o++; if (op.type !== 'door') w++; } if (s === 'tilt') t++; }); el.textContent = o || t ? [o ? `${o} offen` : '', t ? `${t} kipp` : ''].filter(Boolean).join(' · ') : ''; el.style.color = w ? '#ff5a5a' : t ? '#ffb347' : DOOR_OPEN; });
      return;
    }
    if (this._is3d() && this._plan && root.getElementById('v3')) {
      const fl = this._fl(), g = this._geom(), labels = this._labels ?? this._cfg.labels;
      this._cfg._fx = this._fx(fl, st0);
      const ar = (g.vb[2] / g.vb[3]).toFixed(4), hp = root.querySelector('.hp'); root.getElementById('ar').style.setProperty('--ar', ar); if (hp) hp.style.setProperty('--ar', ar);
      const g3 = { rect: g.rect, rot: g.rot, inside: g.inside, pos: (x, y) => `left:-999px;top:-999px;--wx:${num(x).toFixed(3)};--wy:${num(y).toFixed(3)}` };
      root.getElementById('mk').innerHTML = this._markers(fl, g3, labels, st0);
      this._v3go(fl, g); this._sumFill([fl], st0); this._footFill(fl, st0);
      const lg = root.getElementById('lg'); if (lg) lg.innerHTML = this._legend(fl, st0);
      return;
    }
    const svg = root.getElementById('svg'); if (!svg || !this._plan) return;
    const P = this._plan, fl = this._fl(), g = this._geom(), labels = this._labels ?? this._cfg.labels, st = st0;
    this._cfg._fx = this._fx(fl, st);
    root.getElementById('ar').style.setProperty('--ar', (g.vb[2] / g.vb[3]).toFixed(4));
    const hp = root.querySelector('.hp'); if (hp) hp.style.setProperty('--ar', (g.vb[2] / g.vb[3]).toFixed(4));
    svg.setAttribute('viewBox', g.vb.map(v => v.toFixed(3)).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.innerHTML = `<g transform="rotate(${g.rot})">${floorSvg(P, fl, this._hass, this._u, false, this._cfg, this._bx(fl))}</g>`;
    root.getElementById('mk').innerHTML = this._markers(fl, g, labels, st);
    this._footFill(fl, st);
    // Zusammenfassung Fenster/Türen
    this._sumFill([fl], st);
    const lg = root.getElementById('lg'); if (lg) lg.innerHTML = this._legend(fl, st);
  }
  _devHtml(d, st, labels, posStyle, extraCls = '', dataK = '', nmFree = null, nmK = '') {
    const s = st[d.entity], name = d.name || (s && s.attributes && s.attributes.friendly_name) || d.entity || (d.type === 'bleproxy' ? this._scName(d.scanner) : '') || (dataK ? TYPES[d.type] : '');
    const nc = d.label_color || (this._plan.style || {}).label, nst = nc ? `color:${nc};` : '';
    const nmAttr = nmK ? `data-k="${nmK}" ` : '', nmCls = nmK ? ' drag' + (this._sel && this._sel.t === 'dev' && nmK === 'lbl:dev:' + this._sel.i ? ' on' : '') : '';
    if (d.hide_name && !nmK) labels = false;
    const nst2 = d.hide_name && nmK ? 'opacity:.35;' : '';
    const free = labels && name && nmFree ? `<div class="nm free${nmCls}" ${nmAttr}style="${nmFree};${nst}${nst2}">${esc(name)}</div>` : '';
    const nm = labels && name && !nmFree ? `<div class="nm${nmCls}" ${nmAttr}style="${nst}${nst2}">${esc(name)}</div>` : '';
    if (!d.entity && !dataK && d.type !== 'tablet' && d.type !== 'bleproxy') return '';
    return this._devCore(d, s, st, posStyle, extraCls, dataK, nm) + free;
  }
  _devCore(d, s, st, posStyle, extraCls, dataK, nm) {
    const act = dataK || d.type === 'bleproxy' ? '' : d.type === 'tablet' ? `data-act="nav:${esc(d.dashboard || '')}"` : (d.type === 'light' || d.type === 'switch') && d.tap !== 'more-info' ? `data-act="toggle:${esc(d.entity)}"` : `data-act="more:${esc(d.entity)}"`;
    const base = `class="dv ${extraCls}" ${act} ${dataK} style="${posStyle}`;
    if (!d.entity && !dataK && d.type !== 'tablet' && d.type !== 'bleproxy') return '';
    if (d.type === 'bleproxy') {
      const on = this._scOn(d.scanner, d.name), col = on ? '#3ddc84' : on === false ? '#ff5a5a' : '#979ca5';
      return `<div ${base};--c:${col};--g:${on ? 'rgba(61,220,132,.35)' : 'transparent'}" title="${esc(d.scanner || 'kein Proxy gewählt')}"><div class="ic">${svgI('ble')}</div>${nm}</div>`;
    }
    if (d.type === 'light' || d.type === 'switch') {
      const on = isOn(s), col = d.type === 'light' && on ? lightCol(s) : on ? '#4dc3ff' : '#979ca5';
      return `<div ${base};--c:${col};--g:${on ? col : 'transparent'}" ${sOk(s) || dataK ? '' : 'data-na'}><div class="ic ${sOk(s) || dataK ? '' : 'na'}">${svgI(d.type === 'light' ? (LAMP[d.lamp] || LAMP.ceiling)[3] : 'switch')}</div>${nm}</div>`;
    }
    if (d.type === 'tablet') {
      const ts = (this._plan && this._plan.style) || {}, icx = `${(d.no_ring ?? ts.tab_no_ring) ? ' nor' : ''}${(d.no_bg ?? ts.tab_no_bg) ? ' nobg' : ''}`;
      if (!dataK && hereMatch(d, this._cfg)) {
        const hc = hereCol(this._plan, this._cfg), tx = this._cfg.hier_text ?? this._cfg.here_text ?? 'Du bist hier';
        return `<div ${base.replace('class="dv ', 'class="dv here ')};--c:${hc};--g:${hc}"><div class="ic here${herePulse(this._cfg) ? '' : ' still'}${icx}">${icoH(this._cfg.hier_icon || this._cfg.here_icon || d.icon, 'tablet')}</div>${tx ? `<div class="here-b">${esc(tx)}</div>` : ''}${nm}</div>`;
      }
      return `<div ${base};--c:#4dc3ff;--g:rgba(77,195,255,.3)"><div class="ic${icx}">${icoH(d.icon, 'tablet')}</div>${nm}</div>`;
    }
    if (d.type === 'climate') {
      const a = (s && s.attributes) || {}, heat = a.hvac_action === 'heating' || (s && s.state === 'heat' && a.hvac_action == null);
      const col = !sOk(s) ? '#979ca5' : heat ? '#ff8a3d' : '#c9ccd2', f = v => v == null ? '--' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return `<div ${base};--c:${col};--b:${heat ? 'rgba(255,138,61,.45)' : '#33363d'};--g:${heat ? 'rgba(255,138,61,.35)' : 'transparent'}"><div class="pill">${svgI(heat ? 'flame' : 'rad')}${f(a.current_temperature)}°<small>›${f(a.temperature)}°</small></div>${nm}</div>`;
    }
    if (d.type === 'binary') {
      const on = isOn(s), col = !sOk(s) ? '#979ca5' : on ? '#ffd166' : '#5d6470', dc = (s && s.attributes && s.attributes.device_class) || '';
      return `<div ${base};--c:${col};--g:${on ? 'rgba(255,209,102,.5)' : 'transparent'}" ${on ? 'data-pulse' : ''}><div class="ic">${svgI(/motion|occupancy|presence/.test(dc) || !dc ? 'motion' : 'dot')}</div>${nm}</div>`.replace('class="dv ', on ? 'class="dv pulse ' : 'class="dv ');
    }
    if (d.type === 'tracker') {
      const col = d.color || '#a36bff';
      return `<div ${base};--c:${col};--g:${col}"><div class="ic">${svgI('person')}</div>${nm}</div>`;
    }
    const h = d.humidity ? st[d.humidity] : null;
    return `<div ${base};--c:#c9ccd2"><div class="pill">${svgI(sensorIcon(s))}${fmt(s)}${h ? `<small>${fmt(h)}</small>` : ''}</div>${nm}</div>`;
  }
  _markers(fl, g, labels, st, ed = false) {
    let h = '';
    const sty = this._plan.style || {}, S = this._sel || {}, fx = !ed && this._cfg._fx, info = fx && this._cfg.info !== false;
    const vr = ed ? null : this._viewRoom(fl), only = vr && String(this._cfg.raum_filter ?? this._cfg.room_filter ?? '') !== 'oeffnungen';
    const devIn = d => { const r = roomAt(fl, [num(d.x), num(d.y)]); return !!r && roomGrp(r) === vr; };
    // Heizung: Ist › Soll erscheint in der Raummitte (heizung_anzeige: heizkoerper = wie früher am Heizkörper)
    const heatIn = new Map(), heatSet = new Set(), heatData = new Map();
    if (!ed && !/^heizk|^radiat/i.test(String(this._cfg.heizung_anzeige ?? this._cfg.heater_display ?? sty.heat_pill ?? ''))) fl.devices.forEach(d => {
      if (d.type !== 'climate' || !d.entity || (fx && !fx.lay.heizung)) return;
      const r = roomAt(fl, [num(d.x), num(d.y)]); if (!r) return;
      const k = roomGrp(r); if (only && k !== vr) return;
      const s = st[d.entity], a = (s && s.attributes) || {}, heat = heatingOn(s), f = v => v == null ? '--' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const col = !sOk(s) ? '#979ca5' : heat ? '#ff8a3d' : '#c9ccd2';
      heatIn.set(k, (heatIn.get(k) || '') + `<div class="pill" data-act="more:${esc(d.entity)}" style="pointer-events:auto;cursor:pointer;--c:${col};--b:${heat ? 'rgba(255,138,61,.45)' : '#33363d'};--g:${heat ? 'rgba(255,138,61,.3)' : 'transparent'}">${svgI(heat ? 'flame' : 'rad')}${f(a.current_temperature)}°<small>›${f(a.temperature)}°</small></div>`);
      heatSet.add(d); heatData.set(k, (heatData.get(k) || []).concat([{ d, s, heat }]));
    });
    (fl.areas || []).forEach((a, ai) => {
      if (!a.name || !areaOk(a)) return;
      const c = areaLbl(a);
      if (!ed && (!labels || a.hide_name || (!g.inside(c[0], c[1]) && !this._cfg.view))) return;
      const st = `color:${a.label_color || sty.area_label || '#8fae88'};font-size:calc(.8em * var(--rz,1));font-weight:600;${ed && a.hide_name ? 'opacity:.35;' : ''}${roomShadow(sty)}`;
      h += `<div class="room" style="${g.pos(c[0], c[1])}"><b ${ed ? `class="drag${S.t === 'area' && S.i === ai ? ' on' : ''}" data-k="lbl:area:${ai}"` : ''} style="${st}">${esc(a.name)}</b></div>`;
    });
    fl.rooms.forEach((r, ri) => {
      if (r.points.length < 3) return;
      const c = r.label_x != null ? [num(r.label_x), num(r.label_y ?? r['true'])] : centroid(r.points);
      if (!g.inside(c[0], c[1]) && !(this._cfg.view)) return;
      const rc = r.label_color || sty.room_label, sh = roomShadow(sty);
      if (r.part_of) { if (ed) { const pr = fl.rooms.find(x => x.id === r.part_of); h += `<div class="room" style="${g.pos(c[0], c[1])}"><b class="drag" data-k="lbl:room:${ri}" style="opacity:.45;font-size:.8em;${sh}">↳ ${esc(pr ? pr.name || pr.id : r.part_of)}</b></div>`; } return; }
      if (ed) { h += `<div class="room" style="${g.pos(c[0], c[1])}"><b class="drag${S.t === 'room' && S.i === ri ? ' on' : ''}" data-k="lbl:room:${ri}" style="${rc ? `color:${rc};` : ''}${sh}">${esc(r.name || r.id)}</b></div>`; return; }
      const vOk = !fx || fx.lay.werte, rw = this._roomVals(), t = r.temperature && vOk && rw.temp ? st[resolveEnt(st, r.temperature)] : null, hu = r.humidity && vOk && rw.hum ? st[resolveEnt(st, r.humidity)] : null, aqS = r.air_quality && vOk && rw.air ? st[resolveEnt(st, r.air_quality)] : null;
      if (this._tafel()) {
        if (this._footOn()) return;   // Ausschnitt: Werte stehen unter dem Grundriss
        const RR = this._roomRows(fl, r, st, fx);
        if (RR) { const rn0 = this._rnOn(labels) && r.name; if (!rn0 && !RR.row1 && !RR.row2) return; const nc = rc || '', dk = nc && lumHex(nc) < .42, nsh = dk ? 'text-shadow:0 0 2px rgba(255,255,255,.95),0 0 6px rgba(255,255,255,.6);' : '';
          h += `<div class="room tafel" style="${g.pos(c[0], c[1])}"><div class="tf">${rn0 ? `<b ${this._areaAct(r)} style="${nc && !dk ? `color:${nc};` : ''}">${esc(r.name)}</b>` : ''}${RR.row1}${RR.row2}</div></div>`; return; }
        const f1 = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const hd = heatData.get(roomGrp(r)) || [], cid = r.climate ? resolveEnt(st, r.climate) : hd[0] && hd[0].d.entity, cs = cid ? st[cid] : null, ca = (cs && cs.attributes) || {}, heat = cs ? heatingOn(cs) : false;
        const tsrc = r.temp_src || 'auto', hsrc = r.hum_src || 'auto';
        let ist = null, istE = null; if (rw.temp && (!fx || fx.lay.werte || fx.lay.heizung)) { if (tsrc !== 'thermostat' && t && sOk(t)) { ist = fmt(t); istE = resolveEnt(st, r.temperature); } else if (tsrc !== 'sensor' && ca.current_temperature != null) { ist = f1(ca.current_temperature) + '°'; istE = cid; } }
        let fe = null, feE = null; if (rw.hum) { if (hsrc !== 'thermostat' && hu && sOk(hu)) { fe = fmt(hu); feE = resolveEnt(st, r.humidity); } else if (hsrc !== 'sensor' && ca.current_humidity != null) { fe = Math.round(ca.current_humidity) + ' %'; feE = cid; } }
        const soll = cs && sOk(cs) && ca.temperature != null && (!fx || fx.lay.heizung) ? f1(ca.temperature) + '°' : null;
        const rv = (ent, ic, lab, val, cls = '', col = '') => val ? `<span class="rv ${cls}" data-act="more:${esc(ent)}" style="${col ? `color:${col};` : ''}">${svgI(ic)}${lab ? `<i>${lab}</i>` : ''}${val}</span>` : '';
        const row1 = rv(istE, 'temp', 'Ist', ist, 'ist') + rv(cid, heat ? 'flame' : 'tset', 'Soll', soll, 'soll' + (heat ? ' heat' : ''));
        const row2 = rv(feE, 'hum', '', fe, 'h') + rv(aqS ? resolveEnt(st, r.air_quality) : '', 'aq', '', aqS && sOk(aqS) ? fmt(aqS) : '', 'a', aqCol(aqS)) + (fx && fx.motion.has(r.id) ? `<span class="rv m">${svgI('motion')}</span>` : '');
        const rn0 = this._rnOn(labels) && r.name;
        if (!rn0 && !row1 && !row2) return;
        const nc = rc || '', dk = nc && lumHex(nc) < .42, nsh = dk ? 'text-shadow:0 0 2px rgba(255,255,255,.95),0 0 6px rgba(255,255,255,.6);' : '';
        h += `<div class="room tafel" style="${g.pos(c[0], c[1])}"><div class="tf">${rn0 ? `<b ${this._areaAct(r)} style="${nc && !dk ? `color:${nc};` : ''}">${esc(r.name)}</b>` : ''}${row1 ? `<div class="tv">${row1}</div>` : ''}${row2 ? `<div class="tv">${row2}</div>` : ''}</div></div>`;
        return;
      }
      if (this._footOn()) { const rn1 = this._rnOn(labels) && r.name; if (rn1) h += `<div class="room" style="${g.pos(c[0], c[1])}"><b ${this._areaAct(r)} style="${rc ? `color:${rc};` : ''}${sh}">${esc(r.name)}</b></div>`; return; }
      const vals = t || hu ? `<div class="pill" ${r.temperature || r.humidity ? `data-act="more:${esc(r.temperature || r.humidity)}"` : ''} style="pointer-events:auto;cursor:pointer">${t ? svgI('temp') + fmt(t) : ''}${hu ? `<small>${fmt(hu)}</small>` : ''}</div>` : '';
      const mot = fx && fx.motion.has(r.id) ? `<div class="mot" title="Bewegung">${svgI('motion')}</div>` : '';
      const hp = heatIn.get(roomGrp(r)) || '';
      const rn = this._rnOn(labels) && r.name;
      if (!rn && !vals && !mot && !hp) return;
      h += `<div class="room" style="${g.pos(c[0], c[1])}">${rn ? `<b ${this._areaAct(r)} style="${rc ? `color:${rc};` : ''}${sh}">${esc(r.name)}</b>` : ''}${vals}${hp}${mot}</div>`;
    });
    const idv = this._ids ?? this._cfg.ids ?? (sty.ids === false ? false : undefined), showId = (labels && idv !== false) || idv === true;
    fl.openings.forEach((o, oi) => {
      if (!o.entity && !ed) return;
      if (!ed && !g.inside(o.x, o.y)) return;
      if (vr && !opRooms(fl, o).some(r => roomGrp(r) === vr)) return;
      const s = o.entity ? contactState(st, o) : 'na', [col] = ocol(o, s), tc = o.label_color ? `color:${o.label_color};` : '';
      const off = o.label_dx != null, pos = off ? g.pos(o.x + num(o.label_dx), o.y + num(o.label_dy)) : g.pos(o.x, o.y);
      const tr = off ? 'translate(-50%,-50%)' : `translate(-50%,-50%) translate(${(-Math.sin(o.rotate * Math.PI / 180 + g.rot * Math.PI / 180) * 1.7).toFixed(2)}em,${(Math.cos(o.rotate * Math.PI / 180 + g.rot * Math.PI / 180) * 1.7).toFixed(2)}em)`;
      if (ed) { h += `<div class="oid drag${S.t === 'op' && S.i === oi ? ' on' : ''}" data-k="lbl:op:${oi}" style="${pos};--c:${col};--g:${col}66;${tc}transform:${tr}">${esc(o.id)}</div>`; return; }
      const act = info ? `info:${fl.id}/${oi}` : `more:${esc(resolveEnt(st, o.entity))}`, pz = fx && fx.pulse.has(oi) ? ' pz' : '';
      if (showId) h += `<div class="oid ${s}${pz}${o.type === 'door' ? ' door' : ''}" data-act="${act}" style="${pos};--c:${col};--g:${col}66;${tc}transform:${tr}">${esc(o.id)}</div>`;
      if (!showId || info) h += `<div class="oph" data-act="${act}" style="${g.pos(o.x, o.y)}"></div>`;
    });
    fl.devices.forEach((d, di) => {
      let x = num(d.x), y = num(d.y);
      [x, y] = pillPos(d);
      const nf = d.label_dx != null ? g.pos(x + num(d.label_dx), y + num(d.label_dy)) : null;
      if (ed) { h += this._devHtml(d, st, true, g.pos(x, y), S.t === 'dev' && S.i === di ? 'sel' : '', `data-k="${mountRot(d) != null ? 'pill' : 'dev'}:${di}"`, nf, `lbl:dev:${di}`); return; }
      if (d.type === 'bleproxy' && (this._cfg.ble_proxys === false || this._cfg.ble_proxies === false)) return;
      if (only && d.type !== 'tracker' && !devIn(d)) return;
      if (heatSet.has(d)) return;
      if (d.type === 'tablet' && (d.hide_icon ?? sty.tab_hide)) return;
      if (fx) { const t = d.type, L0 = fx.lay; if (!((t === 'tablet' && (this._cfg.tablets === true || hereMatch(d, this._cfg))) || ((t === 'light' || t === 'switch') && L0.licht) || (t === 'climate' && L0.heizung) || (t === 'binary' && L0.bewegung) || (t === 'tracker' && L0.ble) || (t === 'sensor' && L0.werte))) return; }
      if (d.type === 'tracker') {
        const a = ((st[d.entity] || {}).attributes) || {};
        if (a.x == null || a.y == null) return;
        if (a.floor != null && String(a.floor) !== fl.id) return;
        x = num(a.x); y = num(a.y);
      }
      if (!g.inside(x, y)) return;
      h += this._devHtml(d, st, labels, g.pos(x, y), '', '', d.label_dx != null ? g.pos(x + num(d.label_dx), y + num(d.label_dy)) : null);
      if (d.lamp === 'rope') (d.spots || []).forEach(q => { if (q.entity && g.inside(num(q.x), num(q.y))) h += `<div class="oph" data-act="toggle:${esc(q.entity)}" style="${g.pos(num(q.x), num(q.y))};width:1.4em;height:1.4em"></div>`; });
    });
    return h;
  }
  _legend(fl, st) {
    const groups = new Map(), roomName = (x, y) => { const r = fl.rooms.find(r => r.points.length >= 3 && pip([x, y], r.points)); return r ? (r.part_of && fl.rooms.find(q => q.id === r.part_of)) || r : null; };
    const add = (r, row) => { const k = r ? r.id : '_'; if (!groups.has(k)) groups.set(k, { r, rows: [] }); groups.get(k).rows.push(row); };
    fl.rooms.forEach(r => { if (!r.part_of && !groups.has(r.id)) groups.set(r.id, { r, rows: [] }); });
    fl.openings.forEach(o => {
      if (!o.entity) return;
      const s = contactState(st, o), [col, txt] = ocol(o, s), f = st[resolveEnt(st, o.entity)];
      add(roomName(o.x + -Math.sin(o.rotate * Math.PI / 180) * .3, o.y + Math.cos(o.rotate * Math.PI / 180) * .3), `<div class="r" data-act="more:${esc(resolveEnt(st, o.entity))}" style="--c:${col}"><span class="led"></span><span class="n">${esc(o.id)} ${esc(o.name || (f && f.attributes.friendly_name) || '')}</span><b>${txt}</b></div>`);
    });
    fl.devices.forEach(d => {
      (d.spots || []).forEach((q, k) => { if (!q.entity) return; const ss = st[q.entity], on = isOn(ss), b = ss && ss.attributes && ss.attributes.brightness; add(roomName(num(q.x), num(q.y)), `<div class="r" data-act="more:${esc(q.entity)}" style="--c:${on ? lightCol(ss) : '#979ca5'}"><span class="led"></span><span class="n">${esc((ss && ss.attributes.friendly_name) || `Spot ${k + 1}`)}</span><b>${!sOk(ss) ? '--' : on ? (b != null ? Math.round(b / 2.55) + '%' : 'AN') : 'AUS'}</b></div>`); });
      if (!d.entity || d.type === 'tracker') return;
      const s = st[d.entity], name = d.name || (s && s.attributes.friendly_name) || d.entity;
      let val = '--', col = '#979ca5';
      if (sOk(s)) {
        if (d.type === 'light') { const on = isOn(s), b = s.attributes.brightness; val = on ? (b != null ? Math.round(b / 2.55) + '%' : 'AN') : 'AUS'; col = on ? lightCol(s) : '#979ca5'; }
        else if (d.type === 'switch' || d.type === 'binary') { const on = isOn(s); val = on ? 'AN' : 'AUS'; col = on ? '#ffd166' : '#979ca5'; }
        else if (d.type === 'climate') { const a = s.attributes; val = `${a.current_temperature ?? '--'}° › ${a.temperature ?? '--'}°`; col = a.hvac_action === 'heating' ? '#ff8a3d' : '#c9ccd2'; }
        else { val = fmt(s); col = '#c9ccd2'; }
      }
      add(roomName(num(d.x), num(d.y)), `<div class="r" data-act="more:${esc(d.entity)}" style="--c:${col}"><span class="led"></span><span class="n">${esc(name)}</span><b>${esc(val)}</b></div>`);
    });
    let h = '';
    groups.forEach(({ r, rows }) => {
      if (!rows.length && !(r && (r.temperature || r.humidity))) return;
      const t = r && r.temperature ? st[r.temperature] : null, hu = r && r.humidity ? st[r.humidity] : null;
      h += `<div><h3>${esc(r ? r.name || r.id : 'Ohne Raum')}<span>${t ? fmt(t) : ''}${hu ? ' · ' + fmt(hu) : ''}</span></h3>${rows.join('')}</div>`;
    });
    return h || '<p style="color:#979ca5">Noch keine Geräte eingetragen.</p>';
  }
  // ---------------------------------------------------------- BLE (home_twin)
  _bleWanted() { const c = this._cfg || {}; if (this._multi() || (this._teil && this._teil !== 'plan')) return false; if (c._win) return !!(this._lay && this._lay.ble); return c.ble === true || (c.ble !== false && !c.view); }
  _bleStart() {
    if (this._bleUnsub || !this._hass || !this.isConnected || !this._cfg || !this._bleWanted() || this._bleOff) return;
    const p = this._bleUnsub = this._hass.connection.subscribeMessage(m => this._bleMsg(m), { type: 'home_twin/ble/subscribe' });
    p.catch(() => { this._bleUnsub = null; this._bleOff = true; });
  }
  _bleStop() { if (this._bleUnsub) { this._bleUnsub.then(u => u()).catch(() => {}); this._bleUnsub = null; } }
  _bleMsg(m) {
    if (m.full) this._ble = new Map((m.devices || []).map(d => [d.a, d]));
    (m.upd || []).forEach(d => this._ble.set(d.a, d));
    (m.del || []).forEach(a => this._ble.delete(a));
    if (m.scanners) { this._bleSc = m.scanners; this._bleScDirty = true; }
    if (this._bleT) return;
    this._bleT = setTimeout(() => {
      this._bleT = null;
      if (this._edit) { if (this._bleScDirty) { this._bleScDirty = false; this._editRender(); if (this._sel && this._sel.t === 'dev') this._side(); } return; }
      if (this._bleScDirty) { this._bleScDirty = false; this._paint(); }
      this._paintBle();
    }, 700);
  }
  _scObj(src, name) {
    const k = String(src || '').toUpperCase(), nn = v => String(v || '').replace(/\s*\([0-9A-F:]{17}\)\s*$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return (this._bleSc || []).find(x => k ? x.src === k : name && nn(x.n) === nn(name));
  }
  _scName(src) { const s = this._scObj(src); return s ? String(s.n || src).replace(/\s*\([0-9A-F:]{17}\)\s*$/i, '') : ''; }
  _scOn(src, name) { const s = this._scObj(src, name); return s ? s.last != null && s.last < 30 : null; }
  _bleModeGet() {
    if (this._cfg._win) return 'bekannt'; // Modus fenster: nur hinzugefügte Geräte (Personen)
    if (this._bleMode) return this._bleMode;
    let m = null; try { m = localStorage.getItem('haus-grundriss:ble'); } catch (e) { /* egal */ }
    return m || (this._cfg.ble_unbekannte === false ? 'bekannt' : 'alle');
  }
  _paintBle() {
    const box = this.shadowRoot.getElementById('ble'); if (!box || this._edit || !this._plan) return;
    const mode = this._bleModeGet();
    if (mode === 'aus' || !this._bleWanted()) { box.innerHTML = ''; return; }
    const fl = this._fl(), g = this._geom(), now = Date.now() / 1000;
    let h = '';
    for (const d of this._ble.values()) {
      const p = d.pos;
      if (!p || p.f !== fl.id || now - d.ls > 120) continue;
      const known = !!d.tag;
      if (!known && mode !== 'alle') continue;
      // Geräte am selben Proxy leicht auffächern, damit sie nicht übereinander liegen
      let x = p.x, y = p.y;
      if (p.n === 1) { let hs = 0; for (const ch of d.a) hs = (hs * 31 + ch.charCodeAt(0)) >>> 0; const an = (hs % 360) * Math.PI / 180, r = Math.min(Math.max(p.acc, .3), .7) * .8; x += Math.cos(an) * r; y += Math.sin(an) * r; }
      if (!g.inside(x, y)) continue;
      const nm = known ? d.tag.name : (d.n || '');
      if (known) h += `<div class="acc" style="${g.pos(p.x, p.y)};width:${(Math.max(.3, p.acc) * 2 / g.vb[2] * 100).toFixed(2)}%"></div>`;
      h += known
        ? `<div class="bt" data-ble="${esc(d.a)}" style="${g.pos(x, y)}" title="${esc(nm)}${p.rn ? ' · ' + esc(p.rn) : ''}">${d.tag.image ? `<div class="ic img"><img src="${esc(d.tag.image)}" alt=""></div>` : `<div class="ic">${icoH(d.tag.icon, 'person')}</div>`}<div class="nm">${esc(nm)}</div></div>`
        : `<div class="bt unk${d.ak === 'rpa' ? ' rpa' : ''}" data-ble="${esc(d.a)}" style="${g.pos(x, y)}" title="${esc(nm || 'Unbekannt')} · ${esc(d.t || '')}"><div class="dotq">?</div></div>`;
    }
    box.innerHTML = h;
    if (this._bleOpen) this._bleInfo(this._bleOpen);
  }
  _bleInfo(addr) {
    this._bleOpen = addr;
    let m = this.shadowRoot.getElementById('blem');
    if (!m) {
      m = document.createElement('div'); m.id = 'blem'; m.className = 'blem'; this.shadowRoot.appendChild(m);
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) { this._bleOpen = null; m.remove(); } });
    }
    const d = this._ble.get(addr), H = window.HomeTwinBle;
    const body = !d ? '<p>Das Gerät wird gerade nicht empfangen.</p>' : H ? H.infoHtml(d, this._bleSc)
      : `<b>${esc((d.tag && d.tag.name) || d.n || 'Unbekannt')}</b><p>${esc(d.a)}</p>`;
    const p = d && d.pos;
    const pos = p ? `<p style="opacity:.7;font-size:.9em;margin:10px 0 0">Position ${p.x} / ${p.y} m · Genauigkeit ±${p.acc} m · ${p.n} Proxy${p.n > 1 ? 's' : ''}${p.rn ? ' · Raum ' + esc(p.rn) : ''}</p>` : '';
    const box = m.querySelector('.box'), top = box ? box.scrollTop : 0;
    m.innerHTML = `<style>${H ? H.css : ''}</style><div class="box">${body}${pos}<div class="fuss"><span>${d && !d.tag ? 'Hinzufügen: Dashboard „BLE anlernen“ → BLE live' : ''}</span><button class="btn" data-x>Schließen</button></div></div>`;
    m.querySelector('.box').scrollTop = top;
  }
  _click(e) {
    if (this._held) { this._held = false; return; }
    if (this._panned) { this._panned = false; return; }
    const t = e.composedPath().find(n => n.dataset && (n.dataset.act || n.dataset.a || n.dataset.fl || n.dataset.ble || n.dataset.ly));
    if (!t) return;
    if (t.dataset.ly) { this._lay[t.dataset.ly] = !this._lay[t.dataset.ly]; this._sig = ''; if (this._lay.ble) this._bleStart(); this._render(); this._share(); return; }
    if (t.dataset.ble) { this._bleInfo(t.dataset.ble); return; }
    if (t.dataset.a === 'ble') { const o = ['alle', 'bekannt', 'aus'], m = o[(o.indexOf(this._bleModeGet()) + 1) % 3]; this._bleMode = m; try { localStorage.setItem('haus-grundriss:ble', m); } catch (er) { /* egal */ } this._render(); this._share(); return; }
    if (t.dataset.fl) { this._floor = t.dataset.fl; this._z = null; this._render(); this._share(); return; }
    if (t.dataset.a === 'labels') { this._labels = !(this._labels ?? this._cfg.labels); this._render(); this._share(); return; }
    if (t.dataset.a === 'ids') { const L0 = this._labels ?? this._cfg.labels, iv = this._ids ?? this._cfg.ids ?? ((this._plan.style || {}).ids === false ? false : undefined), on = (L0 && iv !== false) || iv === true; this._ids = !on; this._render(); this._share(); return; }
    if (t.dataset.a === 'dim') { this._dim = this._is3d() ? '2d' : '3d'; try { localStorage.setItem(this._dimKey(), this._dim); } catch (e) { /* egal */ } this._sig = ''; this._render(); return; }
    if (t.dataset.a === 'v3half') { const M = ['schraeg', 'halb', 'voll'], n = M[(M.indexOf(this._wallMode()) + 1) % 3]; try { localStorage.setItem('haus-grundriss:3d-wand', n); } catch (e) { /* egal */ } this._render(); return; }
    if (t.dataset.a === 'rnames') { this._rn = !this._rnOn(this._labels ?? this._cfg.labels); this._render(); this._share(); return; }
    if (t.dataset.a === 'v3bldm') { this._bldOpen = !this._bldOpen; this._render(); return; }
    if (t.dataset.a && t.dataset.a.startsWith('bldset:')) { const [, k, v] = t.dataset.a.split(':'); try { localStorage.setItem(k === 'mode' ? 'haus-grundriss:gebaeude' : 'haus-grundriss:gb-' + k, v); } catch (e) { /* egal */ } this._render(); return; }
    if (t.dataset.a === 'v3reset') { if (this._v3) this._v3.reset(); return; }
    if (t.dataset.a === 'v3dims') { const on = !this._v3dimsOn(); try { localStorage.setItem('haus-grundriss:3d-masse', on ? '1' : '0'); } catch (e) { /* egal */ } t.classList.toggle('on', on); if (this._v3) this._v3.dims(on); return; }
    if (t.dataset.a === 'edit') { this._startEdit(); return; }
    const [a, id] = t.dataset.act.split(/:(.+)/);
    if (!id || id === 'undefined') return;
    if (a === 'nav') { history.pushState(null, '', id); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); return; }
    if (a === 'info') { const [f, i] = id.split('/'); this._opInfo({ f, i: +i }); return; }
    if (a === 'area') { this._areaInfo({ area: id }); return; }
    if (a === 'toggle') this._hass.callService('homeassistant', 'toggle', { entity_id: id });
    else this._more(id);
  }
  _more(id) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true })); }
  _bindHold(el) {
    let tm = null;
    el.addEventListener('pointerdown', e => {
      const t = e.composedPath().find(n => n.dataset && n.dataset.act); if (!t) return;
      if (/^nav:/.test(t.dataset.act)) return;
      tm = setTimeout(() => { if (this._panning) return; this._held = true; this._more(t.dataset.act.split(/:(.+)/)[1]); }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(tm)));
  }

  // ---------------------------------------------------------- Zoom / Verschieben (Anzeige)
  _zoomOn() { if (this._is3d()) return false; const c = this._cfg, o = c.zoomen ?? c.pan_zoom; return o != null ? o !== false : !c.view; }
  _zoomMax() { return clamp(num(this._cfg.zoom_max, 6), 1.5, 20); }
  _zApply() {
    const r = this.shadowRoot, zm = r.getElementById('zm'), ar = r.getElementById('ar'), box = r.querySelector('.planbox'); if (!zm) return;
    const z = this._z || { s: 1, x: 0, y: 0 }, w = ar.clientWidth, h = ar.clientHeight;
    // Fläche noch ohne Größe (direkt nach dem Neuaufbau, --ar noch nicht gesetzt): nicht klemmen, sonst springt der Ausschnitt nach oben links
    if (w && h) { z.x = clamp(z.x, w - w * z.s, 0); z.y = clamp(z.y, h - h * z.s, 0); }
    const on = z.s > 1.001;
    zm.style.transform = on ? `translate(${z.x.toFixed(1)}px,${z.y.toFixed(1)}px) scale(${z.s.toFixed(4)})` : '';
    // Symbole/Beschriftungen behalten beim Zoomen ungefähr ihre Bildschirmgröße (wachsen leicht mit)
    zm.style.setProperty('--zi', Math.pow(z.s, -0.8).toFixed(4));
    ar.classList.toggle('zoomed', on); if (box) box.classList.toggle('zin', on);
  }
  _zTo(s, px, py) {
    const ar = this.shadowRoot.getElementById('ar'); if (!ar) return;
    const z = this._z || { s: 1, x: 0, y: 0 }, w = ar.clientWidth, h = ar.clientHeight;
    if (px == null) { px = w / 2; py = h / 2; }
    s = clamp(s, 1, this._zoomMax());
    z.x = px - (px - z.x) * s / z.s; z.y = py - (py - z.y) * s / z.s; z.s = s;
    this._z = s > 1.001 ? z : null; this._zApply();
  }
  _bindZoom() {
    const r = this.shadowRoot, box = r.querySelector('.planbox'), ar = r.getElementById('ar');
    if (!box || !ar || !this._zoomOn()) return;
    box.classList.add('zmok'); this._zApply();
    const rel = e => { const b = ar.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const zs = () => (this._z ? this._z.s : 1);
    box.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = rel(e); this._zTo(zs() * Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1)), x, y); }, { passive: false });
    box.addEventListener('click', e => { const b = e.composedPath().find(n => n.dataset && n.dataset.z); if (!b) return; e.stopPropagation(); const k = b.dataset.z; if (k === 'reset') this._zTo(1); else this._zTo(zs() * (k === 'in' ? 1.6 : 1 / 1.6)); });
    box.addEventListener('dblclick', e => {
      if (e.composedPath().find(n => n.dataset && (n.dataset.act || n.dataset.z || n.dataset.ble))) return;
      const [x, y] = rel(e); if (zs() > 1.001) this._zTo(1); else this._zTo(2.5, x, y);
    });
    // Ein Finger/Maus: verschieben (nur gezoomt), zwei Finger: Pinch-Zoom
    const pts = new Map(); let last = null, start = null;
    const state = () => { const v = [...pts.values()]; if (!v.length) return null; return { cx: v.reduce((a, p) => a + p[0], 0) / v.length, cy: v.reduce((a, p) => a + p[1], 0) / v.length, d: v.length > 1 ? Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) : 0, n: v.length }; };
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.composedPath().find(n => n.dataset && n.dataset.z)) return;
      pts.set(e.pointerId, rel(e)); last = state();
      if (pts.size === 1) { start = rel(e); this._panning = false; } else this._panning = true;
    });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, rel(e));
      const st = state();
      if (!last || st.n !== last.n) { last = st; return; }
      if (!this._panning) {
        if (zs() <= 1.001 || Math.hypot(st.cx - start[0], st.cy - start[1]) < 8) return;
        this._panning = true; try { box.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
      }
      box.classList.add('pan');
      if (st.n > 1 && last.d > 0) this._zTo(zs() * st.d / last.d, st.cx, st.cy);
      if (this._z) { this._z.x += st.cx - last.cx; this._z.y += st.cy - last.cy; this._zApply(); }
      last = st; e.preventDefault();
    });
    const up = e => {
      if (!pts.delete(e.pointerId)) return;
      last = state();
      if (!pts.size) { box.classList.remove('pan'); if (this._panning) { this._panned = true; setTimeout(() => { this._panned = false; }, 350); } this._panning = false; }
    };
    ['pointerup', 'pointercancel'].forEach(ev => box.addEventListener(ev, up));
    this._zRo = this._zRo || new ResizeObserver(() => !this._edit && this._zApply());
    this._zRo.disconnect(); this._zRo.observe(ar);
  }

  // ---------------------------------------------------------- Editor
  _startEdit() {
    this._edit = true; this._dirty = false; this._tool = 'sel'; this._sel = null; this._newDev = 'light'; this._newSym = 'sofa'; this._newArea = this._newArea || 'lawn';
    this._hist = [JSON.stringify(this._plan)]; this._hi = 0; this._vb = null;
    this._baseRev = this._src && this._src.mode === 'twin' ? this._src.rev : null;  // Stand, auf dem die Bearbeitung beruht (Konfliktprüfung)
    try { const h = JSON.parse(localStorage.getItem('haus-grundriss:views-hidden') || '{}'); this._vAll = !!h.all; this._vHid = new Set(h.ids || []); } catch (_) { this._vAll = false; this._vHid = new Set(); }
    if (!this._floor) this._floor = this._fl().id;
    const key = e => this._key(e); window.addEventListener('keydown', key); this._keyOff = () => window.removeEventListener('keydown', key);
    this._editBuild();
  }
  _stopEdit() {
    if (this._dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    const src = this._src;
    if (src && src.mode === 'twin' && src.plan) this._plan = src.plan;  // neuester Stand aus der DB
    else if (this._dirty) this._plan = normPlan(JSON.parse(this._hist[0]));
    this._edit = false; this._keyOff && this._keyOff(); this._render(true);
  }
  _edStatus() {
    const el = this.shadowRoot.getElementById('srcst'); if (!el) return;
    const s = this._src, tw = s && s.mode === 'twin';
    el.textContent = tw ? (s.writable ? `● DB · Rev ${s.rev}` : '● DB offline · nur lesen') : '● Lovelace';
    el.style.color = tw ? (s.writable ? '#6fcf8a' : '#e0a040') : '#80858f';
    el.title = tw ? (s.writable ? 'Plan liegt in der Home-Twin-Datenbank (MariaDB)' : 'Datenbank nicht erreichbar – lokale Kopie, Speichern nicht möglich') : 'Plan liegt in der Dashboard-Konfiguration (home_twin nicht aktiv)';
  }
  _editBuild() {
    const root = this.shadowRoot, P = this._plan, fl = this._fl();
    const tools = [['sel', '↖ Auswahl'], ['rect', '▭ Raum'], ['poly', '⬠ Raum frei'], ['area', '🌿 Außenfläche'], ['aline', '┅ Weg / Linie'], ['wall', '┃ Wand'], ['door', '◜ Tür'], ['passage', '▯ Durchgang'], ['window', '═ Fenster'], ['dev', '◉ Gerät'], ['furn', '▦ Möbel'], ['view', '⬚ Ausschnitt']];
    const floors = [...P.floors].sort((a, b) => b.level - a.level);
    root.innerHTML = `<style>${CSS}</style><div class="hp" style="height:${this.style.height ? '100%' : '80vh'}"><div class="ed">
      <div class="tb"><div class="grp">${floors.map(f => `<button class="btn ${f === fl ? 'on' : ''}" data-fl="${esc(f.id)}">${esc(f.name)}</button>`).join('')}<button class="btn" data-a="addfl" title="Etage hinzufügen">+</button></div>
      <div class="grp">${tools.map(([k, n]) => `<button class="btn ${this._tool === k ? 'on' : ''}" data-tool="${k}">${n}</button>`).join('')}</div>
      <div class="grp"><button class="btn" data-a="undo" title="Strg+Z">↶</button><button class="btn" data-a="redo" title="Strg+Y">↷</button><button class="btn" data-a="fit" title="Alles zeigen">⤢</button><button class="btn ${this._vAll ? '' : 'on'}" data-a="vtoggle" title="Ausschnitte im Editor ein-/ausblenden (nur Anzeige)">⬚ ${this._vAll ? 'aus' : 'an'}</button></div>
      <span class="sp"></span><span id="srcst" style="font-size:12px;letter-spacing:.04em;white-space:nowrap"></span><button class="btn" data-a="yaml">YAML</button><button class="btn ${this._dirty ? 'dirty' : ''}" data-a="save" id="save">💾 Speichern</button><button class="btn" data-a="close">✕ Fertig</button></div>
      <div class="edm"><div class="cv" id="cv"><svg id="esvg" preserveAspectRatio="xMidYMid meet"><g id="eg"></g><g id="eo"></g></svg><div class="mk" id="emk"></div><div class="hint" id="hint"></div></div><div class="side" id="side"></div></div></div><div id="modal"></div></div>`;
    this._edStatus();
    const hp = root.querySelector('.hp');
    hp.addEventListener('click', e => this._edClick(e));
    hp.addEventListener('change', e => this._edChange(e));
    const cv = root.getElementById('cv');
    cv.addEventListener('pointerdown', e => this._pd(e));
    cv.addEventListener('pointermove', e => this._pm(e));
    cv.addEventListener('pointerup', e => this._pu(e));
    cv.addEventListener('pointercancel', e => this._pu(e));
    cv.addEventListener('wheel', e => { e.preventDefault(); this._zoomAt(e, e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    cv.addEventListener('dblclick', e => this._dbl(e));
    this._editRender(); this._side();
  }
  _ppm() { const cv = this.shadowRoot.getElementById('cv'); if (!cv || !this._vb) return 50; return Math.min(cv.clientWidth / this._vb[2], cv.clientHeight / this._vb[3]) || 50; }
  _fit() {
    const bb = floorBBox(this._plan, this._fl()), cv = this.shadowRoot.getElementById('cv');
    const w = bb[2] - bb[0] + 1, h = bb[3] - bb[1] + 1, cw = (cv && cv.clientWidth) || 800, ch = (cv && cv.clientHeight) || 500, k = Math.max(w / cw, h / ch);
    this._vb = [(bb[0] + bb[2]) / 2 - cw * k / 2, (bb[1] + bb[3]) / 2 - ch * k / 2, cw * k, ch * k];
  }
  _editRender() {
    const root = this.shadowRoot, svg = root.getElementById('esvg'); if (!svg) return;
    const P = this._plan, fl = this._fl(), cv = root.getElementById('cv');
    if (!this._vb || !this._vbOk) { if (cv.clientWidth) { this._fit(); this._vbOk = true; } else this._fit(); }
    // Seitenverhältnis an die Fläche anpassen
    if (cv.clientWidth && cv.clientHeight) { const k = this._vb[2] / cv.clientWidth; this._vb[3] = cv.clientHeight * k; }
    svg.setAttribute('viewBox', this._vb.join(' '));
    const ppm = this._ppm(), px = v => v / ppm;
    // Raster
    const gs = P.grid >= .05 ? P.grid : .05, minor = gs * Math.max(1, Math.ceil(6 / (gs * ppm))), [vx, vy, vw, vh] = this._vb;
    let grid = '';
    const x0 = Math.floor(vx / minor) * minor, y0 = Math.floor(vy / minor) * minor;
    for (let x = x0; x < vx + vw; x += minor) { const m = Math.abs(x - Math.round(x)) < 1e-6; grid += `<line x1="${x.toFixed(3)}" y1="${vy}" x2="${x.toFixed(3)}" y2="${vy + vh}" stroke="${m ? '#262a31' : '#17191d'}" stroke-width="${px(1)}"/>`; }
    for (let y = y0; y < vy + vh; y += minor) { const m = Math.abs(y - Math.round(y)) < 1e-6; grid += `<line x1="${vx}" y1="${y.toFixed(3)}" x2="${vx + vw}" y2="${y.toFixed(3)}" stroke="${m ? '#262a31' : '#17191d'}" stroke-width="${px(1)}"/>`; }
    grid += `<path d="M${-px(8)} 0H${px(8)}M0 ${-px(8)}V${px(8)}" stroke="#4dc3ff" stroke-opacity=".5" stroke-width="${px(1.5)}"/>`;
    root.getElementById('eg').innerHTML = grid + floorSvg(P, fl, this._hass, this._u, true, null, (() => { const b = bldOf(P, this._cfg); return b ? { b, st: num(b.own, 0) } : null; })());
    root.getElementById('eo').innerHTML = this._overlay(fl, ppm);
    // Geräte als HTML-Marker (Pixelposition über Bildschirm-Matrix)
    const m = svg.getScreenCTM(), cr = cv.getBoundingClientRect(), st = (this._hass && this._hass.states) || {};
    let mk = '';
    if (m) mk = this._markers(fl, { pos: (x, y) => `left:${(m.a * x + m.c * y + m.e - cr.left).toFixed(1)}px;top:${(m.b * x + m.d * y + m.f - cr.top).toFixed(1)}px`, inside: () => true, rot: 0 }, true, st, true);
    const emk = root.getElementById('emk'); emk.innerHTML = mk; emk.style.setProperty('--mz', num((P.style || {}).scale, 1)); emk.style.setProperty('--rz', num((P.style || {}).room_scale, 1));
    const hints = { sel: 'Ziehen = verschieben · leere Fläche ziehen = Ansicht schieben · Mausrad = Zoom · Doppelklick auf Raumkante = Punkt einfügen', rect: 'Rechteck aufziehen = neuer Raum', poly: 'Punkte klicken · auf ersten Punkt / Doppelklick / Enter = fertig · Esc = abbrechen', area: `${(AREATYPES[this._newArea] || AREATYPES.lawn)[0]}: Punkte klicken · auf ersten Punkt / Doppelklick / Enter = fertig · Esc = abbrechen (Art rechts wählen)`, aline: `${(AREATYPES[this._newArea] || AREATYPES.lawn)[0]} als Linie: Punkte klicken · Doppelklick / Enter = fertig · Esc = abbrechen (Art rechts wählen)`, wall: 'Klick = Start, weitere Klicks = Wandzug · Doppelklick / Esc = fertig', door: 'Klick an eine Wand = Tür setzen (öffnet zur Klickseite)', passage: 'Klick an eine Wand = Durchgang (Türrahmen ohne Tür) setzen', window: 'Klick an eine Wand = Fenster setzen', dev: `Klick = ${TYPES[this._newDev]} setzen (Typ rechts wählen)`, furn: `Klick = ${(FURN[this._newSym] || ['Bild'])[0]} setzen (rechts wählen)`, view: 'Rechteck aufziehen = neuer Ausschnitt für ein Raum-Tablet' };
    root.getElementById('hint').textContent = (hints[this._tool] || '') + (this._cur ? `   ·   ${this._cur[0].toFixed(2)} / ${this._cur[1].toFixed(2)} m` : '');
    const sv = root.getElementById('save'); if (sv) sv.classList.toggle('dirty', !!this._dirty);
  }
  _overlay(fl, ppm) {
    const px = v => v / ppm, P = this._plan, sel = this._sel || {};
    let o = '';
    // Ausschnitte
    P.views.filter(v => v.floor === fl.id && (!(this._vAll || (this._vHid && this._vHid.has(v.id))) || (sel.t === 'view' && P.views[sel.i] === v))).forEach((v, _) => {
      const k = P.views.indexOf(v), on = sel.t === 'view' && sel.i === k, col = on ? '#4dc3ff' : '#a36bff';
      o += `<g data-k="view:${k}"><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${col}" fill-opacity="${on ? .08 : .03}" pointer-events="none"/><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="none" stroke="transparent" stroke-width="${px(12)}" pointer-events="stroke"/><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="none" stroke="${col}" stroke-width="${px(on ? 2 : 1.4)}" stroke-dasharray="${px(8)} ${px(5)}" pointer-events="none"/>`;
      const r = deg(v.rotate), edge = r === 90 ? [v.x, v.y + v.h, v.x, v.y] : r === 180 ? [v.x + v.w, v.y + v.h, v.x, v.y + v.h] : r === 270 ? [v.x + v.w, v.y, v.x + v.w, v.y + v.h] : [v.x, v.y, v.x + v.w, v.y];
      o += `<line x1="${edge[0]}" y1="${edge[1]}" x2="${edge[2]}" y2="${edge[3]}" stroke="${col}" stroke-width="${px(4)}"/>`;
      o += `<text x="${v.x + px(6)}" y="${v.y + px(16)}" fill="${col}" font-size="${px(13)}" font-family="Rajdhani,sans-serif" font-weight="700">⬚ ${esc(v.name || v.id)} (${esc(v.id)}) · oben ▬</text></g>`;
      if (on) o += `<rect data-k="vh:${k}" x="${v.x + v.w - px(7)}" y="${v.y + v.h - px(7)}" width="${px(14)}" height="${px(14)}" fill="#4dc3ff"/>`;
    });
    // Ausgewählte Leuchte: Richtungsgriffe + Seilenden
    if (sel.t === 'dev' && fl.devices[sel.i] && fl.devices[sel.i].type === 'light') {
      const d = fl.devices[sel.i];
      emitters(d).forEach(em => {
        const bs = beamShape(em);
        if (bs.t === 'e') o += `<ellipse cx="${bs.cx}" cy="${bs.cy}" rx="${bs.a}" ry="${bs.b}" transform="rotate(${bs.rot} ${bs.cx} ${bs.cy})" fill="#ffd166" fill-opacity=".06" stroke="#ffd166" stroke-opacity=".7" stroke-width="${px(1.2)}" stroke-dasharray="${px(5)} ${px(4)}" pointer-events="none"/>`;
        else o += `<path d="${em.spread >= 359 ? `M${em.x - em.R} ${em.y}a${em.R} ${em.R} 0 1 0 ${2 * em.R} 0a${em.R} ${em.R} 0 1 0 ${-2 * em.R} 0` : beamPath(em)}" fill="#ffd166" fill-opacity=".06" stroke="#ffd166" stroke-opacity=".7" stroke-width="${px(1.2)}" stroke-dasharray="${px(5)} ${px(4)}" pointer-events="none"/>`;
        if (d.lamp === 'rope' && em.k === this._spotK) o += `<circle cx="${em.x}" cy="${em.y}" r="${px(11)}" fill="none" stroke="#ffb347" stroke-width="${px(2)}" pointer-events="none"/>`;
        if (em.spread < 359 && (d.lamp !== 'rope' || em.k === this._spotK)) { const a = em.dir * Math.PI / 180, hd = Math.min(em.R * .55, px(d.lamp === 'rope' ? 26 : 60)), hx = em.x + Math.sin(a) * hd, hy = em.y - Math.cos(a) * hd; o += `<line x1="${em.x}" y1="${em.y}" x2="${hx}" y2="${hy}" stroke="#ffd166" stroke-width="${px(1.5)}" pointer-events="none"/><circle data-k="aim:${sel.i}:${em.k}" cx="${hx}" cy="${hy}" r="${px(d.lamp === 'rope' ? 5 : 7)}" fill="#ffd166" stroke="#0b0c0e" stroke-width="${px(1.5)}" style="cursor:grab"/>`; }
      });
      if (d.lamp === 'rope') (d.spots || []).forEach((q, k) => { o += `<circle data-k="spot:${sel.i}:${k}" cx="${q.x}" cy="${q.y}" r="${px(8)}" fill="transparent" style="cursor:move"/>`; });
      if (d.lamp === 'rope') ropeLines(d).forEach((L, li) => L.forEach((q, j) => { o += `<rect data-k="rp:${sel.i}:${li}:${j}" x="${q[0] - px(6)}" y="${q[1] - px(6)}" width="${px(12)}" height="${px(12)}" fill="#0b0c0e" stroke="#ffd166" stroke-width="${px(2)}" style="cursor:move"/>`; }));
    }
    // Auswahl
    if (sel.t === 'room' || sel.t === 'edge' || sel.t === 'vtx') {
      const r = fl.rooms[sel.i]; if (r) {
        o += `<path d="M${r.points.map(p => p.join(' ')).join('L')}Z" fill="#4dc3ff" fill-opacity=".08" stroke="#4dc3ff" stroke-width="${px(2)}" pointer-events="none"/>`;
        let vs = '';
        r.points.forEach((p, j) => {
          const q = r.points[(j + 1) % r.points.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          const tw = r.wall_thickness ? r.wall_thickness[j] : null, es = sel.t === 'edge' && sel.j === j;
          if (es) o += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#ffb347" stroke-width="${px(5)}" pointer-events="none"/>`;
          o += `<line data-k="edge:${sel.i}:${j}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="transparent" stroke-width="${px(10)}" style="cursor:pointer"/>`;
          if (len > .2) {
            // Länge etwas in den Raum versetzt, damit der Griff auf der Kante sie nicht verdeckt
            let nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len, mx0 = (p[0] + q[0]) / 2, my0 = (p[1] + q[1]) / 2;
            if (!pip([mx0 + nx * .01, my0 + ny * .01], r.points)) { nx = -nx; ny = -ny; }
            const mx = mx0 + nx * px(15), my = my0 + ny * px(15); o += `<text x="${mx}" y="${my}" fill="#4dc3ff" font-size="${px(12)}" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" paint-order="stroke" stroke="#0b0c0e" stroke-width="${px(3)}" pointer-events="none">${(len * 100).toFixed(0)}${tw != null ? ` ▮${Math.round(tw * 100)}` : ''}</text>`; }
          const nb = Math.min(...r.points.filter((_, m) => m !== j).map(t => Math.hypot(t[0] - p[0], t[1] - p[1]))) * ppm, vr = clamp(nb / 2 - 1, 3, 6);
          const vsel = sel.t === 'vtx' && sel.j === j;
          vs += `<circle data-k="vtx:${sel.i}:${j}" cx="${p[0]}" cy="${p[1]}" r="${px(vr)}" fill="${vsel ? '#ffb347' : '#0b0c0e'}" stroke="${vsel ? '#ffb347' : '#4dc3ff'}" stroke-width="${px(2)}"/>`;
          if (vsel) vs += `<circle cx="${p[0]}" cy="${p[1]}" r="${px(13)}" fill="none" stroke="#ffb347" stroke-width="${px(1.5)}" pointer-events="none"/><path d="M${p[0] - px(20)} ${p[1]}H${p[0] - px(15)}M${p[0] + px(15)} ${p[1]}H${p[0] + px(20)}M${p[0]} ${p[1] - px(20)}V${p[1] - px(15)}M${p[0]} ${p[1] + px(15)}V${p[1] + px(20)}" stroke="#ffb347" stroke-width="${px(1.5)}" pointer-events="none"/>`;
        });
        // Griff in der Mitte jeder Wandseite – bei kurzen Seiten nach außen versetzt, damit die Eckpunkte ihn nicht verdecken
        r.points.forEach((p, j) => {
          const q = r.points[(j + 1) % r.points.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < .005) return;
          const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          let n = [-uy, ux]; if (pip([m[0] + n[0] * .01, m[1] + n[1] * .01], r.points)) n = [uy, -ux];
          const short = len * ppm < 44, g = short ? [m[0] + n[0] * px(20), m[1] + n[1] * px(20)] : m, es = sel.t === 'edge' && sel.j === j, ang = Math.atan2(uy, ux) * 180 / Math.PI;
          if (short) {
            o += `<line x1="${m[0]}" y1="${m[1]}" x2="${g[0]}" y2="${g[1]}" stroke="#ffb347" stroke-opacity=".7" stroke-width="${px(1.2)}" stroke-dasharray="${px(3)} ${px(2)}" pointer-events="none"/>`;
            if (len > .005 && len <= .2) o += `<text x="${g[0] + n[0] * px(16)}" y="${g[1] + n[1] * px(16)}" fill="#4dc3ff" font-size="${px(11)}" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" paint-order="stroke" stroke="#0b0c0e" stroke-width="${px(3)}" pointer-events="none">${(len * 100).toFixed(0)}</text>`;
          }
          o += `<g transform="translate(${g[0]} ${g[1]}) rotate(${ang.toFixed(1)})"><rect data-k="edge:${sel.i}:${j}" x="${-px(9)}" y="${-px(4)}" width="${px(18)}" height="${px(8)}" rx="${px(2)}" fill="${es ? '#ffb347' : '#0b0c0e'}" stroke="#ffb347" stroke-width="${px(1.5)}" style="cursor:move"/></g>`;
        });
        o += vs; // Eckpunkte zuletzt → liegen immer oben
        const c = centroid(r.points);
        o += `<text x="${c[0]}" y="${c[1] + px(16)}" fill="#4dc3ff" font-size="${px(12)}" text-anchor="middle" font-family="Rajdhani,sans-serif" pointer-events="none">${area(r.points).toFixed(2)} m²</text>`;
      }
    }
    if (sel.t === 'area') {
      const a = fl.areas[sel.i]; if (a && a.points.length) {
        const P0 = a.points, d = `M${P0.map(p => p.join(' ')).join('L')}${a.line ? '' : 'Z'}`;
        o += `<path d="${d}" fill="${a.line ? 'none' : '#4dc3ff'}" fill-opacity=".08" stroke="#4dc3ff" stroke-width="${px(2)}" stroke-dasharray="${a.line ? `${px(6)} ${px(4)}` : 'none'}" pointer-events="none"/>`;
        const m = a.line ? P0.length - 1 : P0.length;
        for (let j = 0; j < m; j++) {
          const p = P0[j], q = P0[(j + 1) % P0.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          o += `<line data-k="area:${sel.i}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="transparent" stroke-width="${px(10)}" style="cursor:move"/>`;
          if (len > .2) o += `<text x="${(p[0] + q[0]) / 2}" y="${(p[1] + q[1]) / 2 - px(9)}" fill="#4dc3ff" font-size="${px(12)}" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" paint-order="stroke" stroke="#0b0c0e" stroke-width="${px(3)}" pointer-events="none">${(len * 100).toFixed(0)}</text>`;
        }
        P0.forEach((p, j) => { const on = sel.j === j; o += `<circle data-k="avtx:${sel.i}:${j}" cx="${p[0]}" cy="${p[1]}" r="${px(on ? 6 : 5)}" fill="${on ? '#ffb347' : '#0b0c0e'}" stroke="${on ? '#ffb347' : '#6fcf8a'}" stroke-width="${px(2)}" style="cursor:move"/>`; });
        const c = areaLbl(a);
        if (areaOk(a)) o += `<text x="${c[0]}" y="${c[1] + px(18)}" fill="#4dc3ff" font-size="${px(12)}" text-anchor="middle" font-family="Rajdhani,sans-serif" paint-order="stroke" stroke="#0b0c0e" stroke-width="${px(3)}" pointer-events="none">${a.line ? `${lineLen(P0).toFixed(2)} m · ${(lineLen(P0) * areaW(a)).toFixed(1)} m²` : `${area(P0).toFixed(2)} m²`}</text>`;
      }
    }
    if (sel.t === 'wall') { const w = fl.walls[sel.i]; if (w) ['a', 'b'].forEach(e => { o += `<circle data-k="wend:${sel.i}:${e}" cx="${w[e][0]}" cy="${w[e][1]}" r="${px(6)}" fill="#0b0c0e" stroke="#4dc3ff" stroke-width="${px(2)}"/>`; }); }
    if (sel.t === 'op') { const op = fl.openings[sel.i]; if (op) o += `<circle cx="${op.x}" cy="${op.y}" r="${op.length / 2 + px(6)}" fill="none" stroke="#4dc3ff" stroke-width="${px(1.5)}" stroke-dasharray="${px(4)} ${px(3)}" pointer-events="none"/>`; }
    if (sel.t === 'furn') {
      const m = fl.furniture[sel.i]; if (m) {
        const tr = `translate(${m.x} ${m.y}) rotate(${m.rotate || 0})`;
        o += `<g transform="${tr}"><rect x="${-m.w / 2}" y="${-m.h / 2}" width="${m.w}" height="${m.h}" fill="none" stroke="#4dc3ff" stroke-width="${px(1.5)}" pointer-events="none"/><rect data-k="fh:${sel.i}" x="${m.w / 2 - px(7)}" y="${m.h / 2 - px(7)}" width="${px(14)}" height="${px(14)}" fill="#4dc3ff"/><circle data-k="fr:${sel.i}" cx="0" cy="${-m.h / 2 - px(22)}" r="${px(7)}" fill="#0b0c0e" stroke="#4dc3ff" stroke-width="${px(2)}"/><line x1="0" y1="${-m.h / 2}" x2="0" y2="${-m.h / 2 - px(15)}" stroke="#4dc3ff" stroke-width="${px(1.5)}" pointer-events="none"/></g>`;
      }
    }
    // Zeichnen in Arbeit
    const d = this._draft;
    if (d && (d.t === 'rect' || d.t === 'view') && d.b) { const x = Math.min(d.a[0], d.b[0]), y = Math.min(d.a[1], d.b[1]), w = Math.abs(d.b[0] - d.a[0]), h = Math.abs(d.b[1] - d.a[1]); o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#4dc3ff" fill-opacity=".1" stroke="#4dc3ff" stroke-width="${px(1.5)}" pointer-events="none"/><text x="${x + w / 2}" y="${y + h / 2}" fill="#4dc3ff" font-size="${px(13)}" text-anchor="middle" font-family="Share Tech Mono,monospace" pointer-events="none">${(w * 100).toFixed(0)} × ${(h * 100).toFixed(0)}</text>`; }
    if (d && (d.t === 'poly' || d.t === 'wall') && d.pts.length) {
      const pts = [...d.pts, ...(this._cur ? [this._cur] : [])];
      o += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#4dc3ff" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}" pointer-events="none"/>`;
      d.pts.forEach(p => { o += `<circle cx="${p[0]}" cy="${p[1]}" r="${px(4)}" fill="#4dc3ff" pointer-events="none"/>`; });
      if (this._cur) { const a = pts[pts.length - 2], b = this._cur, len = Math.hypot(b[0] - a[0], b[1] - a[1]); o += `<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - px(8)}" fill="#4dc3ff" font-size="${px(12)}" text-anchor="middle" font-family="Share Tech Mono,monospace" pointer-events="none">${(len * 100).toFixed(0)}</text>`; }
    }
    return o;
  }
  _world(e) {
    const svg = this.shadowRoot.getElementById('esvg'), m = svg.getScreenCTM(); if (!m) return [0, 0];
    const i = m.inverse(); return [i.a * e.clientX + i.c * e.clientY + i.e, i.b * e.clientX + i.d * e.clientY + i.f];
  }
  _snap(p, noVertex, e, skipRoom, skipArea) {
    if (e && e.shiftKey) return p;
    const fl = this._fl(), lim = 9 / this._ppm();
    if (!noVertex) {
      let best = null;
      fl.rooms.forEach((r, ri) => ri !== skipRoom && r.points.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < lim && (!best || d < best.d)) best = { d, q }; }));
      fl.walls.forEach(w => [w.a, w.b].forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < lim && (!best || d < best.d)) best = { d, q }; }));
      (fl.areas || []).forEach((a, ai) => ai !== skipArea && a.points.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < lim && (!best || d < best.d)) best = { d, q }; }));
      if (best) return [best.q[0], best.q[1]];
    }
    const g = this._plan.grid; return [r2(Math.round(p[0] / g) * g), r2(Math.round(p[1] / g) * g)];
  }
  _nearEdge(p) {
    const fl = this._fl(); let best = null;
    const test = (a, b) => { const pr = proj(p, a, b); if (!best || pr.d < best.d) best = pr; };
    fl.rooms.forEach(r => r.points.forEach((a, i) => test(a, r.points[(i + 1) % r.points.length])));
    fl.walls.forEach(w => test(w.a, w.b));
    return best;
  }
  _placeOpening(op, p) {
    const e = this._nearEdge(p);
    if (e && e.d < .8) {
      let th = e.ang; const ly = [-Math.sin(th * Math.PI / 180), Math.cos(th * Math.PI / 180)];
      if ((p[0] - e.q[0]) * ly[0] + (p[1] - e.q[1]) * ly[1] < 0) th += 180;
      const g = this._plan.grid / 2;
      op.x = r2(Math.round(e.q[0] / g) * g); op.y = r2(Math.round(e.q[1] / g) * g); op.rotate = deg(th);
    } else { op.x = r2(p[0]); op.y = r2(p[1]); }
  }
  _commit() {
    this._hist = this._hist.slice(0, this._hi + 1); this._hist.push(JSON.stringify(this._plan)); this._hi = this._hist.length - 1;
    if (this._hist.length > 120) { this._hist.shift(); this._hi--; }
    this._dirty = true;
  }
  _undo(d) {
    const i = this._hi + d; if (i < 0 || i >= this._hist.length) return;
    this._hi = i; this._plan = normPlan(JSON.parse(this._hist[i])); this._sel = null; this._dirty = true;
    if (!this._plan.floors.find(f => f.id === this._floor)) this._floor = this._plan.floors[0].id;
    this._editRender(); this._side();
  }
  _pd(e) {
    const cv = this.shadowRoot.getElementById('cv'); cv.setPointerCapture(e.pointerId);
    this._ptrs = this._ptrs || new Map(); this._ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (this._ptrs.size === 2) { const [a, b] = [...this._ptrs.values()]; this._pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: [...this._vb] }; this._drag = null; return; }
    const w = this._world(e), fl = this._fl(), t = this._tool;
    const hit = e.composedPath().find(n => n.dataset && n.dataset.k), k = hit ? hit.dataset.k.split(':') : null;
    this._moved = false;
    if (k && k[0] === 'lbl') {
      const kind = k[1], i = +k[2], o = kind === 'room' ? fl.rooms[i] : kind === 'area' ? fl.areas[i] : kind === 'op' ? fl.openings[i] : fl.devices[i];
      this._sel = { t: kind === 'room' ? 'room' : kind, i }; this._side();
      const r = hit.getBoundingClientRect(), svg = this.shadowRoot.getElementById('esvg'), im = svg.getScreenCTM().inverse(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      let c0 = [im.a * cx + im.c * cy + im.e, im.b * cx + im.d * cy + im.f];
      if (kind === 'room') c0 = o.label_x != null ? [num(o.label_x), num(o.label_y)] : centroid(o.points);
      else if (kind === 'area') c0 = areaLbl(o);
      else if (o.label_dx != null) c0 = [num(o.x) + num(o.label_dx), num(o.y) + num(o.label_dy)];
      this._drag = { ty: 'lbl', kind, i, w0: w, c0 }; this._editRender(); return;
    }
    if (t === 'sel' || (k && ['vtx', 'wend', 'fh', 'fr', 'vh', 'avtx'].includes(k[0]))) {
      if (k) {
        let [ty, a, b] = k; const i = +a;
        if (ty === 'vtx') { const P = fl.rooms[i].points; let bj = +b, bd = 1e9; P.forEach((q, j) => { const d = Math.hypot(q[0] - w[0], q[1] - w[1]); if (d < bd) { bd = d; bj = j; } }); b = String(bj); }
        const selT = { rp: 'dev', pill: 'dev', spot: 'dev', rope: 'dev', aim: 'dev', edge: 'edge', room: 'room', vtx: 'vtx', wall: 'wall', wend: 'wall', op: 'op', dev: 'dev', furn: 'furn', fh: 'furn', fr: 'furn', view: 'view', vh: 'view', area: 'area', avtx: 'area' }[ty];
        const hasJ = selT === 'edge' || selT === 'vtx';
        if (selT === 'area') { const j = ty === 'avtx' ? +b : null; if (!(this._sel && this._sel.t === 'area' && this._sel.i === i && (this._sel.j ?? null) === j)) { this._sel = j == null ? { t: 'area', i } : { t: 'area', i, j }; this._side(); } }
        else if (!(this._sel && this._sel.t === selT && this._sel.i === i && (!hasJ || this._sel.j === +b))) { this._sel = hasJ ? { t: selT, i, j: +b } : { t: selT, i }; this._side(); }
        if (ty === 'edge') this._edgeDragPrep(i, +b);
        if (ty === 'spot' || (ty === 'aim' && +b >= 0)) this._spotK = +b; else if (ty === 'dev' || ty === 'pill') this._spotK = null;
        this._drag = { ty, i, sub: b, sub2: k[3], w0: w, orig: clone(selT === 'view' ? this._plan.views[i] : selT === 'area' ? fl.areas[i] : selT === 'room' || selT === 'edge' || selT === 'vtx' ? fl.rooms[i] : selT === 'wall' ? fl.walls[i] : selT === 'op' ? fl.openings[i] : selT === 'dev' ? fl.devices[i] : fl.furniture[i]) };
      } else this._drag = { ty: 'pan', c0: [e.clientX, e.clientY], vb: [...this._vb] };
      this._editRender(); return;
    }
    const s = this._snap(w, false, e);
    if (t === 'rect' || t === 'view') { this._draft = { t, a: s, b: null }; return; }
    if (t === 'poly' || t === 'area' || t === 'aline') {
      const d = this._draft && this._draft.t === 'poly' ? this._draft : (this._draft = { t: 'poly', kind: t, pts: [] });
      if (t !== 'aline' && d.pts.length >= 3 && Math.hypot(s[0] - d.pts[0][0], s[1] - d.pts[0][1]) < 12 / this._ppm()) return this._finishPoly();
      const lp = d.pts[d.pts.length - 1]; if (!lp || Math.hypot(s[0] - lp[0], s[1] - lp[1]) > .005) d.pts.push(s); this._editRender(); return;
    }
    if (t === 'wall') {
      const d = this._draft && this._draft.t === 'wall' ? this._draft : (this._draft = { t: 'wall', pts: [] });
      if (d.pts.length) { const a = d.pts[d.pts.length - 1]; if (Math.hypot(s[0] - a[0], s[1] - a[1]) > .02) { fl.walls.push({ a: [...a], b: [...s], t: this._plan.wall.inner }); this._commit(); } }
      d.pts.push(s); this._editRender(); return;
    }
    if (t === 'door' || t === 'window' || t === 'passage') {
      const n = fl.openings.filter(o => o.type === t).length + 1;
      const op = { id: ({ door: 'T', passage: 'D' }[t] || 'F') + n, type: t, x: 0, y: 0, rotate: 0, length: t === 'window' ? 1.2 : .9 };
      this._placeOpening(op, w); fl.openings.push(op); this._commit(); this._sel = { t: 'op', i: fl.openings.length - 1 }; this._tool = 'sel';
      this._editBuild(); return;
    }
    if (t === 'dev') { fl.devices.push(Object.assign({ type: this._newDev, entity: '', x: s[0], y: s[1] }, this._newDev === 'tablet' ? { typeManual: true, dashboard: '' } : {})); this._commit(); this._sel = { t: 'dev', i: fl.devices.length - 1 }; this._tool = 'sel'; this._editBuild(); return; }
    if (t === 'furn') {
      const f = FURN[this._newSym]; const m = this._newSym === 'modell' ? { model: '', x: s[0], y: s[1], w: 1, h: 1, rotate: 0 } : this._newSym === 'bild' ? { src: '', x: s[0], y: s[1], w: 1, h: 1, rotate: 0 } : { symbol: this._newSym, x: s[0], y: s[1], w: f[1], h: f[2], rotate: 0 };
      fl.furniture.push(m); this._commit(); this._sel = { t: 'furn', i: fl.furniture.length - 1 }; this._tool = 'sel'; this._editBuild(); return;
    }
  }
  _pm(e) {
    if (this._ptrs && this._ptrs.has(e.pointerId)) this._ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (this._pinch && this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), f = this._pinch.d / d, v = this._pinch.vb;
      this._vb = [v[0] + v[2] * (1 - f) / 2, v[1] + v[3] * (1 - f) / 2, v[2] * f, v[3] * f]; this._editRender(); return;
    }
    const w = this._world(e); this._cur = this._tool === 'sel' ? w : this._snap(w, false, e);
    const d = this._drag, fl = this._fl();
    if (!d) { if (this._draft) { if (this._draft.t === 'rect' || this._draft.t === 'view') this._draft.b = this._cur; } this._raf(); return; }
    if (d.ty === 'pan') { const k = this._vb[2] / this.shadowRoot.getElementById('cv').clientWidth; this._vb[0] = d.vb[0] - (e.clientX - d.c0[0]) * k; this._vb[1] = d.vb[1] - (e.clientY - d.c0[1]) * k; this._moved = true; this._raf(); return; }
    const dx = w[0] - d.w0[0], dy = w[1] - d.w0[1]; if (!this._moved && Math.hypot(dx, dy) * this._ppm() < 3) return;
    this._moved = true;
    const g = this._plan.grid, sn = v => e.shiftKey ? r2(v) : r2(Math.round(v / g) * g), o = d.orig;
    if (d.ty === 'room') { const ox = sn(o.points[0][0] + dx) - o.points[0][0], oy = sn(o.points[0][1] + dy) - o.points[0][1]; fl.rooms[d.i].points = o.points.map(p => [r2(p[0] + ox), r2(p[1] + oy)]); }
    if (d.ty === 'edge' && this._eMove) {
      const em = this._eMove, dd = (w[0] - d.w0[0]) * em.n[0] + (w[1] - d.w0[1]) * em.n[1], q = e.shiftKey ? r2(dd) : r2(Math.round(dd / g) * g);
      em.pts.forEach(([ri, pj, o0]) => { fl.rooms[ri].points[pj] = [r2(o0[0] + em.n[0] * q), r2(o0[1] + em.n[1] * q)]; });
    }
    if (d.ty === 'area') { const ox = sn(o.points[0][0] + dx) - o.points[0][0], oy = sn(o.points[0][1] + dy) - o.points[0][1]; fl.areas[d.i].points = o.points.map(p => [r2(p[0] + ox), r2(p[1] + oy)]); }
    if (d.ty === 'avtx') fl.areas[d.i].points[+d.sub] = this._snap(w, false, e, undefined, d.i);
    if (d.ty === 'vtx') { const j = +d.sub, p = this._snapEx(w, e, d.i, j); fl.rooms[d.i].points[j] = p; }
    if (d.ty === 'wall') { const ox = sn(o.a[0] + dx) - o.a[0], oy = sn(o.a[1] + dy) - o.a[1]; fl.walls[d.i].a = [r2(o.a[0] + ox), r2(o.a[1] + oy)]; fl.walls[d.i].b = [r2(o.b[0] + ox), r2(o.b[1] + oy)]; }
    if (d.ty === 'wend') fl.walls[d.i][d.sub] = this._snap(w, false, e);
    if (d.ty === 'op') { const op = fl.openings[d.i]; this._placeOpening(op, [o.x + dx, o.y + dy]); if (Math.abs(((op.rotate - o.rotate) % 360 + 540) % 360 - 180) > 90) op.rotate = deg(op.rotate + 180); }
    if (d.ty === 'dev') { fl.devices[d.i].x = sn(o.x + dx); fl.devices[d.i].y = sn(o.y + dy); }
    if (d.ty === 'pill') { const dv = fl.devices[d.i], rr = mountRot(o) * Math.PI / 180, p0 = pillPos(o), vx = p0[0] + dx - num(o.x), vy = p0[1] + dy - num(o.y); dv.pill_offset = r2(-Math.sin(rr) * vx + Math.cos(rr) * vy); dv.pill_shift = r2(Math.cos(rr) * vx + Math.sin(rr) * vy); }
    if (d.ty === 'spot') { const dv = fl.devices[d.i], q = dv.spots[+d.sub], q0 = o.spots[+d.sub], np = [num(q0.x) + dx, num(q0.y) + dy], sp = e.shiftKey ? [r2(np[0]), r2(np[1])] : ropeSnap(dv, np); q.x = sp[0]; q.y = sp[1]; }
    if (d.ty === 'rp') { const dv = fl.devices[d.i], L0 = clone(ropeLines(o)), li = +d.sub, j = +d.sub2, q0 = L0[li][j]; L0[li][j] = [sn(q0[0] + dx), sn(q0[1] + dy)]; dv.ropes = L0; delete dv.rope; }
    if (d.ty === 'rope') { const j = +d.sub, q0 = o.rope[j]; fl.devices[d.i].rope[j] = [sn(q0[0] + dx), sn(q0[1] + dy)]; }
    if (d.ty === 'aim') { const dv = fl.devices[d.i], kk = +d.sub, em = kk < 0 ? { x: num(dv.x), y: num(dv.y) } : dv.spots[kk]; let a = Math.atan2(w[0] - num(em.x), -(w[1] - num(em.y))) * 180 / Math.PI; a = deg(e.shiftKey ? a : Math.round(a / 5) * 5); if (kk < 0) dv.beam_dir = a; else dv.spots[kk].dir = a; }
    if (d.ty === 'lbl') {
      const c = [r2(d.c0[0] + dx), r2(d.c0[1] + dy)];
      if (d.kind === 'room' || d.kind === 'area') { const r = d.kind === 'room' ? fl.rooms[d.i] : fl.areas[d.i]; r.label_x = c[0]; r.label_y = c[1]; }
      else { const ob = d.kind === 'op' ? fl.openings[d.i] : fl.devices[d.i]; ob.label_dx = r2(c[0] - num(ob.x)); ob.label_dy = r2(c[1] - num(ob.y)); }
    }
    if (d.ty === 'furn') { fl.furniture[d.i].x = sn(o.x + dx); fl.furniture[d.i].y = sn(o.y + dy); }
    if (d.ty === 'fh') {
      const m = fl.furniture[d.i], th = (m.rotate || 0) * Math.PI / 180, lx = (w[0] - m.x) * Math.cos(th) + (w[1] - m.y) * Math.sin(th), ly = -(w[0] - m.x) * Math.sin(th) + (w[1] - m.y) * Math.cos(th);
      // Ecke gegenüber bleibt fest
      const nw = Math.max(.1, sn(lx + o.w / 2)), nh = Math.max(.1, sn(ly + o.h / 2)), cx = (nw - o.w) / 2, cy = (nh - o.h) / 2;
      m.w = nw; m.h = nh; m.x = r2(o.x + cx * Math.cos(th) - cy * Math.sin(th)); m.y = r2(o.y + cx * Math.sin(th) + cy * Math.cos(th));
    }
    if (d.ty === 'fr') { const m = fl.furniture[d.i]; let a = Math.atan2(w[0] - m.x, -(w[1] - m.y)) * 180 / Math.PI; a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15; m.rotate = deg(a); }
    if (d.ty === 'view') { const v = this._plan.views[d.i]; v.x = sn(o.x + dx); v.y = sn(o.y + dy); }
    if (d.ty === 'vh') { const v = this._plan.views[d.i]; v.w = Math.max(.5, sn(w[0] - v.x)); v.h = Math.max(.5, sn(w[1] - v.y)); }
    this._raf();
  }
  // Wandseite parallel verschieben: Endpunkte + gleiche Wandlinie in Nachbarräumen + deckungsgleiche Ecken
  _edgeDragPrep(ri, j) {
    const fl = this._fl(), r = fl.rooms[ri], a = r.points[j], b = r.points[(j + 1) % r.points.length], Lg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Lg < .01) { this._eMove = null; return; }
    const ends = [a, b]; coEdges(fl, ri, j).forEach(([k, m]) => { const o = fl.rooms[k].points; ends.push(o[m], o[(m + 1) % o.length]); });
    const same = (p, q) => Math.abs(p[0] - q[0]) < .005 && Math.abs(p[1] - q[1]) < .005, pts = [];
    fl.rooms.forEach((o, k) => o.points.forEach((p, m) => { if (ends.some(q => same(p, q))) pts.push([k, m, [...p]]); }));
    this._eMove = { n: [-(b[1] - a[1]) / Lg, (b[0] - a[0]) / Lg], pts };
  }
  _snapEx(w, e, ri, j) { return this._snap(w, false, e, ri); }
  _raf() { if (this._rq) return; this._rq = requestAnimationFrame(() => { this._rq = 0; this._editRender(); }); }
  _pu(e) {
    if (this._ptrs) this._ptrs.delete(e.pointerId);
    if (this._pinch) { if (!this._ptrs || this._ptrs.size < 2) this._pinch = null; return; }
    const d = this._drag; this._drag = null;
    if (d) {
      if (d.ty === 'pan' && !this._moved && this._sel) { this._sel = null; this._side(); }
      else if (d.ty !== 'pan' && this._moved) { this._commit(); this._side(); }
      this._editRender(); return;
    }
    const dr = this._draft, fl = this._fl();
    if (dr && (dr.t === 'rect' || dr.t === 'view') && dr.b) {
      const x0 = Math.min(dr.a[0], dr.b[0]), y0 = Math.min(dr.a[1], dr.b[1]), x1 = Math.max(dr.a[0], dr.b[0]), y1 = Math.max(dr.a[1], dr.b[1]);
      this._draft = null;
      if (x1 - x0 < .2 || y1 - y0 < .2) return this._editRender();
      if (dr.t === 'rect') { fl.rooms.push({ id: rid('raum_'), name: 'Raum ' + (fl.rooms.length + 1), floor: 'wood', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }); this._sel = { t: 'room', i: fl.rooms.length - 1 }; }
      else { const n = this._plan.views.length + 1; this._plan.views.push({ id: 'ausschnitt' + n, name: 'Ausschnitt ' + n, floor: fl.id, x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0), rotate: 0 }); this._sel = { t: 'view', i: this._plan.views.length - 1 }; }
      this._commit(); this._tool = 'sel'; this._editBuild();
    }
  }
  _finishPoly() {
    const d = this._draft, fl = this._fl(); this._draft = null;
    const kind = (d && d.kind) || 'poly';
    if (d && d.pts.length >= (kind === 'aline' ? 2 : 3)) {
      if (kind === 'poly') { fl.rooms.push({ id: rid('raum_'), name: 'Raum ' + (fl.rooms.length + 1), floor: 'wood', points: d.pts }); this._sel = { t: 'room', i: fl.rooms.length - 1 }; }
      else { const ty = AREATYPES[this._newArea] ? this._newArea : 'lawn', a = { id: rid('aussen_'), name: '', type: ty, points: d.pts }; if (kind === 'aline') { a.line = true; a.width = AREATYPES[ty][1]; } fl.areas.push(a); this._sel = { t: 'area', i: fl.areas.length - 1 }; }
      this._commit(); this._tool = 'sel'; this._editBuild();
    }
    else this._editRender();
  }
  _dbl(e) {
    if (['poly', 'area', 'aline'].includes(this._tool)) { return this._finishPoly(); }
    if (this._tool === 'wall') { this._draft = null; this._editRender(); return; }
    // Ecke ins Seil einfügen
    const s0 = this._sel, dv = s0 && s0.t === 'dev' && this._fl().devices[s0.i];
    if (dv && dv.type === 'light' && dv.lamp === 'rope') {
      const w = this._world(e), Ls = clone(ropeLines(dv)), cl = dv.ropes_closed || []; let best = null;
      Ls.forEach((L, li) => { const n = L.length + (cl[li] ? 1 : 0); for (let j = 0; j + 1 < n; j++) { const pr = proj(w, L[j], L[(j + 1) % L.length]); if (!best || pr.d < best.d) best = { ...pr, li, j }; } });
      if (best && best.d < 12 / this._ppm()) { Ls[best.li].splice(best.j + 1, 0, this._snap(best.q, true)); dv.ropes = Ls; delete dv.rope; this._commit(); this._editRender(); this._side(); }
      return;
    }
    // Punkt in Kante einer Außenfläche einfügen
    const sa = this._sel;
    if (sa && sa.t === 'area') {
      const a = this._fl().areas[sa.i], w = this._world(e), n = a.points.length; let best = null;
      for (let j = 0; j < (a.line ? n - 1 : n); j++) { const pr = proj(w, a.points[j], a.points[(j + 1) % n]); if (!best || pr.d < best.d) best = { ...pr, j }; }
      if (best && best.d < 12 / this._ppm()) { a.points.splice(best.j + 1, 0, this._snap(best.q, true)); this._sel = { t: 'area', i: sa.i, j: best.j + 1 }; this._commit(); this._editRender(); this._side(); }
      return;
    }
    // Punkt in Raumkante einfügen
    const s = this._sel; if (!s || (s.t !== 'room' && s.t !== 'edge' && s.t !== 'vtx')) return;
    const r = this._fl().rooms[s.i], w = this._world(e); let best = null;
    r.points.forEach((a, i) => { const pr = proj(w, a, r.points[(i + 1) % r.points.length]); if (!best || pr.d < best.d) best = { ...pr, i }; });
    if (best && best.d < 12 / this._ppm()) { r.points.splice(best.i + 1, 0, this._snap(best.q, true)); edgeArrSplice(r, best.i + 1, false, best.i); this._sel = { t: 'room', i: s.i }; this._commit(); this._editRender(); this._side(); }
  }
  _zoomAt(e, f) {
    const w = this._world(e), v = this._vb;
    const nw = clamp(v[2] * f, 1, 400); f = nw / v[2];
    this._vb = [w[0] - (w[0] - v[0]) * f, w[1] - (w[1] - v[1]) * f, v[2] * f, v[3] * f]; this._editRender();
  }
  _key(e) {
    if (!this._edit) return;
    const tg = e.composedPath()[0], tn = (tg && tg.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tn)) return;
    const fl = this._fl(), s = this._sel;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this._undo(e.shiftKey ? 1 : -1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this._undo(1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && s) { e.preventDefault(); this._dup(); return; }
    if (e.key === 'Escape') { this._draft = null; if (this._tool !== 'sel') this._tool = 'sel', this._editBuild(); else { this._sel = null; this._side(); this._editRender(); } return; }
    if (e.key === 'Enter' && this._draft && this._draft.t === 'poly') { this._finishPoly(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && s) { e.preventDefault(); if (s.t === 'edge') this._setEdgeT(null); else if (s.t === 'vtx') this._delVtx(); else if (s.t === 'area' && s.j != null) this._delAVtx(); else this._del(); return; }
    if (e.key === 'Tab' && s && s.t === 'area' && s.j != null) { e.preventDefault(); const n = fl.areas[s.i].points.length; s.j = (s.j + (e.shiftKey ? n - 1 : 1)) % n; this._editRender(); this._side(); return; }
    if (e.key === 'Tab' && s && (s.t === 'vtx' || s.t === 'edge')) { e.preventDefault(); const n = fl.rooms[s.i].points.length; s.j = (s.j + (e.shiftKey ? n - 1 : 1)) % n; this._editRender(); this._side(); return; }
    if (e.key.toLowerCase() === 'r' && s) { this._rot(e.shiftKey ? 15 : 90); return; }
    const ar = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (ar && s) {
      e.preventDefault(); const st = this._plan.grid * (e.shiftKey ? 10 : 1), dx = ar[0] * st, dy = ar[1] * st;
      const o = this._obj();
      if (s.t === 'vtx') o.points[s.j] = [r2(o.points[s.j][0] + dx), r2(o.points[s.j][1] + dy)];
      else if (s.t === 'room' || s.t === 'edge' || (s.t === 'area' && s.j == null)) o.points = o.points.map(p => [r2(p[0] + dx), r2(p[1] + dy)]);
      else if (s.t === 'area') o.points[s.j] = [r2(o.points[s.j][0] + dx), r2(o.points[s.j][1] + dy)];
      else if (s.t === 'wall') { o.a = [r2(o.a[0] + dx), r2(o.a[1] + dy)]; o.b = [r2(o.b[0] + dx), r2(o.b[1] + dy)]; }
      else if (o) { o.x = r2(num(o.x) + dx); o.y = r2(num(o.y) + dy); }
      this._commit(); this._editRender(); this._side();
    }
  }
  _obj() {
    const s = this._sel, fl = this._fl(); if (!s) return null;
    return s.t === 'view' ? this._plan.views[s.i] : ({ vtx: fl.rooms, edge: fl.rooms, room: fl.rooms, area: fl.areas, wall: fl.walls, op: fl.openings, dev: fl.devices, furn: fl.furniture }[s.t] || [])[s.i];
  }
  _arr() { const s = this._sel, fl = this._fl(); return s.t === 'view' ? this._plan.views : { vtx: fl.rooms, edge: fl.rooms, room: fl.rooms, area: fl.areas, wall: fl.walls, op: fl.openings, dev: fl.devices, furn: fl.furniture }[s.t]; }
  _del() { const s = this._sel; if (!s) return; this._arr().splice(s.i, 1); this._sel = null; this._commit(); this._editRender(); this._side(); }
  _dup() {
    const s = this._sel; if (!s) return; const o = clone(this._obj()), off = .5;
    if (o.points) o.points = o.points.map(p => [r2(p[0] + off), r2(p[1] + off)]);
    else if (o.a) { o.a = [o.a[0] + off, o.a[1] + off]; o.b = [o.b[0] + off, o.b[1] + off]; }
    else { o.x = r2(num(o.x) + off); o.y = r2(num(o.y) + off); }
    if (s.t === 'edge' || s.t === 'vtx') s.t = 'room';
    if (o.id) o.id = s.t === 'room' ? rid('raum_') : s.t === 'area' ? rid('aussen_') : s.t === 'view' ? o.id + '_2' : o.id;
    const a = this._arr(); a.push(o); this._sel = { t: s.t, i: a.length - 1 }; this._commit(); this._editRender(); this._side();
  }
  _rot(d) {
    const s = this._sel, o = this._obj(); if (!o) return;
    if (s.t === 'room' || s.t === 'edge' || s.t === 'vtx' || s.t === 'area') { const c = o.line ? lineMid(o.points) : centroid(o.points), q = d === 90; if (!q) return; o.points = o.points.map(p => [r2(c[0] - (p[1] - c[1])), r2(c[1] + (p[0] - c[0]))]); }
    else if (s.t === 'view') o.rotate = deg(num(o.rotate) + 90);
    else if (s.t === 'dev' && o.type === 'light') o.beam_dir = deg(num(o.beam_dir, 180) + d);
    else if (s.t === 'dev' && o.type === 'tablet') o.rotate = deg(num(o.rotate) + d);
    else if (s.t === 'dev' && o.type === 'climate') o.heater_rotate = deg(num(o.heater_rotate) + (o.heater === 'floor' ? 90 : d));
    else if ('rotate' in o || s.t === 'furn' || s.t === 'op') o.rotate = deg(num(o.rotate) + d);
    else return;
    this._commit(); this._editRender(); this._side();
  }
  async _save() {
    const btn = this.shadowRoot.getElementById('save'); btn.disabled = true; btn.textContent = '… speichere';
    try {
      const plan = JSON.parse(JSON.stringify(this._plan)), src = this._src;
      if (src && src.mode === 'twin') {
        if (!src.writable) throw new Error('Datenbank nicht erreichbar – Speichern ist gerade nicht möglich. Änderungen bleiben im Editor, bis die Verbindung wieder steht.');
        const msg = { type: 'home_twin/plan/save', plan_id: src.planId, plan, base_revision: this._baseRev ?? src.rev };
        let res;
        try { res = await this._hass.callWS(msg); }
        catch (err) {
          if (err && err.code === 'conflict' && confirm(`${err.message}.\n\nTrotzdem mit deinem Stand überschreiben? Die andere Version bleibt in der Historie erhalten.`)) res = await this._hass.callWS({ ...msg, force: true });
          else throw err;
        }
        this._baseRev = res.revision; if (res.revision >= src.rev) { src.rev = res.revision; src.plan = normPlan(plan); }
        this._edStatus();
      } else {
        const url = this._cfg.dashboard ?? dashFromPath();
        const cfg = await this._hass.callWS({ type: 'lovelace/config', url_path: url });
        const ok = walk(cfg, c => { if (isMaster(c)) { c.plan = plan; return true; } return false; });
        if (!ok) throw new Error('Master-Karte (custom:haus-grundriss mit plan:) im Dashboard nicht gefunden');
        await this._hass.callWS({ type: 'lovelace/config/save', url_path: url, config: cfg });
      }
      this._hist = [JSON.stringify(this._plan)]; this._hi = 0; this._dirty = false;
      btn.textContent = '✔ Gespeichert'; setTimeout(() => { if (btn.isConnected) { btn.textContent = '💾 Speichern'; btn.disabled = false; btn.classList.remove('dirty'); } }, 1600);
    } catch (err) { alert('Speichern fehlgeschlagen: ' + (err.message || JSON.stringify(err))); btn.textContent = '💾 Speichern'; btn.disabled = false; }
  }
  _edClick(e) {
    const t = e.composedPath().find(n => n.dataset && (n.dataset.a || n.dataset.tool || n.dataset.fl || n.dataset.sel || n.dataset.dev || n.dataset.sym || n.dataset.area));
    if (!t) return;
    const P = this._plan, fl = this._fl();
    if (t.dataset.fl) { this._floor = t.dataset.fl; this._sel = null; this._draft = null; this._vbOk = false; this._editBuild(); return; }
    if (t.dataset.tool) { this._tool = t.dataset.tool; this._draft = null; if (this._tool === 'aline' && this._newArea === 'lawn') this._newArea = 'paving'; if (this._tool !== 'sel') this._sel = null; this._editBuild(); return; }
    if (t.dataset.area) { this._newArea = t.dataset.area; if (this._tool !== 'area' && this._tool !== 'aline') this._tool = 'area'; this._draft = null; this._editBuild(); return; }
    if (t.dataset.sel) { const [ty, i, j] = t.dataset.sel.split(':'); this._sel = ty === 'edge' || ty === 'vtx' ? { t: ty, i: +i, j: +j } : ty === 'avtx' ? { t: 'area', i: +i, j: +j } : { t: ty, i: +i }; if (ty === 'view') { const v = P.views[+i]; if (v.floor !== fl.id) { this._floor = v.floor; this._editBuild(); return; } } this._editRender(); this._side(); return; }
    if (t.dataset.dev) { this._newDev = t.dataset.dev; this._tool = 'dev'; this._editBuild(); return; }
    if (t.dataset.sym) { this._newSym = t.dataset.sym; this._tool = 'furn'; this._editBuild(); return; }
    const a = t.dataset.a;
    if (a === 'close') return this._stopEdit();
    if (a === 'save') return this._save();
    if (a === 'undo') return this._undo(-1);
    if (a === 'redo') return this._undo(1);
    if (a === 'fit') { this._fit(); return this._editRender(); }
    if (a === 'del') return this._del();
    if (a === 'dup') return this._dup();
    if (a === 'rot90') return this._rot(90);
    if (a && a.startsWith('areaadd:')) {
      const id = a.slice(8), fl = this._fl(), r = this._obj(); if (!r || !r.points) return;
      const c = centroid(r.points), n = fl.devices.filter(d => Math.hypot(num(d.x) - c[0], num(d.y) - c[1]) < .3).length;
      fl.devices.push({ type: autoType(id), entity: id, x: r2(c[0] + (n % 4) * .35), y: r2(c[1] + Math.floor(n / 4) * .35) });
      this._commit(); this._editRender(); this._side(); return;
    }
    if (a === 'rot15') return this._rot(15);
    if (a === 'blecal') {
      const o = this._obj(), src = String(o.scanner || '').toUpperCase(); let best = null;
      for (const d of this._ble.values()) { if (!d.tag) continue; const v = (d.s || {})[src]; if (v && Date.now() / 1000 - v.ts < 15 && (!best || v.avg > best.v.avg)) best = { d, v }; }
      if (!best) { alert('Kein hinzugefügter Tag wird gerade von diesem Proxy empfangen.'); return; }
      if (!confirm(`„${best.d.tag.name}“ liegt 1 m vor dem Proxy? Dann ${best.v.avg.toFixed(0)} dBm als Wert für 1 m übernehmen.`)) return;
      o.rssi_1m = Math.round(best.v.avg); this._commit(); this._side(); return;
    }
    if (a === 'bmhere') { const o = this._obj(); if (o && bmId()) { o.browser = bmId(); this._commit(); this._editRender(); this._side(); } return; }

    if (a === 'vtoggle') { this._vAll = !this._vAll; this._vSave(); this._editBuild(); return; }
    if (a && a.startsWith('vhide:')) { const v = P.views[+a.slice(6)]; if (this._vHid.has(v.id)) this._vHid.delete(v.id); else this._vHid.add(v.id); this._vSave(); this._editRender(); this._side(); return; }
    if (a && a.startsWith('rshape:')) { const o = this._obj(); ropePreset(o, a.slice(7)); this._ropeSpots(o, (o.spots || []).length || 4, true); this._commit(); this._editRender(); this._side(); return; }
    if (a === 'rpadd' || a === 'rpdel' || a === 'rbranch' || a === 'rclose') {
      const o = this._obj(), Ls = clone(ropeLines(o)), cl = (o.ropes_closed || Ls.map(() => false)).slice(), L = Ls[Ls.length - 1];
      if (a === 'rpadd') { const p1 = L[L.length - 1], p0 = L[L.length - 2] || [p1[0] - 1, p1[1]], dx = p1[0] - p0[0], dy = p1[1] - p0[1], ln = Math.hypot(dx, dy) || 1; L.push([r2(p1[0] - dy / ln), r2(p1[1] + dx / ln)]); }
      if (a === 'rpdel') { if (L.length > 2) L.pop(); else if (Ls.length > 1) { Ls.pop(); cl.pop(); } }
      if (a === 'rbranch') { const a0 = Ls[0][0], b0 = Ls[0][1], m = [r2((a0[0] + b0[0]) / 2), r2((a0[1] + b0[1]) / 2)], dx = b0[0] - a0[0], dy = b0[1] - a0[1], ln = Math.hypot(dx, dy) || 1; Ls.push([m, [r2(m[0] - dy / ln), r2(m[1] + dx / ln)]]); cl.push(false); }
      if (a === 'rclose') cl[0] = !cl[0];
      o.ropes = Ls; o.ropes_closed = cl; delete o.rope; this._commit(); this._editRender(); this._side(); return;
    }
    if (a === 'spotsdist') { const o = this._obj(); this._ropeSpots(o, (o.spots || []).length || 3, true); this._commit(); this._editRender(); this._side(); return; }
    if (a === 'lblreset') { const o = this._obj(); ['label_x', 'label_y', 'label_dx', 'label_dy'].forEach(k => delete o[k]); this._commit(); this._editRender(); this._side(); return; }
    if (a && a.startsWith('clr:')) { const o = this._obj(); delete o[a.slice(4)]; this._commit(); this._editRender(); this._side(); return; }
    if (a && a.startsWith('pclr:')) { delete P.style[a.slice(5)]; this._commit(); this._editRender(); this._side(); return; }
    if (a === 'flip') { const o = this._obj(); o.rotate = deg(o.rotate + 180); this._commit(); this._editRender(); return; }
    if (a === 'vprev' || a === 'vnext') { const s = this._sel, n = fl.rooms[s.i].points.length; s.j = (s.j + (a === 'vnext' ? 1 : n - 1)) % n; this._editRender(); this._side(); return; }
    if (a === 'vdel') return this._delVtx();
    if (a && (a.startsWith('gp:') || a.startsWith('gdel:') || a === 'gadd')) {
      const o = this._obj(); if (!o) return;
      if (a === 'gp:ohne') delete o.panes;
      else if (a.startsWith('gp:')) o.panes = clone(GLASS_PRESETS[a.slice(3)][1]);
      else if (a === 'gadd') (o.panes = o.panes || []).push({ x: 0, y: 1.25, w: .3, h: .3 });
      else { o.panes.splice(+a.slice(5), 1); if (!o.panes.length) delete o.panes; }
      this._commit(); this._editRender(); this._side(); return;
    }
    if (a === 'avdel') return this._delAVtx();
    if (a === 'avprev' || a === 'avnext') { const s = this._sel, n = fl.areas[s.i].points.length; s.j = ((s.j ?? -1) + (a === 'avnext' ? 1 : n - 1 + (s.j == null ? 2 : 0))) % n; this._editRender(); this._side(); return; }
    if (a === 'aup' || a === 'adown' || a === 'atop' || a === 'abottom') {
      const s = this._sel, A = fl.areas, o = A[s.i], to = { aup: s.i + 1, adown: s.i - 1, atop: A.length - 1, abottom: 0 }[a];
      if (to < 0 || to >= A.length || to === s.i) return;
      A.splice(s.i, 1); A.splice(to, 0, o); this._sel = { t: 'area', i: to }; this._commit(); this._editRender(); this._side(); return;
    }
    if (a === 'ecdef') return this._setEdgeProp('edge_color', null);
    if (a === 'edef') return this._setEdgeT(null);
    if (a === 'eopen') return this._setEdgeT(0);
    if (a === 'eprev' || a === 'enext') { const s = this._sel, n = fl.rooms[s.i].points.length; s.j = (s.j + (a === 'enext' ? 1 : n - 1)) % n; this._editRender(); this._side(); return; }
    if (a === 'hinge') { const o = this._obj(); o.hinge = o.hinge === 'right' ? 'left' : 'right'; this._commit(); this._editRender(); this._side(); return; }
    if (a === 'addfl') { const n = P.floors.length + 1; const id = 'etage' + n; P.floors.push({ id, name: 'Etage ' + n, level: Math.max(...P.floors.map(f => f.level)) + 1, rooms: [], walls: [], openings: [], devices: [], furniture: [], areas: [] }); this._floor = id; this._sel = null; this._commit(); this._vbOk = false; this._editBuild(); return; }
    if (a === 'delfl') { if (P.floors.length < 2) return alert('Die letzte Etage kann nicht gelöscht werden.'); if (!confirm(`Etage „${fl.name}“ mit allem Inhalt löschen?`)) return; P.floors.splice(P.floors.indexOf(fl), 1); P.views = P.views.filter(v => v.floor !== fl.id); this._floor = P.floors[0].id; this._commit(); this._vbOk = false; this._editBuild(); return; }
    if (a === 'yaml') return this._yaml();
    if (a === 'preview') return this._preview();
    if (a === 'p3d') return this._preview3d();
    if (a === 'mclose') { this.shadowRoot.getElementById('modal').innerHTML = ''; return; }
    if (a === 'copy') { const ta = this.shadowRoot.querySelector('.modal textarea'); ta.select(); (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(ta.value) : Promise.reject()).catch(() => document.execCommand('copy')); t.textContent = '✔ Kopiert'; return; }
    if (a === 'cardyaml') { const v = this._obj(); this._yaml(`type: custom:haus-grundriss\nausschnitt: ${v.id}\n# quelle: ${this._cfg.dashboard ?? dashFromPath() ?? 'haus-grundriss'}`); return; }
  }
  _edChange(e) {
    const t = e.target; if (!t.dataset) return;
    const P = this._plan, fl = this._fl();
    if (t.dataset.pf) { // Plan-/Etagen-Einstellungen
      const k = t.dataset.pf, v = t.value;
      if (k === 'st_wall3d') { delete P.style.half3d; if (v) P.style.wall3d = v; else delete P.style.wall3d; }
      else if (k.startsWith('bld_show_')) { if (!P.building && this._cfg && this._cfg.building) P.building = clone(this._cfg.building); if (P.building) { const kk = k.slice(4); if (v) P.building[kk] = v; else delete P.building[kk]; } }
      else if (k === 'bldjson') { const tx = String(v).trim(); if (!tx) P.building = null; else { try { const o = JSON.parse(tx); if (!o || !Array.isArray(o.parts) || !Array.isArray(o.storeys)) throw new Error('parts und storeys fehlen'); P.building = o; } catch (er) { alert('Gebäude: ungültiges JSON – ' + er.message); return; } } }
      else if (k === 'st_room_shadow_opacity') P.style.room_shadow_opacity = clamp(num(v, 100), 0, 100) / 100;
      else if (['st_room_shadow_x', 'st_room_shadow_y', 'st_room_shadow_blur'].includes(k)) P.style[k.slice(3)] = num(v);
      else if (k === 'st_scale' || k === 'st_room_scale') P.style[k.slice(3)] = clamp(num(v, 100), 20, 400) / 100;
      else if (/^stc_(room_badge|rv_|half3d)/.test(k)) { const key = k.slice(4); if (t.checked) delete P.style[key]; else P.style[key] = false; }
      else if (k.startsWith('stc_')) { const key = k.slice(4), on = t.dataset.inv ? !t.checked : t.checked; if (on) P.style[key] = true; else delete P.style[key]; }
      else if (k === 'st_skirting_h') { if (String(v).trim() === '') delete P.style.skirting_h; else P.style.skirting_h = clamp(num(v, .06), .02, .2); }
      else if (k === 'st_room_names') { if (t.checked) delete P.style.room_names; else P.style.room_names = false; }
      else if (k === 'st_ids') { if (t.checked) delete P.style.ids; else P.style.ids = false; }
      else if (k === 'st_heat_pill') { if (t.checked) delete P.style.heat_pill; else P.style.heat_pill = 'heizkoerper'; }
      else if (k.startsWith('st_')) P.style[k.slice(3)] = v;
      if (k === 'grid') P.grid = num(v, .05);
      if (k === 'outer') P.wall.outer = num(v, .3);
      if (k === 'wheight') { if (String(v).trim() === '') delete P.wall.height; else P.wall.height = clamp(num(v, 2.5), .3, 6); }
      if (k === 'inner') P.wall.inner = num(v, .12);
      if (k === 'flname') fl.name = v;
      if (k === 'fllevel') fl.level = num(v);
      if (k === 'flid') { const nid = v.trim(); if (nid && !P.floors.some(f => f.id === nid)) { P.views.forEach(x => { if (x.floor === fl.id) x.floor = nid; }); fl.id = nid; this._floor = nid; } }
      this._commit(); this._editBuild(); return;
    }
    if (t.dataset.gp) {
      const o = this._obj(), [f, k] = t.dataset.gp.split(':'), q = o && o.panes && o.panes[+k]; if (!q) return;
      if (f === 'shape') { if (t.value === 'rect') delete q.shape; else q.shape = t.value; }
      else { const v = String(t.value).trim().replace(',', '.'); if (v === '') delete q[f]; else q[f] = r2(Math.max(f === 'x' || f === 'y' ? -9 : 0, num(v))); }
      this._commit(); this._editRender(); this._side(); return;
    }
    if (t.dataset.av) { const s = this._sel, a = fl.areas[s.i], v = Number(String(t.value).replace(',', '.')); if (Number.isFinite(v) && s.j != null) { a.points[s.j][t.dataset.av === 'x' ? 0 : 1] = r2(v); this._commit(); } this._editRender(); this._side(); return; }
    if (t.dataset.v) { const s = this._sel, r = fl.rooms[s.i], k = t.dataset.v === 'x' ? 0 : 1, v = Number(String(t.value).replace(',', '.')); if (Number.isFinite(v)) { r.points[s.j][k] = r2(v); this._commit(); } this._editRender(); this._side(); return; }
    if (t.dataset.l) {
      const o = this._obj(), [lk, li] = t.dataset.l.split(':'), q = o.spots && o.spots[+li], v = String(t.value).trim();
      if (lk === 'count') this._ropeSpots(o, clamp(Math.round(num(v, 3)), 1, 40), false);
      else if (lk === 'ent') { if (v) q.entity = v; else delete q.entity; }
      else if (['dir', 'tilt', 'spread', 'radius'].includes(lk)) { if (v === '') delete q[lk]; else q[lk] = lk === 'dir' ? deg(num(v)) : lk === 'tilt' ? clamp(num(v), 0, 90) : num(v); }
      this._commit(); this._editRender(); this._side(); return;
    }
    if (t.dataset.e === 'h') { const v = String(t.value).trim().replace(',', '.'); return this._setEdgeProp('edge_height', v === '' ? null : clamp(num(v, 2.5), .1, 6)); }
    if (t.dataset.e === 'style') return this._setEdgeProp('edge_style', t.value || null);
    if (t.dataset.e === 'color') return this._setEdgeProp('edge_color', t.value);
    if (t.dataset.e === 't') { const v = String(t.value).trim(); return this._setEdgeT(v === '' ? null : Math.max(0, num(v)) / 100); }
    if (t.dataset.f) {
      const o = this._obj(); if (!o) return;
      const k = t.dataset.f; let v = t.type === 'checkbox' ? t.checked : t.value;
      if (k === 'points') { const pts = String(v).split(/\n/).map(l => l.trim().split(/[\s;,]+/).map(Number)).filter(p => p.length >= 2 && p.every(Number.isFinite)).map(p => [r2(p[0]), r2(p[1])]); if (pts.length >= (o.line ? 2 : 3)) { if (pts.length !== o.points.length) EDGE_ARRS.forEach(k => delete o[k]); o.points = pts; } }
      else if (k === 'ax' || k === 'ay' || k === 'bx' || k === 'by') o[k[0]][k[1] === 'x' ? 0 : 1] = num(v);
      else if (['x', 'y', 'w', 'h', 'length', 'rotate', 't', 'radius', 'opacity', 'label_x', 'label_y', 'heater_length', 'heater_rotate', 'pill_offset', 'loop_spacing', 'pill_shift', 'beam_spread', 'beam_dir', 'beam_tilt', 'mount_height', 'width', 'rssi_1m', 'path_loss', 'sill', 'height', 'h3d', 'z3d', 'heater_height', 'heater_depth', 'heater_elev', 'rail_height', 'rail_boards', 'rail_board_h', 'rail_board_t', 'rail_gap', 'rail_board_bottom', 'elev'].includes(k)) { if (v === '' && !['x', 'y', 'w', 'h'].includes(k)) delete o[k]; else o[k] = num(v); }
      else if (k === 'floorref') o.floor = v;
      else if (v === '' || v === false) delete o[k]; else o[k] = ['entity', 'tilt', 'humidity', 'temperature', 'air_quality', 'climate'].includes(k) ? resolveEnt((this._hass || {}).states, String(v).trim()) : v;
      if (k === 'model' && o.model) this._modelFit(o);
      if (k === 'entity' && this._sel.t === 'dev' && !o.typeManual && o.type !== 'tablet') o.type = autoType(v);
      if (k === 'lamp' && v === 'rope' && !ropeLines(o).length) { ropePreset(o, 'I'); this._ropeSpots(o, 3, true); }
      if (k === 'type' && this._sel.t === 'dev') o.typeManual = true;
      if (k === 'type' && this._sel.t === 'area' && o.line && t.dataset.oldw != null && num(o.width) === num(t.dataset.oldw)) o.width = AREATYPES[v][1];
      if (k === 'line' && this._sel.t === 'area') { if (v) { if (o.width == null) o.width = AREATYPES[o.type] ? AREATYPES[o.type][1] : 1; } else if (o.points.length < 3) { const [p, q] = o.points, L0 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, w = areaW(o); o.points = [[r2(p[0] - (q[1] - p[1]) / L0 * w / 2), r2(p[1] + (q[0] - p[0]) / L0 * w / 2)], [r2(q[0] - (q[1] - p[1]) / L0 * w / 2), r2(q[1] + (q[0] - p[0]) / L0 * w / 2)], [r2(q[0] + (q[1] - p[1]) / L0 * w / 2), r2(q[1] - (q[0] - p[0]) / L0 * w / 2)], [r2(p[0] + (q[1] - p[1]) / L0 * w / 2), r2(p[1] - (q[0] - p[0]) / L0 * w / 2)]]; } if (this._sel.j != null) delete this._sel.j; }
      this._commit(); this._editRender(); this._side(); return;
    }
    if (t.dataset.a === 'modelfit') { this._modelFit(this._obj()); return; }
    if (t.dataset.a === 'upload') {
      const f = t.files && t.files[0]; if (!f) return;
      if (f.size > 400 * 1024) { alert(`Datei ist ${(f.size / 1024).toFixed(0)} KB groß. Größere Bilder bitte nach /config/www/grundriss/ kopieren und als /local/grundriss/${f.name} eintragen.`); return; }
      const rd = new FileReader(); rd.onload = () => { const o = this._obj(); o.src = rd.result; delete o.symbol; const im = new Image(); im.onload = () => { if (im.width && im.height) { o.h = r2(o.w * im.height / im.width); } this._commit(); this._editRender(); this._side(); }; im.src = rd.result; }; rd.readAsDataURL(f);
    }
  }
  // 3D-Modell laden: echte Maße (m) und eine Draufsicht für den 2D-Plan übernehmen
  _modelFit(o) {
    if (!o || !o.model) return;
    const url = o.model; this._mfMsg = 'Modell wird geladen …'; this._side();
    load3D().then(m => m.modelInfo(url)).then(r => {
      if (o.model !== url) return;
      o.w = r2(r.w); o.h = r2(r.d); o.h3d = r2(r.h); if (r.top) o.top = r.top; else delete o.top;
      this._mfMsg = `Übernommen: ${Math.round(r.w * 100)} × ${Math.round(r.d * 100)} × ${Math.round(r.h * 100)} cm`;
      this._commit(); this._editRender(); this._side();
    }).catch(e => { this._mfMsg = 'Modell nicht ladbar: ' + ((e && e.message) || e); this._side(); });
  }
  _entList(dom) {
    const st = (this._hass && this._hass.states) || {}, F = new Set(this._entFirst || []), ids = Object.keys(st).filter(id => !dom || dom.some(d => id.startsWith(d + '.'))).sort((a, b) => (F.has(b) - F.has(a)) || (a < b ? -1 : a > b ? 1 : 0));
    return ids.map(id => `<option value="${id}">${esc((st[id].attributes || {}).friendly_name || '')}</option>`).join('');
  }
  _side() {
    const side = this.shadowRoot.getElementById('side'); if (!side) return; this._entFirst = null;
    const P = this._plan, fl = this._fl(), s = this._sel, o = this._obj();
    const inp = (k, lab, v, typ = 'text', ex = '') => `<label>${lab}<input data-f="${k}" type="${typ}" value="${esc(v ?? '')}" ${typ === 'number' ? 'step="0.01"' : ''} ${ex}></label>`;
    const stx = (this._hass && this._hass.states) || {};
    const ent = (k, lab, v, dom) => { const bad = v && !stx[resolveEnt(stx, v)]; return `<label>${lab}<input data-f="${k}" list="dl-${k}" value="${esc(v ?? '')}" placeholder="z. B. ${dom ? dom[0] : 'sensor'}.…" ${bad ? 'style="border-color:#ff5a5a"' : ''}><datalist id="dl-${k}">${this._entList(dom)}</datalist>${bad ? '<span style="color:#ff5a5a">⚠ Entität nicht gefunden</span>' : ''}</label>`; };
    const sel = (k, lab, v, opts) => `<label>${lab}<select data-f="${k}">${Object.entries(opts).map(([a, b]) => `<option value="${a}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    const tools = `<div class="btns"><button class="btn" data-a="dup">⧉ Duplizieren</button><button class="btn warn" data-a="del">🗑 Löschen</button></div>`;
    const clr = (k, lab, v, def) => `<label>${lab}<span class="row" style="gap:6px"><input type="color" data-f="${k}" value="${esc(v || def)}" style="height:34px;padding:2px"><button class="btn" data-a="clr:${k}" ${v ? '' : 'disabled'}>Standard</button></span></label>`;
    const pclr = (k, lab, def) => `<label>${lab}<span class="row" style="gap:6px"><input type="color" data-pf="st_${k}" value="${esc((P.style || {})[k] || def)}" style="height:34px;padding:2px"><button class="btn" data-a="pclr:${k}" ${(P.style || {})[k] ? '' : 'disabled'}>Standard</button></span></label>`;
    const lreset = o && (o.label_x != null || o.label_dx != null) ? `<button class="btn" data-a="lblreset">↺ Beschriftung an Standardplatz</button>` : '';
    let h = '';
    if (this._tool === 'dev') {
      h = `<h4>Gerät setzen</h4><p>Typ wählen, dann in den Plan klicken. Die Entität trägst du danach ein – der Typ wird dabei automatisch erkannt.</p><div class="btns">${Object.entries(TYPES).map(([k, n]) => `<button class="btn ${k === this._newDev ? 'on' : ''}" data-dev="${k}">${n}</button>`).join('')}</div>`;
    } else if (this._tool === 'area' || this._tool === 'aline') {
      h = `<h4>${this._tool === 'aline' ? 'Weg / Linie zeichnen' : 'Außenfläche zeichnen'}</h4><p>${this._tool === 'aline' ? 'Art wählen, dann den Weg als Linie klicken (Mittellinie). Breite danach rechts einstellen.' : 'Art wählen, dann die Ecken der Fläche klicken. Außenflächen liegen unter den Räumen und bekommen keine Wände.'}</p>
        <div class="btns">${Object.entries(AREATYPES).map(([k, f]) => `<button class="btn ${k === this._newArea ? 'on' : ''}" data-area="${k}"><span class="led" style="display:inline-block;vertical-align:middle;--c:${k === 'plain' ? '#2a2d33' : { lawn: '#2e4a2b', garden: '#4a3a28', hedge: '#2a4d23', deck: '#5a4634', slabs: '#55575b', paving: '#5a5048', gravel: '#5a574f', water: '#22485d', asphalt: '#3a3b3e' }[k]};width:10px;height:10px"></span> ${f[0]}</button>`).join('')}</div>
        <div class="btns"><button class="btn ${this._tool === 'area' ? 'on' : ''}" data-tool="area">🌿 als Fläche</button><button class="btn ${this._tool === 'aline' ? 'on' : ''}" data-tool="aline">┅ als Weg / Linie</button></div>
        <p>Tipp: Ecken rasten an Raum- und Flächenecken ein (Umschalt = frei). Ein Weg über den Rasen: erst Rasen, dann Weg zeichnen – später gezeichnete Flächen liegen oben.</p>`;
    } else if (this._tool === 'furn') {
      h = `<h4>Möbel setzen</h4><p>Symbol wählen und in den Plan klicken. „Eigenes Bild“ = PNG/JPG/SVG.</p><div class="pal">${Object.entries(FURN).map(([k, f]) => `<button class="${k === this._newSym ? 'on' : ''}" data-sym="${k}"><svg viewBox="-5 -5 110 110" preserveAspectRatio="xMidYMid meet">${f[3]}</svg>${f[0]}</button>`).join('')}<button class="${this._newSym === 'bild' ? 'on' : ''}" data-sym="bild"><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zM5 17h14l-4.5-6-3.5 4.5-2.5-3z" fill="#5a5f69"/></svg>Eigenes Bild</button><button class="${this._newSym === 'modell' ? 'on' : ''}" data-sym="modell"><svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.7 8 12 11.7 5.3 8zM5 9.7l6 3.3v6.6l-6-3.3zm8 9.9V13l6-3.3v6.6z" fill="#5a5f69"/></svg>3D-Modell (SketchUp)</button></div>`;
    } else if (!s || !o) {
      h = `<h4>Etage</h4><div class="row">${`<label>Name<input data-pf="flname" value="${esc(fl.name)}"></label><label>Ebene<input data-pf="fllevel" type="number" value="${fl.level}"></label>`}</div>
        <label>ID (für Ausschnitte / BLE)<input data-pf="flid" value="${esc(fl.id)}"></label>
        <div class="btns"><button class="btn" data-a="addfl">+ Etage</button><button class="btn warn" data-a="delfl">🗑 Etage löschen</button></div>
        <h4>Größe der Beschriftungen</h4><div class="row"><label>Symbole, Werte, Namen (%)<input data-pf="st_scale" type="number" min="40" max="300" step="10" value="${Math.round(num((P.style || {}).scale, 1) * 100)}"></label><label>Raumnamen (%)<input data-pf="st_room_scale" type="number" min="40" max="400" step="10" value="${Math.round(num((P.style || {}).room_scale, 1) * 100)}"></label></div><p>100 % = Grundgröße. Gilt in der Übersicht, im Editor und in allen Ausschnitten (pro Tablet zusätzlich mit <b>zoom:</b> in der Karte).</p>
        <h4>Schatten der Raumnamen</h4>${pclr('room_shadow_color', 'Farbe', '#000000')}<div class="row"><label>Deckkraft %<input data-pf="st_room_shadow_opacity" type="number" min="0" max="100" step="5" value="${Math.round(num((P.style || {}).room_shadow_opacity, 1) * 100)}"></label><label>Unschärfe px<input data-pf="st_room_shadow_blur" type="number" min="0" max="30" step="1" value="${num((P.style || {}).room_shadow_blur, 4)}"></label></div><div class="row"><label>Versatz X px<input data-pf="st_room_shadow_x" type="number" step="1" value="${num((P.style || {}).room_shadow_x, 0)}"></label><label>Versatz Y px<input data-pf="st_room_shadow_y" type="number" step="1" value="${num((P.style || {}).room_shadow_y, 1)}"></label></div>
        <h4>Farben (Standard für den ganzen Plan)</h4>${pclr('room_label', 'Raumnamen', '#80858f')}${pclr('label', 'Gerätenamen', '#aeb2b9')}${pclr('heater', 'Heizkörper', '#5a5f69')}${pclr('heater_heat', 'Heizkörper beim Heizen', '#ff8a3d')}${pclr('rail', 'Geländer', '#6c717b')}${pclr('area_label', 'Namen der Außenflächen', '#8fae88')}
        <h4>Plan</h4><div class="row"><label>Raster (m)<select data-pf="grid">${[.01, .05, .1, .25, .5].map(g => `<option value="${g}" ${g === P.grid ? 'selected' : ''}>${g * 100} cm</option>`).join('')}</select></label></div>
        <h4>Gebäude (Mehrfamilienhaus)</h4><p>Andere Wohnungen, Treppenhaus, Nachbarhaus und Dächer – gedämpft um eure Wohnung. Koordinaten in Metern wie der Plan. Leer = kein Gebäude.${!P.building && this._cfg && this._cfg.building ? ' (Zurzeit aus der Kartenkonfiguration – Ändern speichert es in den Plan.)' : ''}</p><textarea data-pf="bldjson" rows="12" spellcheck="false" style="width:100%;box-sizing:border-box;font:11px/1.35 monospace;background:#15171a;color:#c9ccd2;border:1px solid #33363d;border-radius:6px">${esc((() => { const b = P.building || (this._cfg && this._cfg.building); return b ? JSON.stringify(b, null, 1) : ''; })())}</textarea>
        ${(() => { const b = P.building || (this._cfg && this._cfg.building); if (!b) return ''; const o = (k, v) => [['', 'zeigen'], ['glas', 'als Glasrahmen'], ['aus', 'ausblenden']].map(([w, n]) => `<option value="${w}" ${String(b[k] || '') === w ? 'selected' : ''}>${n}</option>`).join(''); return `<div class="row"><label>Nachbarhaus<select data-pf="bld_show_neighbor">${o('show_neighbor')}</select></label><label>Andere Wohnungen + Treppenhaus<select data-pf="bld_show_units">${o('show_units')}</select></label></div><p>Standard für alle Geräte; am Gerät im 3D-Menü 🏢 umstellbar.</p>`; })()}
        <h4>Darstellung</h4><b style="color:#c9ccd2;font-size:12px">3D-Ansicht</b><label>Wände (Standard)<select data-pf="st_wall3d">${(() => { const st = P.style || {}, cur = st.wall3d || (st.half3d === false ? 'voll' : ''); return [['', 'hinterste Wände voll, Rest abgeschnitten'], ['halb', 'alle Wände abgeschnitten'], ['voll', 'volle Höhe']].map(([v, n]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${n}</option>`).join(''); })()}</select></label>
<b style="color:#c9ccd2;font-size:12px">Raum-Tafel</b><label class="chk"><input type="checkbox" data-pf="stc_room_badge" data-inv="1" ${(P.style || {}).room_badge === false ? '' : 'checked'}> Raumname + Werte als Tafel</label><label class="chk"><input type="checkbox" data-pf="stc_rv_temp" data-inv="1" ${(P.style || {}).rv_temp === false ? '' : 'checked'}> Temperatur</label><label class="chk"><input type="checkbox" data-pf="stc_rv_hum" data-inv="1" ${(P.style || {}).rv_hum === false ? '' : 'checked'}> Luftfeuchte</label><label class="chk"><input type="checkbox" data-pf="stc_rv_air" data-inv="1" ${(P.style || {}).rv_air === false ? '' : 'checked'}> Luftqualität</label>
<b style="color:#c9ccd2;font-size:12px">Wand-Tablets (alle)</b><label class="chk"><input type="checkbox" data-pf="stc_tab_no_ring" ${(P.style || {}).tab_no_ring ? 'checked' : ''}> Kreis um das Symbol ausblenden</label><label class="chk"><input type="checkbox" data-pf="stc_tab_no_bg" ${(P.style || {}).tab_no_bg ? 'checked' : ''}> Hintergrund des Symbols ausblenden</label><label class="chk"><input type="checkbox" data-pf="stc_tab_hide" ${(P.style || {}).tab_hide ? 'checked' : ''}> Symbol ganz ausblenden</label>
        <b style="color:#c9ccd2;font-size:12px">Fußleisten (3D)</b><label class="chk"><input type="checkbox" data-pf="stc_skirting_off" ${(P.style || {}).skirting_off ? '' : 'checked'} data-inv="1"> Fußleisten zeigen</label><div class="row"><label>Höhe (m)<input data-pf="st_skirting_h" type="number" step="0.01" value="${(P.style || {}).skirting_h ?? ''}" placeholder="0.06"></label></div>${pclr('skirting', 'Farbe Fußleisten', '#efece6')}
        <label class="chk"><input type="checkbox" data-pf="st_room_names" ${(P.style || {}).room_names === false ? '' : 'checked'}> Raumnamen anzeigen</label>
        <label class="chk"><input type="checkbox" data-pf="st_ids" ${(P.style || {}).ids === false ? '' : 'checked'}> Kürzel der Fenster/Türen (T1, F1 …) anzeigen</label>
        <label class="chk"><input type="checkbox" data-pf="st_heat_pill" ${(P.style || {}).heat_pill === 'heizkoerper' ? '' : 'checked'}> Heizung (Ist › Soll) in der Raummitte statt am Heizkörper</label>
        <label>Aussehen (Übersicht, Ausschnitte, Raum-Tablets)<select data-pf="st_look"><option value="" ${(P.style || {}).look !== 'classic' ? 'selected' : ''}>Realistisch (Schatten, Tiefe)</option><option value="classic" ${(P.style || {}).look === 'classic' ? 'selected' : ''}>Klassisch (flach)</option></select></label>
        <div class="row"><label>Raumhöhe / Wandhöhe 3D (m)<input data-pf="wheight" type="number" step="0.05" min="0.3" max="6" value="${P.wall.height ?? ''}" placeholder="2.5"></label></div>
        <div class="btns"><button class="btn" data-a="p3d">🧊 3D-Vorschau dieser Etage</button></div><p>Je Karte umschaltbar: <b>ansicht: 3d</b>, <b>stil: klassisch</b>. In 3D: ziehen = drehen, zwei Finger / Mausrad = zoomen.</p>
        <div class="row"><label>Außenwand (m)<input data-pf="outer" type="number" step="0.01" value="${P.wall.outer}"></label><label>Innenwand (m)<input data-pf="inner" type="number" step="0.01" value="${P.wall.inner}"></label></div>
        <p>Wände entstehen automatisch aus den Raumkanten: Kante zwischen zwei Räumen = Innenwand, Kante nach draußen = Außenwand (nach außen), Balkon-Kante = Geländer.</p>
        <h4>Räume (${fl.rooms.filter(r => !r.part_of).length})</h4>${fl.rooms.map((r, i) => `<div class="li" data-sel="room:${i}">${r.part_of ? '↳ ' : ''}${esc(r.name || r.id)}${r.part_of ? ` <span style="color:#979ca5">(Teil von ${esc((fl.rooms.find(x => x.id === r.part_of) || {}).name || r.part_of)})</span>` : ''}<small>${area(r.points).toFixed(1)} m²</small></div>`).join('') || '<p>Noch keine – Werkzeug „▭ Raum“.</p>'}
        <h4>Außenflächen (${fl.areas.length})</h4>${fl.areas.map((a, i) => `<div class="li" data-sel="area:${i}">${a.line ? '┅' : '🌿'} ${esc(a.name || (AREATYPES[a.type] || ['Fläche'])[0])}<small>${a.line ? `${lineLen(a.points).toFixed(1)} m` : `${area(a.points).toFixed(1)} m²`}</small></div>`).join('') || '<p>Noch keine – Werkzeug „🌿 Außenfläche“ oder „┅ Weg / Linie“.</p>'}
        <h4>Ausschnitte (${P.views.length})</h4>${P.views.map((v, i) => `<div class="li" data-sel="view:${i}"><button class="btn" data-a="vhide:${i}" title="im Editor ein-/ausblenden" style="padding:0 6px">${this._vHid && this._vHid.has(v.id) ? '◌' : '👁'}</button> ${esc(v.name || v.id)}<small>${esc(v.id)} · ${esc((P.floors.find(f => f.id === v.floor) || {}).name || v.floor)}</small></div>`).join('') || '<p>Noch keine – Werkzeug „⬚ Ausschnitt“.</p>'}
        <h4>Tastatur</h4><p>Entf = löschen · Strg+D = duplizieren · R = drehen (Umschalt: 15°) · Pfeile = schieben (Umschalt ×10) · Strg+Z / Strg+Y · Umschalt beim Ziehen = ohne Raster</p>`;
    } else if (s.t === 'room') {
      const parents = Object.fromEntries([['', '– eigener Raum –'], ...fl.rooms.filter(x => x !== o && !x.part_of).map(x => [x.id, x.name || x.id])]);
      const hA = (this._hass && this._hass.areas) || {}, aidE = haArea(this._hass, o), auto = !o.area ? haArea(this._hass, Object.assign({}, o, { area: undefined })) : null;
      const used = new Set(); this._plan.floors.forEach(f => { f.devices.forEach(d => { used.add(d.entity); (d.spots || []).forEach(q => used.add(q.entity)); }); f.openings.forEach(x => { used.add(x.entity); used.add(x.tilt); }); f.rooms.forEach(x => [x.temperature, x.humidity, x.climate, x.air_quality].forEach(e => used.add(e))); });
      const sug = aidE ? areaGroups(this._hass, aidE).G.filter(g => g.k !== 'werte' && g.k !== 'medien').flatMap(g => g.ids).filter(id => !used.has(id)) : [];
      this._entFirst = aidE ? areaEnts(this._hass, aidE) : null;
      const areaUI = !Object.keys(hA).length ? '' : `<h4>Home-Assistant-Bereich</h4>${sel('area', 'Verknüpfter Bereich', o.area || '', Object.assign({ '': `automatisch über den Namen${auto ? ' → ' + hA[auto].name : ' (kein passender Bereich)'}`, '-': 'keiner' }, Object.fromEntries(Object.values(hA).sort((x, y) => x.name.localeCompare(y.name, 'de')).map(x => [x.area_id, x.name]))))}
        <p>${aidE ? `Antippen des Raumnamens zeigt die Geräte aus „${esc(hA[aidE].name)}“. Bei den Sensor-Feldern unten stehen Entitäten dieses Bereichs oben in der Liste.` : 'Ohne Bereich ist der Raumname nicht antippbar.'}</p>
        ${sug.length ? `<p><b>Noch nicht im Plan (${sug.length}):</b> antippen = in die Raummitte setzen, danach an die richtige Stelle ziehen.</p><div class="sugl">${sug.slice(0, 40).map(id => `<button class="btn sm" data-a="areaadd:${esc(id)}" title="${esc(id)}">+ ${esc(String((stx[id] && stx[id].attributes.friendly_name) || id))}</button>`).join('')}</div>` : aidE ? '<p>Alle Lichter, Schalter, Thermostate und Kontakte dieses Bereichs sind schon im Plan.</p>' : ''}`;
      h = `<h4>Raum</h4>${inp('name', 'Name', o.name)}<div class="row">${inp('id', 'ID', o.id)}${sel('floor', 'Boden', o.floor, FLOORTYPES)}</div>${areaUI}
        ${sel('part_of', 'Gehört zu Raum (Teilfläche)', o.part_of || '', parents)}<p>Teilfläche: zählt nicht als eigener Raum, kein eigener Name, keine Wand zum Hauptraum – zum Zusammensetzen eines Raums aus mehreren Flächen.</p>
        ${clr('label_color', 'Farbe Raumname', o.label_color, (P.style || {}).room_label || '#80858f')}<p>Raumnamen im Plan ziehen = verschieben.</p><div class="btns">${lreset}</div>
        <h4>Werte auf der Raum-Tafel</h4>${ent('temperature', 'Ist-Temperatur: Sensor', o.temperature, ['sensor'])}${sel('temp_src', 'Ist-Temperatur kommt von', o.temp_src || 'auto', { auto: 'automatisch (Sensor, sonst Thermostat)', sensor: 'nur vom Sensor', thermostat: 'vom Thermostat' })}
        ${ent('climate', 'Thermostat für Soll-Temperatur (leer = Thermostat im Raum)', o.climate, ['climate'])}
        ${ent('humidity', 'Luftfeuchte: Sensor', o.humidity, ['sensor'])}${sel('hum_src', 'Luftfeuchte kommt von', o.hum_src || 'auto', { auto: 'automatisch (Sensor, sonst Thermostat)', sensor: 'nur vom Sensor', thermostat: 'vom Thermostat' })}
        ${ent('air_quality', 'Luftqualität: Sensor (CO₂ / VOC / Feinstaub / AQI)', o.air_quality, ['sensor'])}<p>Was angezeigt wird: Plan → Darstellung → Raum-Tafel. Namensfarbe: oben „Farbe Raumname“.</p>
        <div class="row">${inp('label_x', 'Beschriftung x (leer = Mitte)', o.label_x, 'number')}${inp('label_y', 'Beschriftung y', o.label_y, 'number')}</div>
        <label>Eckpunkte in Metern (x y je Zeile)<textarea data-f="points">${o.points.map(p => p.join(' ')).join('\n')}</textarea></label>
        <p>${area(o.points).toFixed(2)} m² · Punkte ziehen · Doppelklick auf Kante = Punkt einfügen · Zahlen an den Kanten = Länge in cm</p>
        <div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button></div>
        ${o.floor === 'outdoor' || (o.edge_style || []).includes('rail') ? (() => { const f = RAIL_FILL[o.rail_fill] ? o.rail_fill : 'none', bd = f === 'boards' || f === 'boards_v'; return `<h4>Geländer</h4><div class="row">${inp('rail_height', 'Höhe Geländer (m)', o.rail_height ?? '', 'number', 'placeholder="1.0"')}${sel('rail_fill', 'Füllung', f, RAIL_FILL)}</div>
          ${bd ? `<div class="row">${f === 'boards' ? inp('rail_boards', 'Anzahl Bretter', o.rail_boards ?? '', 'number', 'placeholder="4" step="1" min="1"') : ''}${inp('rail_board_h', f === 'boards' ? 'Brett-Höhe (m)' : 'Brett-Breite (m)', o.rail_board_h ?? '', 'number', 'placeholder="0.12"')}</div><div class="row">${inp('rail_board_t', 'Brett-Dicke (m)', o.rail_board_t ?? '', 'number', 'placeholder="0.02"')}${inp('rail_gap', 'Abstand der Bretter (m)', o.rail_gap ?? '', 'number', 'placeholder="0.03"')}</div><div class="row">${sel('rail_board_side', 'Beplankung am Geländer', o.rail_board_side === 'innen' ? 'innen' : '', { '': 'außen (Straßen-/Gartenseite)', innen: 'innen (Balkonseite)' })}${f === 'boards_v' ? inp('rail_board_bottom', 'Abstand zum Boden (m)', o.rail_board_bottom ?? '', 'number', 'placeholder="0.08"') : ''}</div><p>Die Bretter schließen oben bündig mit dem Handlauf ab${f === 'boards' ? ' und werden von oben nach unten gezählt' : ''} – die Geländerhöhe ändert sich dadurch nicht.</p>${clr('rail_board_color', 'Farbe Bretter', o.rail_board_color, '#8a6a4a')}` : ''}<p>Gilt für alle Geländer-Kanten dieses Raums. Farbe des Rahmens: Wandseite anklicken → Farbe.</p>`; })() : ''}
        ${o.floor !== 'outdoor' ? `<h4>Fußleisten (3D)</h4>${clr('skirt_color', 'Farbe Fußleisten in diesem Raum', o.skirt_color, (P.style || {}).skirting || '#efece6')}<label class="chk"><input type="checkbox" data-f="no_skirting" ${o.no_skirting ? 'checked' : ''}> keine Fußleisten in diesem Raum</label>` : ''}
        <h4>Wandseiten</h4><p>Anklicken (oder Kante im Plan anklicken) = Dicke einzeln ändern.</p>${this._edgeList(fl, s.i)}<h4>Ecken</h4><p>Anklicken = Ecke auswählen (auch wenn mehrere übereinander liegen).</p>${o.points.map((q, j) => `<div class="li" data-sel="vtx:${s.i}:${j}">Ecke ${j + 1}<small>${q[0].toFixed(2)} / ${q[1].toFixed(2)}</small></div>`).join('')}${tools}`;
    } else if (s.t === 'area') {
      const n = o.points.length, aj = s.j != null && o.points[s.j] ? s.j : null, pt = aj != null ? o.points[aj] : null;
      h = `<h4>${o.line ? 'Weg / Linie' : 'Außenfläche'}</h4>${inp('name', 'Name (leer = keine Beschriftung)', o.name)}<div class="row">${inp('id', 'ID', o.id)}<label>Art<select data-f="type" data-oldw="${o.line ? (AREATYPES[o.type] || AREATYPES.lawn)[1] : ''}">${Object.entries(AREATYPES).map(([k, f]) => `<option value="${k}" ${k === o.type ? 'selected' : ''}>${esc(f[0])}</option>`).join('')}</select></label></div>
        <label class="chk"><input type="checkbox" data-f="line" ${o.line ? 'checked' : ''}> als Weg / Linie (Breite statt Fläche)</label>
        ${o.line ? `<div class="row">${inp('width', 'Breite (m)', areaW(o), 'number')}${sel('cap', 'Enden', o.cap || 'round', { round: 'rund', butt: 'gerade' })}</div>` : ''}
        ${o.type === 'plain' ? clr('color', 'Farbe', o.color, '#2a2d33') : ''}${inp('opacity', 'Deckkraft 0–1', o.opacity ?? 1, 'number')}
        ${clr('label_color', 'Farbe Name', o.label_color, (P.style || {}).area_label || '#8fae88')}<label class="chk"><input type="checkbox" data-f="hide_name" ${o.hide_name ? 'checked' : ''}> Namen im Plan ausblenden</label><div class="btns">${lreset}</div>
        <h4>Reihenfolge</h4><div class="btns"><button class="btn" data-a="atop" title="über alle anderen Außenflächen">⤒ ganz oben</button><button class="btn" data-a="aup">↑ höher</button><button class="btn" data-a="adown">↓ tiefer</button><button class="btn" data-a="abottom">⤓ ganz unten</button></div><p>Räume liegen immer über den Außenflächen.</p>
        <h4>Ecken (${n})</h4>${pt ? `<p>Ecke ${aj + 1} ausgewählt</p><div class="row"><label>x (m)<input data-av="x" type="number" step="0.01" value="${pt[0]}"></label><label>y (m)<input data-av="y" type="number" step="0.01" value="${pt[1]}"></label></div><div class="btns"><button class="btn" data-a="avprev">‹</button><button class="btn" data-a="avnext">›</button><button class="btn warn" data-a="avdel">🗑 Ecke löschen</button></div>` : '<div class="btns"><button class="btn" data-a="avnext">Ecke auswählen ›</button></div>'}
        <label>Eckpunkte in Metern (x y je Zeile)<textarea data-f="points">${o.points.map(p => p.join(' ')).join('\n')}</textarea></label>
        <p>${o.line ? `${lineLen(o.points).toFixed(2)} m lang · ca. ${(lineLen(o.points) * areaW(o)).toFixed(1)} m²` : `${area(o.points).toFixed(2)} m²`} · Fläche ziehen = verschieben · Ecke ziehen = Form · Doppelklick auf Kante = Ecke einfügen · Entf bei gewählter Ecke = Ecke löschen</p>
        <div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button></div>${tools}`;
    } else if (s.t === 'vtx') {
      const pt = o.points[s.j], n = o.points.length, pv = o.points[(s.j + n - 1) % n], nx = o.points[(s.j + 1) % n];
      h = `<h4>Eckpunkt ${s.j + 1} von ${n}</h4><p><b style="color:#c9ccd2">${esc(o.name || o.id)}</b></p>
        <div class="row"><label>x (m)<input data-v="x" type="number" step="0.01" value="${pt[0]}"></label><label>y (m)<input data-v="y" type="number" step="0.01" value="${pt[1]}"></label></div>
        <p>Abstand zur vorigen Ecke ${(Math.hypot(pt[0] - pv[0], pt[1] - pv[1]) * 100).toFixed(1)} cm · zur nächsten ${(Math.hypot(pt[0] - nx[0], pt[1] - nx[1]) * 100).toFixed(1)} cm</p>
        <div class="btns"><button class="btn" data-a="vprev">‹ vorige Ecke</button><button class="btn" data-a="vnext">nächste Ecke ›</button></div>
        <p>Pfeiltasten = Ecke um ${Math.round(P.grid * 100)} cm schieben (Umschalt ×10) · Tab = nächste Ecke · Entf = Ecke löschen.<br>Liegen Ecken übereinander: eine anklicken, dann mit Tab / ‹ › zur gewünschten wechseln.</p>
        <div class="btns"><button class="btn" data-sel="room:${s.i}">← Raum</button><button class="btn warn" data-a="vdel">🗑 Ecke löschen</button></div>`;
    } else if (s.t === 'edge') {
      const P0 = o.points, a = P0[s.j], b = P0[(s.j + 1) % P0.length], kind = edgeKind(fl, o, s.j), tw = o.wall_thickness ? o.wall_thickness[s.j] : null;
      const def = kind === 'ext' ? P.wall.outer : kind === 'int' ? P.wall.inner : .05, KN = { int: 'Innenwand', ext: 'Außenwand (nach außen gezeichnet)', rail: 'Geländer', none: '–' };
      const nb = coEdges(fl, s.i, s.j).map(([k]) => fl.rooms[k].name || fl.rooms[k].id);
      h = `<h4>Wandseite ${s.j + 1} von ${P0.length}</h4><p><b style="color:#c9ccd2">${esc(o.name || o.id)}</b> · ${(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100).toFixed(0)} cm<br>${KN[kind]}${nb.length ? ` · grenzt an ${esc(nb.join(', '))}` : ''}</p>
        <label>Wanddicke in cm (leer = Standard ${Math.round(def * 100)} cm, 0 = keine Wand)<input data-e="t" type="number" step="1" min="0" value="${tw == null ? '' : Math.round(tw * 100)}" placeholder="${Math.round(def * 100)}"></label>
        <div class="btns"><button class="btn" data-a="edef">Standard</button><button class="btn" data-a="eopen">Offen (keine Wand)</button></div>
        <label>Wandhöhe 3D in m (leer = Raumhöhe ${num(P.wall.height, 2.5)} m)<input data-e="h" type="number" step="0.05" min="0.1" max="6" value="${(o.edge_height || [])[s.j] ?? ''}" placeholder="${num(P.wall.height, 2.5)}"></label>
        <label>Darstellung<select data-e="style"><option value="" ${(o.edge_style || [])[s.j] !== 'rail' ? 'selected' : ''}>Wand (automatisch)</option><option value="rail" ${(o.edge_style || [])[s.j] === 'rail' ? 'selected' : ''}>Geländer</option></select></label>
        <label>Farbe dieser Wandseite<span class="row" style="gap:6px"><input type="color" data-e="color" value="${esc((o.edge_color || [])[s.j] || (kind === 'rail' ? (P.style || {}).rail || '#6c717b' : kind === 'int' ? '#4b505c' : '#5b5f67'))}" style="height:34px;padding:2px"><button class="btn" data-a="ecdef" ${(o.edge_color || [])[s.j] ? '' : 'disabled'}>Standard</button></span></label>
        <p>${kind === 'ext' ? 'Außenwände wachsen nach außen – die Innenmaße des Raums bleiben gleich.' : 'Innenwände liegen mittig auf der Kante. Die Dicke gilt auch für den Nachbarraum.'}</p>
        <p>Kante ziehen = Wand parallel verschieben (angrenzende Räume wandern mit). Umschalt = ohne Raster.</p>
        <div class="btns"><button class="btn" data-sel="room:${s.i}">← Raum</button><button class="btn" data-a="eprev">‹ vorige Seite</button><button class="btn" data-a="enext">nächste Seite ›</button></div>`;
    } else if (s.t === 'wall') {
      h = `<h4>Freie Wand</h4><div class="row">${inp('ax', 'Start x', o.a[0], 'number')}${inp('ay', 'Start y', o.a[1], 'number')}</div><div class="row">${inp('bx', 'Ende x', o.b[0], 'number')}${inp('by', 'Ende y', o.b[1], 'number')}</div>
        <div class="row">${inp('t', 'Stärke (m)', o.t ?? P.wall.inner, 'number')}${inp('h3d', 'Höhe 3D (m)', o.h3d ?? '', 'number', `placeholder="${num(P.wall.height, 2.5)}"`)}</div><p>Länge ${(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) * 100).toFixed(0)} cm</p>${tools}`;
    } else if (s.t === 'op') {
      const pas = o.type === 'passage';
      h = `<h4>${{ door: 'Tür', passage: 'Durchgang', window: 'Fenster' }[o.type]}</h4><div class="row">${inp('id', 'Kürzel', o.id)}${sel('type', 'Art', o.type, { window: 'Fenster', door: 'Tür', passage: 'Durchgang (ohne Tür)' })}</div>${inp('name', 'Name (Legende)', o.name)}
        ${pas ? clr('frame_color', 'Farbe Laibung / Rahmen', o.frame_color, '#6c717b') + this._passSide(o) : `${ent('entity', 'Kontakt (offen) – oder Fenster-Tür-Manager-Sensor', o.entity, ['binary_sensor', 'sensor'])}${ent('tilt', 'Kontakt gekippt (optional)', o.tilt, ['binary_sensor'])}
        ${clr('label_color', 'Schriftfarbe Kürzel', o.label_color, '#3ddc84')}<p>Kürzel im Plan ziehen = verschieben.</p><div class="btns">${lreset}</div>`}
        <div class="row">${inp('length', 'Breite (m)', o.length, 'number')}${inp('rotate', 'Drehung °', o.rotate, 'number')}</div>
        <div class="row">${o.type === 'window' ? inp('sill', 'Brüstungshöhe – Fenster beginnt bei (m)', o.sill ?? '', 'number', 'placeholder="0.9"') : ''}${inp('height', o.type === 'window' ? 'Fensterhöhe (m)' : o.type === 'door' ? 'Türhöhe (m)' : 'Durchgangshöhe 3D (m)', o.height ?? '', 'number', `placeholder="${o.type === 'window' ? 1.3 : 2.05}"`)}</div>
        ${o.type === 'window' ? `<p>Oberkante Fenster (Sturz): ${(num(o.sill, .9) + num(o.height, 1.3)).toFixed(2)} m</p>${sel('win_pos', 'Lage in der Wand (Laibung)', o.win_pos || 'mid', { mid: 'mittig', out: 'außen bündig (tiefe Laibung innen)', in: 'innen bündig (tiefe Laibung außen)' })}<label class="chk"><input type="checkbox" data-f="no_sill_board" ${o.no_sill_board ? 'checked' : ''}> keine Fensterbank innen</label>` : ''}
        ${o.type !== 'window' ? `<div class="row">${inp('elev', 'Unterkante über Boden (m)', o.elev ?? '', 'number', 'placeholder="0"')}</div><p>Für Abstellkammern, Schrank- oder Wandtüren, die höher beginnen. Darunter bleibt Wand.</p>` : ''}
        ${o.type === 'door' ? this._doorSide(o) : ''}
        <div class="row">${inp('x', 'x', o.x, 'number')}${inp('y', 'y', o.y, 'number')}</div>
        <div class="btns"><button class="btn" data-a="flip">⇅ Seite wechseln</button>${o.type === 'door' ? `<button class="btn" data-a="hinge">⇆ Anschlag ${o.hinge === 'right' ? 'rechts' : 'links'}</button>` : ''}</div><p>Ziehen = entlang der Wände verschieben (rastet an der nächsten Wand ein).</p>${tools}`;
    } else if (s.t === 'dev') {
      const dom = { tablet: ['sensor', 'binary_sensor', 'switch', 'light', 'media_player'], light: ['light'], switch: ['switch', 'input_boolean', 'fan'], climate: ['climate'], sensor: ['sensor'], binary: ['binary_sensor'], tracker: ['device_tracker', 'person', 'sensor'] }[o.type];
      h = `<h4>Gerät</h4>${sel('type', 'Typ', o.type, TYPES)}${o.type === 'bleproxy' ? '' : ent('entity', 'Entität', o.entity, dom)}${inp('name', o.type === 'bleproxy' ? 'Name (leer = Name des Proxys)' : 'Name (leer = Name aus HA)', o.name)}
        ${clr('label_color', 'Schriftfarbe Name', o.label_color, (P.style || {}).label || '#aeb2b9')}<label class="chk"><input type="checkbox" data-f="hide_name" ${o.hide_name ? 'checked' : ''}> Namen im Plan ausblenden</label><p>Namen im Plan ziehen = verschieben (Symbol bleibt stehen). Ausgeblendete Namen erscheinen im Editor blass, in der Legende bleiben sie.</p><div class="btns">${lreset}</div>
        ${o.type === 'sensor' ? ent('humidity', 'Zweiter Wert (z. B. Feuchte, optional)', o.humidity, ['sensor']) : ''}
        ${o.type === 'climate' ? `${sel('heater', 'Heizung', o.heater || 'radiator', { radiator: 'Heizkörper', floor: 'Fußbodenheizung', none: 'keine Anzeige' })}
          ${(o.heater || 'radiator') === 'radiator' ? `${clr('heater_color', 'Farbe Heizkörper', o.heater_color, (P.style || {}).heater || '#5a5f69')}${clr('heater_heat_color', 'Farbe beim Heizen', o.heater_heat_color, (P.style || {}).heater_heat || '#ff8a3d')}${sel('heater_kind', 'Bauart', o.heater_kind || 'panel', Object.fromEntries(Object.entries(HEATERS).map(([k, v]) => [k, v[0]])))}<div class="row">${inp('heater_length', 'Breite (m)', o.heater_length ?? heaterDim(o).L, 'number')}${inp('heater_height', 'Höhe (m)', o.heater_height ?? '', 'number', `placeholder="${heaterDim(o).H}"`)}</div><div class="row">${inp('heater_depth', 'Tiefe (m)', o.heater_depth ?? '', 'number', `placeholder="${heaterDim(o).T}"`)}${inp('heater_elev', 'Abstand zum Boden (m)', o.heater_elev ?? '', 'number', `placeholder="${heaterDim(o).E}"`)}</div><div class="row">${inp('heater_rotate', 'Drehung °', o.heater_rotate ?? 0, 'number')}</div><div class="row">${inp('pill_offset', 'Anzeige: Abstand (m)', o.pill_offset ?? .42, 'number')}${inp('pill_shift', 'Anzeige: seitlich (m)', o.pill_shift ?? 0, 'number')}</div><p>Anzeige im Plan ziehen = frei verschieben, Heizkörper ziehen = alles verschieben.</p><div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button><button class="btn" data-a="rot15">⟳ 15°</button></div><p>Die Anzeige sitzt auf der Raumseite – mit 180° Drehung wechselt sie die Seite. Taste R = 90° drehen.</p>` : ''}
          ${o.heater === 'floor' ? `<div class="row">${inp('loop_spacing', 'Abstand Heizschleifen (m)', o.loop_spacing ?? .15, 'number')}${inp('heater_rotate', 'Richtung °', o.heater_rotate ?? 0, 'number')}</div><div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button></div><p>Schleifen werden im Raum gezeichnet, in dem das Thermostat steht.</p>` : ''}` : ''}
        ${o.type === 'light' ? (() => { const L0 = LAMP[o.lamp] || LAMP.ceiling, sp = o.spots || []; return `${sel('lamp', 'Leuchtentyp', o.lamp || 'ceiling', Object.fromEntries(Object.entries(LAMP).map(([k, v]) => [k, v[0]])))}
          <div class="row">${inp('radius', 'Reichweite (m)', o.radius ?? L0[2], 'number')}${inp('beam_spread', 'Öffnungswinkel ° (360 = rundum)', o.beam_spread ?? L0[1], 'number')}</div>
          ${inp('beam_dir', o.lamp === 'rope' ? 'Richtung aller Spots ° (0 = oben, 90 = rechts)' : 'Richtung ° (0 = oben, 90 = rechts)', o.beam_dir ?? 180, 'number')}
          ${clr('glow_color', 'Lichtfarbe (Standard = aktuelle Farbe aus Home Assistant)', o.glow_color, '#ffc46b')}
          ${o.lamp !== 'ceiling' && o.lamp !== 'floor' && o.lamp ? `<div class="row">${inp('beam_tilt', 'Neigung ° (0 = nach unten, 90 = zur Seite)', o.beam_tilt ?? 90, 'number')}${inp('mount_height', 'Montagehöhe (m)', o.mount_height ?? 2.4, 'number')}</div>` : ''}
          ${o.lamp === 'rope' ? `<h4>Seil</h4><div class="btns">${['I', 'L', 'U', 'Z', 'T', 'O'].map(f => `<button class="btn" data-a="rshape:${f}">${f === 'I' ? '—' : f}</button>`).join('')}</div>
            <div class="btns"><button class="btn" data-a="rpadd">+ Ecke am Ende</button><button class="btn" data-a="rpdel">− letzte Ecke</button><button class="btn" data-a="rbranch">+ Ast (T)</button><button class="btn ${(o.ropes_closed || [])[0] ? 'on' : ''}" data-a="rclose">Ring (O)</button></div>
            <p>Seilpunkte (Quadrate) ziehen · Doppelklick aufs Seil = Ecke einfügen · Form-Knöpfe legen das Seil um die Leuchte neu an.</p>
            <h4>Spots</h4><label>Anzahl Spots<input data-l="count" type="number" min="1" max="40" value="${sp.length}"></label><div class="btns"><button class="btn" data-a="spotsdist">Spots gleichmäßig aufs Seil</button></div>
            <datalist id="dl-spot">${this._entList(['light', 'switch'])}</datalist>
            ${sp.map((q, k) => `<div style="border:1px solid #2c2f35;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><b style="color:#c9ccd2">Spot ${k + 1}</b>
              <label>Eigene Entität (leer = wie Leuchte)<input data-l="ent:${k}" list="dl-spot" value="${esc(q.entity || '')}" placeholder="light.…"></label>
              <div class="row"><label>Richtung °<input data-l="dir:${k}" type="number" step="5" value="${q.dir ?? ''}" placeholder="${num(o.beam_dir, 180)}"></label><label>Neigung °<input data-l="tilt:${k}" type="number" step="5" min="0" max="90" value="${q.tilt ?? ''}" placeholder="${num(o.beam_tilt, 90)}"></label></div>
              <div class="row"><label>Kegel °<input data-l="spread:${k}" type="number" step="5" value="${q.spread ?? ''}" placeholder="${num(o.beam_spread, L0[1])}"></label><label>Leuchtweite m<input data-l="radius:${k}" type="number" step="0.1" value="${q.radius ?? ''}" placeholder="${num(o.radius, L0[2])}"></label></div></div>`).join('')}
            <p>Leere Felder = Wert der Leuchte. Spots im Plan ziehen = auf dem Seil verschieben (Umschalt = frei). Gelben Punkt am Kegel ziehen = Richtung.</p>` : `<p>Gelben Punkt am Lichtkegel ziehen = Richtung drehen (Umschalt = ohne 5°-Raster). Taste R = 90°.</p>`}
          ${sel('tap', 'Tippen', o.tap || 'toggle', { toggle: 'Ein/Aus', 'more-info': 'Details' })}`; })() : ''}
        ${o.type === 'tablet' ? (() => { if (!this._dashList && this._hass) { this._dashList = []; Promise.resolve(this._hass.callWS({ type: 'lovelace/dashboards/list' })).then(l => { this._dashList = ['/lovelace/0', ...((l || []).map(x => '/' + x.url_path + '/1'))]; this._side(); }).catch(() => {}); } return `<label>Dashboard (Tippen öffnet es)<input data-f="dashboard" list="dl-dash" value="${esc(o.dashboard || '')}" placeholder="/wz-wall-panel/1"><datalist id="dl-dash">${(this._dashList || []).map(u => `<option value="${esc(u)}">`).join('')}</datalist></label>
          <div class="row">${inp('rotate', 'Drehung ° (Wand)', o.rotate ?? 0, 'number')}${inp('pill_offset', 'Symbol: Abstand (m)', o.pill_offset ?? .35, 'number')}</div>${inp('pill_shift', 'Symbol: seitlich (m)', o.pill_shift ?? 0, 'number')}
          <div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button><button class="btn" data-a="rot15">⟳ 15°</button></div><p>Der Bildschirm zeigt zur Raumseite. Entität optional (z. B. Akku/Bildschirm).</p>
          <label class="chk"><input type="checkbox" data-f="no_ring" ${o.no_ring ? 'checked' : ''}> Kreis um das Symbol ausblenden</label>
          <label class="chk"><input type="checkbox" data-f="no_bg" ${o.no_bg ? 'checked' : ''}> Hintergrund des Symbols ausblenden</label>
          <label class="chk"><input type="checkbox" data-f="hide_icon" ${o.hide_icon ? 'checked' : ''}> Symbol ganz ausblenden (Tablet bleibt im Plan sichtbar)</label><p>Für alle Tablets gleichzeitig: Plan → Darstellung.</p>
          <label>Symbol (mdi:…, leer = Tablet)
<input data-f="icon" list="dl-tico" value="${esc(o.icon || '')}" placeholder="mdi:tablet-dashboard"><datalist id="dl-tico">${TAB_ICONS.map(u => `<option value="${u}">`).join('')}</datalist></label>
          <label>Browser-Mod-ID (optional)
<input data-f="browser" value="${esc(o.browser || '')}" placeholder="leer = Erkennung über Dashboard-URL"></label>
          <div class="btns"><button class="btn" data-a="bmhere" ${bmId() ? '' : 'disabled'}>📍 Dieses Gerät${bmId() ? ` (${esc(bmId())})` : ' – kein Browser Mod'}</button></div>
          <p><b>„Du bist hier“</b>: Auf seinem Dashboard (URL oben) wird dieses Tablet im Plan farbig markiert. Mit Browser-Mod-ID zusätzlich auf jedem Dashboard, das dieses Gerät öffnet.</p>`; })() : ''}
        ${o.type === 'bleproxy' ? (() => {
          const scs = this._bleSc || [], auto = !o.scanner && this._scObj('', o.name), on = this._scOn(o.scanner, o.name);
          const opts = { '': '– Proxy wählen –', ...Object.fromEntries(scs.map(x => [x.src, `${this._scName(x.src)}${x.last != null && x.last < 30 ? '' : ' (offline)'}`])) };
          if (o.scanner && !opts[o.scanner]) opts[o.scanner] = `${o.scanner} (gerade nicht verbunden)`;
          return `${sel('scanner', 'Bluetooth-Proxy', o.scanner || '', opts)}
            ${auto ? `<p style="color:#ffb347">Kein Proxy gewählt – wird über den Namen „${esc(o.name)}“ automatisch ${esc(auto.src)} zugeordnet. Besser oben fest auswählen.</p>` : ''}
            <p>${!scs.length ? (this._bleOff ? 'home_twin liefert keine BLE-Daten (Version ≥ 0.4 nötig).' : 'Noch keine Proxys empfangen – ist der Proxy in HA eingebunden?') : on ? '<span style="color:#3ddc84">● online</span>' : on === false ? '<span style="color:#ff5a5a">● offline</span>' : ''}${o.scanner ? ` · <code>${esc(o.scanner)}</code>` : ''}</p>
            <div class="row">${inp('rssi_1m', 'Signal in 1 m (dBm)', o.rssi_1m, 'number', 'placeholder="-59"')}${inp('path_loss', 'Dämpfung n', o.path_loss, 'number', 'placeholder="2.5"')}</div>
            <div class="btns"><button class="btn" data-a="blecal" ${o.scanner ? '' : 'disabled'}>📏 Kalibrieren</button></div>
            <p><b>Kalibrieren:</b> einen hinzugefügten Tag (z. B. BC021) genau 1 m vor diesen Proxy legen, ein paar Sekunden warten, dann den Knopf drücken. <b>Dämpfung:</b> 2 = freie Sicht, 2,5 = Wohnung (Standard), 3–4 = viele Wände.</p>
            <p>Ortung und Raum-Erkennung rechnen mit der Position im Plan – Proxy dorthin ziehen, wo er wirklich steht, und speichern. Ab 3 Proxys pro Etage wird trianguliert.</p>`; })() : ''}
        ${o.type === 'tracker' ? `<p>Position kommt später aus den Attributen <b>x</b>, <b>y</b> (Meter) und optional <b>floor</b> (Etagen-ID) der Entität – vorbereitet für BLE.</p>${inp('color', 'Farbe', o.color || '#a36bff', 'color')}` : ''}
        <div class="row">${inp('x', 'x', o.x, 'number')}${inp('y', 'y', o.y, 'number')}</div>${tools}`;
    } else if (s.t === 'furn') {
      h = `<h4>${o.model !== undefined ? '3D-Modell' : 'Möbel / Bild'}</h4>${o.model !== undefined ? `<label>Modell-Datei (.dae aus SketchUp oder .glb)<input data-f="model" value="${esc(o.model)}" placeholder="/local/grundriss/moebel/sofa.dae"></label>
        <div class="btns"><button class="btn" data-a="modelfit" ${o.model ? '' : 'disabled'}>📐 Maße + Draufsicht aus Modell</button></div>
        <p>${this._mfMsg ? esc(this._mfMsg) + ' · ' : ''}Datei per Samba nach <code>/config/www/grundriss/moebel/</code> kopieren (Texturen-Ordner mit), hier als <code>/local/grundriss/moebel/…</code> eintragen. Breite/Tiefe/Höhe 3D strecken das Modell.</p>` : o.src !== undefined ? `<label>Bild-URL (z. B. /local/grundriss/sofa.png)<input data-f="src" value="${esc(o.src && o.src.startsWith('data:') ? '(hochgeladen, ' + Math.round(o.src.length / 1365) + ' KB)' : o.src)}"></label><label>… oder kleine Datei hochladen (max. 400 KB)<input type="file" accept="image/*" data-a="upload"></label>` : sel('symbol', 'Symbol', o.symbol, Object.fromEntries(Object.entries(FURN).map(([k, f]) => [k, f[0]])))}
        <div class="row">${inp('w', 'Breite (m)', o.w, 'number')}${inp('h', 'Tiefe (m)', o.h, 'number')}</div><div class="row">${inp('rotate', 'Drehung °', o.rotate, 'number')}${inp('opacity', 'Deckkraft 0–1', o.opacity ?? 1, 'number')}</div>
        <div class="row">${inp('h3d', 'Höhe 3D (m)', o.h3d ?? '', 'number', 'placeholder="automatisch"')}${inp('z3d', 'über Boden 3D (m)', o.z3d ?? '', 'number', 'placeholder="0"')}</div>
        <div class="row">${inp('x', 'x', o.x, 'number')}${inp('y', 'y', o.y, 'number')}</div><div class="btns"><button class="btn" data-a="rot90">⟳ 90°</button><button class="btn" data-a="rot15">⟳ 15°</button></div><p>Ecke ziehen = Größe · Kreis ziehen = drehen</p>${tools}`;
    } else if (s.t === 'view') {
      h = `<h4>Ausschnitt</h4>${inp('name', 'Name', o.name)}${inp('id', 'ID (im Raum-Panel: ausschnitt: …)', o.id)}
        <label>Raum (Fenster/Türen/Geräte nur dieses Raums zeigen)<select data-f="room"><option value="">automatisch (Raum in der Mitte)</option>${(P.floors.find(f => f.id === o.floor) || { rooms: [] }).rooms.filter(r => !r.part_of).map(r => `<option value="${esc(r.id)}" ${r.id === o.room ? 'selected' : ''}>${esc(r.name || r.id)}</option>`).join('')}</select></label>
        <label>Etage<select data-f="floorref">${P.floors.map(f => `<option value="${esc(f.id)}" ${f.id === o.floor ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        ${sel('rotate', 'Drehung (welche Seite oben auf dem Tablet)', String(deg(o.rotate)), { 0: '0° – Norden/oben bleibt oben', 90: '90° – linke Seite nach oben', 180: '180° – auf dem Kopf', 270: '270° – rechte Seite nach oben' })}
        <div class="row">${inp('x', 'x', o.x, 'number')}${inp('y', 'y', o.y, 'number')}</div><div class="row">${inp('w', 'Breite', o.w, 'number')}${inp('h', 'Höhe', o.h, 'number')}</div>
        <p>Die dicke Linie markiert die Kante, die auf dem Tablet oben ist.</p>
        <div class="btns"><button class="btn" data-a="preview">👁 Vorschau</button><button class="btn" data-a="cardyaml">Karten-YAML</button><button class="btn" data-a="rot90">⟳ 90°</button></div>${tools}`;
    }
    side.innerHTML = h;
  }
  // Spots auf dem Seil: Anzahl ändern (neue gleichmäßig) bzw. alle neu verteilen
  // Durchgang: welcher Boden läuft durch, Fußleiste in der Laibung / Übergangsleiste / keine
  _passSide(o) {
    const fl = this._fl(), a = num(o.rotate) * Math.PI / 180, n = [-Math.sin(a), Math.cos(a)], rA = roomAt(fl, [o.x + n[0] * .35, o.y + n[1] * .35]), rB = roomAt(fl, [o.x - n[0] * .35, o.y - n[1] * .35]);
    const nm = r => r ? r.name || r.id : '–', sel = (k, lab, v, opts) => `<label>${lab}<select data-f="${k}">${Object.entries(opts).map(([x, y]) => `<option value="${x}" ${x === v ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></label>`;
    const clr = (k, lab, v, def) => `<label>${lab}<span class="row" style="gap:6px"><input type="color" data-f="${k}" value="${esc(v || def)}" style="height:34px;padding:2px"><button class="btn" data-a="clr:${k}" ${v ? '' : 'disabled'}>Standard</button></span></label>`;
    return `<h4>Boden & Fußleiste im Durchgang (3D)</h4>${sel('pass_floor', 'Boden im Durchgang', o.pass_floor || 'split', { split: 'jeder Raum bis zur Wandmitte', a: `durchgehend: ${nm(rA)}`, b: `durchgehend: ${nm(rB)}` })}
      ${sel('pass_skirt', 'Fußleiste', o.pass_skirt || 'weiter', { weiter: 'läuft in die Laibung weiter (beide Seiten)', eine: 'nur eine Übergangsleiste am Boden', keine: 'keine Leiste' })}
      ${(o.pass_skirt || 'weiter') !== 'keine' ? clr('pass_skirt_color', 'Farbe Leiste', o.pass_skirt_color, (this._plan.style || {}).skirting || '#efece6') : ''}`;
  }
  // Tür: Material, Farben, Glasausschnitte (Lage/Größe/Form) für die 3D-Ansicht
  _doorSide(o) {
    const sel = (k, lab, v, opts) => `<label>${lab}<select data-f="${k}">${Object.entries(opts).map(([a, b]) => `<option value="${a}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    const clr = (k, lab, v, def) => `<label>${lab}<span class="row" style="gap:6px"><input type="color" data-f="${k}" value="${esc(v || def)}" style="height:34px;padding:2px"><button class="btn" data-a="clr:${k}" ${v ? '' : 'disabled'}>Standard</button></span></label>`;
    const m = DOOR_MATS[o.door_mat] ? o.door_mat : 'wood', P = o.panes || [], H = num(o.height, 2.05), W = num(o.length, .9) - .04;
    const pf = (k, f, lab, v, ex = '') => `<label>${lab}<input data-gp="${f}:${k}" type="number" step="0.01" value="${v ?? ''}" ${ex}></label>`;
    return `<h4>Tür (3D)</h4>${sel('door_mat', 'Material Türblatt', m, DOOR_MATS)}
      <div class="row">${sel('handle_open', 'Griff Öffnungsseite', o.handle_open || 'lever', HANDLES)}${sel('handle_other', 'Griff andere Seite', o.handle_other || 'lever', HANDLES)}</div>${clr('handle_color', 'Farbe Griffe', o.handle_color, '#c9ccd1')}
      <div class="row">${clr('leaf_color', 'Farbe Türblatt', o.leaf_color, m === 'plastic' ? '#f1f1ee' : m === 'glass' ? '#d9dcdf' : '#a3805d')}${clr('frame_color', 'Farbe Türrahmen (Zarge)', o.frame_color, '#eceef0')}</div>
      ${m !== 'glass' ? `<h4>Glas im Türblatt (${P.length})</h4><div class="btns"><button class="btn ${P.length ? '' : 'on'}" data-a="gp:ohne">ohne Glas</button>${Object.entries(GLASS_PRESETS).map(([k, v]) => `<button class="btn" data-a="gp:${k}">${v[0]}</button>`).join('')}</div>` : ''}
      ${m === 'glass' || P.length ? sel('glass_type', 'Glasart', o.glass_type || 'clear', { clear: 'Klarglas', frosted: 'Milchglas / satiniert', tinted: 'getönt' }) : ''}
      ${m !== 'glass' ? P.map((q, k) => `<div style="border:1px solid #2c2f35;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><b style="color:#c9ccd2">Glas ${k + 1}</b>
        <div class="row">${pf(k, 'x', 'seitlich von Mitte (m)', q.x ?? 0)}${pf(k, 'y', 'Mitte über Boden (m)', q.y ?? 1.25)}</div>
        <div class="row">${pf(k, 'w', 'Breite (m)', q.w ?? .4, 'min="0.02"')}${pf(k, 'h', 'Höhe (m)', q.h ?? .9, 'min="0.02"')}</div>
        <div class="row"><label>Form<select data-gp="shape:${k}">${Object.entries(PANE_SHAPES).map(([a, b]) => `<option value="${a}" ${a === (q.shape || 'rect') ? 'selected' : ''}>${b}</option>`).join('')}</select></label>${(q.shape || 'rect') === 'round' ? pf(k, 'r', 'Eckenradius (m)', q.r ?? .06, 'min="0"') : ''}</div>
        <div class="btns"><button class="btn warn" data-a="gdel:${k}">🗑 Glas entfernen</button></div></div>`).join('') + `<div class="btns"><button class="btn" data-a="gadd">+ Glas</button></div><p>Türblatt ${W.toFixed(2)} × ${(H - .02).toFixed(2)} m. „seitlich“ + = zur Griffseite.</p>` : ''}`;
  }
  _ropeSpots(o, n, all) {
    const old = o.spots || [], at = k => { const q = ropeAt(o, (k + .5) / n); return { x: q[0], y: q[1] }; };
    o.spots = Array.from({ length: n }, (_, k) => all || !old[k] ? Object.assign({}, old[k] || {}, at(k)) : old[k]);
  }
  _delVtx() {
    const s = this._sel, r = this._fl().rooms[s.i];
    if (r.points.length <= 3) { alert('Ein Raum braucht mindestens 3 Ecken.'); return; }
    r.points.splice(s.j, 1);
    edgeArrSplice(r, s.j, true);
    s.j = s.j % r.points.length; this._commit(); this._editRender(); this._side();
  }
  _delAVtx() {
    const s = this._sel, a = this._fl().areas[s.i]; if (!a || s.j == null) return;
    if (a.points.length <= (a.line ? 2 : 3)) { alert(a.line ? 'Ein Weg braucht mindestens 2 Punkte.' : 'Eine Fläche braucht mindestens 3 Ecken.'); return; }
    a.points.splice(s.j, 1); s.j = s.j % a.points.length; this._commit(); this._editRender(); this._side();
  }
  _vSave() { try { localStorage.setItem('haus-grundriss:views-hidden', JSON.stringify({ all: this._vAll, ids: [...this._vHid] })); } catch (_) { } }
  _edgeList(fl, ri) {
    const r = fl.rooms[ri], P = this._plan, KN = { int: 'innen', ext: 'außen', rail: 'Geländer', none: '–' };
    return r.points.map((a, j) => {
      const b = r.points[(j + 1) % r.points.length], k = edgeKind(fl, r, j), tw = r.wall_thickness ? r.wall_thickness[j] : null, def = k === 'ext' ? P.wall.outer : k === 'int' ? P.wall.inner : .05;
      return `<div class="li" data-sel="edge:${ri}:${j}">${j + 1}: ${(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100).toFixed(0)} cm · ${KN[k]}${(r.edge_color || [])[j] ? ` <span class="led" style="--c:${r.edge_color[j]};width:8px;height:8px"></span>` : ''}<small style="${tw != null ? 'color:#ffb347' : ''}">${tw == null ? Math.round(def * 100) + ' cm' : tw === 0 ? 'offen' : Math.round(tw * 100) + ' cm ✎'}</small></div>`;
    }).join('');
  }
  // Dicke einer Wandseite setzen (null = Standard) – gilt auch für dieselbe Wandlinie im Nachbarraum
  _setEdgeProp(key, v) {
    const s = this._sel, fl = this._fl(); if (!s || s.t !== 'edge') return;
    setEdgeArr(fl.rooms[s.i], s.j, key, v);
    coEdges(fl, s.i, s.j).forEach(([k, m]) => setEdgeArr(fl.rooms[k], m, key, v));
    this._commit(); this._editRender(); this._side();
  }
  _setEdgeT(v) {
    const s = this._sel, fl = this._fl(); if (!s || s.t !== 'edge') return;
    setEdgeT(fl.rooms[s.i], s.j, v);
    coEdges(fl, s.i, s.j).forEach(([k, m]) => setEdgeT(fl.rooms[k], m, v));
    this._commit(); this._editRender(); this._side();
  }
  _yaml(txt) {
    const m = this.shadowRoot.getElementById('modal');
    const body = txt || ('type: custom:haus-grundriss\nheight: calc(100vh - 72px)\nplan:' + toYaml(this._plan, 2));
    m.innerHTML = `<div class="modal"><div><div class="bar"><h2>${txt ? 'Karte für Raum-Dashboard' : 'Grundriss als YAML (Sicherung)'}</h2><span class="sp"></span><button class="btn" data-a="copy">Kopieren</button><button class="btn" data-a="mclose">Schließen</button></div><textarea readonly>${esc(body)}</textarea></div></div>`;
  }
  _preview3d() {
    const fl = this._fl(), m = this.shadowRoot.getElementById('modal');
    m.innerHTML = `<div class="modal"><div><div class="bar"><h2>3D-Vorschau: ${esc(fl.name)}</h2><span class="sp"></span><button class="btn" data-a="mclose">Schließen</button></div><div class="pv" id="pv"></div></div></div>`;
    const c = document.createElement('haus-grundriss');
    c.style.height = '100%';
    c.setConfig({ plan: clone(this._plan), twin: false, etage: fl.id, ansicht: '3d', editor: false, legend: false, title: '', height: '100%' });
    c.hass = this._hass;
    m.querySelector('#pv').appendChild(c);
  }
  _preview() {
    const v = this._obj(), m = this.shadowRoot.getElementById('modal');
    m.innerHTML = `<div class="modal"><div><div class="bar"><h2>Vorschau: ${esc(v.name || v.id)}</h2><span class="sp"></span><button class="btn" data-a="mclose">Schließen</button></div><div class="pv" id="pv"></div></div></div>`;
    const c = document.createElement('haus-grundriss');
    c.style.height = '100%';
    c.setConfig({ plan: this._plan, ausschnitt: v.id, editor: false, height: '100%' });
    c.hass = this._hass;
    m.querySelector('#pv').appendChild(c);
  }
}
if (!customElements.get('haus-grundriss')) customElements.define('haus-grundriss', HausGrundriss);
if (!customElements.get('home-twin-card')) customElements.define('home-twin-card', class HomeTwinCard extends HausGrundriss { });
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'home-twin-card')) window.customCards.push({ type: 'home-twin-card', name: 'Home Twin', description: 'Digitaler Zwilling: Grundriss mit Etagen, Räumen, Geräten, Möbeln und Ausschnitten für Raum-Panels (Plan in der Integration home_twin)' });
window.HausGrundriss = window.HomeTwin = { VERSION, BASE, normPlan, bldOf, planSource, FURN, DEFS, FLOORTYPES, AREATYPES, areaOk, areaW, floorWalls, floorBBox, openingBand, emitters, isOn, lightCol, heatingOn, contactState, resolveEnt, realTex, heaterDim, HEATERS, dayLight, opRooms, roomGrp, roomAt, edgeKind, pip };
console.info(`%c HOME TWIN %c ${VERSION} `, 'background:#4dc3ff;color:#000;font-weight:700', 'background:#222;color:#fff');
})();
