// Home Twin 3D – Grundriss als 3D-Szene (three.js r170, lokal unter vendor/)
// Wird von haus-grundriss.js nachgeladen, sobald eine Karte ansicht: 3d nutzt oder auf „3D“ getippt wird.
// Baut aus dem Plan: Böden (gleiche Texturen wie 2D), Außenflächen, Wände mit Höhe und Aussparungen
// für Fenster/Türen, Glas/Türblätter je Zustand, Möbel als Körper, Leuchten als echte Lichtquellen,
// Heizkörper (glühen beim Heizen), Wand-Tablets. Die HTML-Symbole der 2D-Karte werden mitgeführt.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

export const VERSION3D = '2.10.0-beta.1';
const HG = () => window.HausGrundriss;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const RAD = Math.PI / 180;

// Möbel: Höhe (m) und Farben für die 3D-Ansicht [Korpus, Akzent, Linien] – ersetzen die dunklen 2D-Farben
const FURN_H = { baum: 4.5, busch: 1.1, sofa: .8, ecksofa: .8, sessel: .85, bett: .55, bett1: .55, tisch: .75, tischrund: .75, stuhl: .9, schrank: 2.1, regal: 1.8, kueche: .9, wc: .45, waschbecken: .85, dusche: .03, wanne: .58, waschmaschine: .85, schreibtisch: .75, tv: .55, pflanze: 1.1, teppich: .012 };
const FURN_C = {
  sofa: ['#5d6472', '#727a8a', '#454b56'], ecksofa: ['#5d6472', '#727a8a', '#454b56'], sessel: ['#6b5a4c', '#82705f', '#4e4238'],
  bett: ['#d8d3ca', '#a9b2c4', '#8a909c'], bett1: ['#d8d3ca', '#a9b2c4', '#8a909c'], tisch: ['#8a6a4a', '#9a7856', '#5e4630'], tischrund: ['#8a6a4a', '#9a7856', '#5e4630'],
  stuhl: ['#6e5640', '#80654c', '#4b3a2b'], schrank: ['#d4cfc6', '#c4beb4', '#9b958b'], regal: ['#a88660', '#b8966f', '#7b6045'], kueche: ['#dcd8d0', '#b9b3a8', '#8f897f'],
  wc: ['#eef0f2', '#dfe3e7', '#a8afb7'], waschbecken: ['#eef0f2', '#dfe3e7', '#a8afb7'], dusche: ['#cfd8de', '#e3eaee', '#9aa6ae'], wanne: ['#eef0f2', '#dfe3e7', '#a8afb7'],
  waschmaschine: ['#e8eaec', '#c9cdd1', '#8f969d'], schreibtisch: ['#9a7a58', '#a98763', '#6a523a'], tv: ['#3b3f46', '#1e2126', '#5a5f69'], pflanze: ['#3d6b35', '#4f8644', '#2c4f27'], teppich: ['#7d6a5a', '#8e7b6a', '#5f5045']
};
const WALL_SIDE = '#d9d5cd', WALL_TOP = '#45484f', GLASS = '#cfe8ff', FRAME = '#eceef0', DOOR = '#a3805d';
const CCOL = { closed: '#3ddc84', tilt: '#ffb347', open: '#ff5a5a', na: '#6f737c' };

// ---------------------------------------------------------------- Texturen (aus den SVG-Mustern der 2D-Karte)
const LIVE = new Set();            // Szenen, die neu zeichnen sollen, wenn eine Textur fertig geladen ist
const TEX = new Map();
let PAT = null;
const redrawAll = () => LIVE.forEach(f => f());
// ---- eigene 3D-Modelle (SketchUp → COLLADA .dae, oder glTF .glb/.gltf)
const MODELS = new Map();
const loadModel = url => {
  if (!MODELS.has(url)) MODELS.set(url, (async () => {
    const ext = (String(url).split('?')[0].split('.').pop() || '').toLowerCase();
    let sc;
    if (ext === 'dae') { const { ColladaLoader } = await import('./vendor/ColladaLoader.js'); sc = (await new ColladaLoader().loadAsync(url)).scene; }
    else if (ext === 'glb' || ext === 'gltf') { const { GLTFLoader } = await import('./vendor/GLTFLoader.js'); sc = (await new GLTFLoader().loadAsync(url)).scene; }
    else throw new Error('Format .' + ext + ' wird nicht unterstützt (bitte .dae oder .glb)');
    sc.updateMatrixWorld(true);
    sc.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      // SketchUp-Flächen sind oft nur einseitig sichtbar → beidseitig zeichnen
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m) m.side = THREE.DoubleSide; });
    });
    return sc;
  })());
  return MODELS.get(url);
};
// Modell in einen Rahmen Breite × Tiefe (× Höhe) setzen: Mitte auf 0, Unterkante auf 0
const fitModel = (sc, w, d, h) => {
  const c = sc.clone(true), b = new THREE.Box3().setFromObject(c), s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group(); wrap.add(c); wrap.position.set(-ctr.x, -b.min.y, -ctr.z);
  const sx = w > 0 && s.x > 1e-6 ? w / s.x : 1, sz = d > 0 && s.z > 1e-6 ? d / s.z : 1, sy = h > 0 && s.y > 1e-6 ? h / s.y : (sx + sz) / 2;
  const g = new THREE.Group(); g.add(wrap); g.scale.set(sx, sy, sz); return g;
};
// Editor: echte Maße + Draufsicht (PNG, transparent) – Plan-x = Modell-x, Plan-y = Modell-z
export async function modelInfo(url, px = 320) {
  const sc = await loadModel(url), c = sc.clone(true), b = new THREE.Box3().setFromObject(c), s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
  if (!(s.x > 0 && s.z > 0)) throw new Error('Modell ist leer');
  let top = '';
  try {
    const scene = new THREE.Scene(); scene.add(c, new THREE.AmbientLight('#ffffff', 1.4));
    const dl = new THREE.DirectionalLight('#ffffff', 1.8); dl.position.set(ctr.x + s.x, b.max.y + 5, ctr.z + s.z * .6); scene.add(dl);
    const k = px / Math.max(s.x, s.z), cw = Math.max(8, Math.round(s.x * k)), chh = Math.max(8, Math.round(s.z * k));
    const cam = new THREE.OrthographicCamera(-s.x / 2, s.x / 2, s.z / 2, -s.z / 2, .01, s.y + 20);
    cam.position.set(ctr.x, b.max.y + 2, ctr.z); cam.up.set(0, 0, -1); cam.lookAt(ctr.x, b.min.y, ctr.z);
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(cw, chh, false); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.render(scene, cam);
    top = r.domElement.toDataURL('image/png'); r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
  } catch (e) { top = ''; }
  return { w: s.x, d: s.z, h: s.y, top };
}
function patterns() {
  if (PAT) return PAT;
  PAT = {};
  HG().DEFS('q').replace(/<pattern id="q(\w+)" width="([\d.]+)" height="([\d.]+)"[^>]*>/g, (m, id, w, h) => { PAT[id] = { w: +w, h: +h, rot: /rotate\(45\)/.test(m) ? 45 : 0 }; return m; });
  return PAT;
}
function svgTex(key, svg, W, H, setup, bright) {
  if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  if (setup) setup(tex);
  const img = new Image();
  img.onload = () => { const x = cv.getContext('2d'); if (bright) x.filter = bright; x.drawImage(img, 0, 0, W, H); tex.needsUpdate = true; redrawAll(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  TEX.set(key, tex); return tex;
}
function patTex(id) {
  const p = patterns()[id]; if (!p) return null;
  const ppm = Math.min(320, 1024 / Math.max(p.w, p.h)), W = Math.max(8, Math.round(p.w * ppm)), H = Math.max(8, Math.round(p.h * ppm));
  const defs = HG().DEFS('q').replace(/ patternTransform="rotate\(45\)"/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="none">${defs}<rect width="${p.w}" height="${p.h}" fill="url(#q${id})"/></svg>`;
  return svgTex('p:' + id, svg, W, H, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / p.w, 1 / p.h); if (p.rot) t.rotation = p.rot * RAD; }, BRIGHT[id] || (id.startsWith('a_') ? 'brightness(1.45) saturate(1.15)' : 'brightness(2) saturate(1.1)'));
}
function furnTex(sym, w, h) {
  const F = HG().FURN[sym]; if (!F) return null;
  const c = FURN_C[sym] || ['#8a8f98', '#a0a5ad', '#6a6f78'], ar = w / h, W = ar >= 1 ? 512 : Math.round(512 * ar), H = ar >= 1 ? Math.round(512 / ar) : 512;
  const body = F[3].replace(/#3a3e48/gi, c[0]).replace(/#4a4e57/gi, c[1]).replace(/#5a5f69/gi, c[2]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`;
  return svgTex(`f:${sym}:${W}x${H}`, svg, W, H);
}
// Die 2D-Muster sind für das dunkle Dashboard abgedunkelt – für 3D heller ziehen
const BRIGHT = { a_water: 'brightness(1.6) saturate(1.3)', a_lawn: 'brightness(1.5) saturate(1.2)', marble: 'brightness(1.5)', diag: 'brightness(1.35)', maple: 'brightness(1.5)', beech: 'brightness(1.7)' };
const MAT = new Map();
const PENDING = new Map();
const BUMP = { lawn: 1.2, garden: 1.6, hedge: 2.2, deck: 1.2, slabs: .8, paving: 2.4, gravel: 3, water: .4, asphalt: 1 };
window.addEventListener('ht-tex', e => { const f = PENDING.get(e.detail); if (f && f()) { PENDING.delete(e.detail); redrawAll(); } });
function areaMat(t) {
  const key = 'area:' + t;
  if (MAT.has(key)) return MAT.get(key);
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: ROUGH['a_' + t] ?? .92, metalness: t === 'water' ? .12 : 0 });
  const apply = () => {
    const T = HG().realTex && HG().realTex(t); if (!T || !T.cv) return false;
    const mk = cs => { const x = new THREE.CanvasTexture(T.cv); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(1 / T.w, 1 / T.w); x.anisotropy = 8; if (cs) x.colorSpace = THREE.SRGBColorSpace; return x; };
    m.map = mk(true); m.bumpMap = mk(false); m.bumpScale = BUMP[t] ?? 1; m.needsUpdate = true; return true;
  };
  if (!apply()) { m.map = patTex('a_' + t); m.needsUpdate = true; PENDING.set(t, apply); }
  MAT.set(key, m); return m;
}
const mat = (key, make) => { if (!MAT.has(key)) MAT.set(key, make()); return MAT.get(key); };
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .85, metalness: 0 }, o));
const ROUGH = { wood: .55, beech: .5, maple: .5, tiles: .35, marble: .2, diag: .3, carpet: .95, concrete: .9, screed: .7, outdoor: .8, plain: .9, a_water: .08, a_slabs: .7, a_deck: .7 };
function patMat(id) {
  return mat('pat:' + id, () => { const t = patTex(id); return std('#ffffff', { map: t, roughness: ROUGH[id] ?? .85, metalness: id === 'a_water' ? .15 : 0 }); });
}

// ---------------------------------------------------------------- Geometrie-Helfer (Plan x/y in Metern, y nach unten → three x/z)
const V2 = p => new THREE.Vector2(p[0], -p[1]);
function shapeOf(pts) { return new THREE.Shape(pts.map(V2)); }
function flat(pts, y, m) {
  const g = new THREE.ShapeGeometry(shapeOf(pts)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const o = new THREE.Mesh(g, m); o.receiveShadow = true; return o;
}
function prism(pts, z0, z1, m, cast = true) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: Math.max(.002, z1 - z0), bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0);
  const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o;
}
// Weg/Linie mit Breite → Vierecke je Abschnitt + runde Gelenke (gleiche Welt-UVs, Überlappung unsichtbar)
function stripPolys(P, w, round) {
  const out = [], h = w / 2;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], L = dist(a, b); if (L < 1e-4) continue;
    const n = [-(b[1] - a[1]) / L * h, (b[0] - a[0]) / L * h];
    out.push([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]);
  }
  if (round) P.forEach(p => { const c = []; for (let k = 0; k < 16; k++) c.push([p[0] + Math.cos(k / 16 * Math.PI * 2) * h, p[1] + Math.sin(k / 16 * Math.PI * 2) * h]); out.push(c); });
  return out;
}

// Wand-Rahmen: Länge, Richtung, Grundriss eines Teilstücks [s0,s1] (Außenwände mit Gehrung)
function wallFrame(w) {
  if (w.kind === 'ext' && w.poly) {
    const [a0, b0, ob, oa] = w.poly, L = dist(a0, b0) || 1e-3, u = [(b0[0] - a0[0]) / L, (b0[1] - a0[1]) / L], on = w.on, t = w.t;
    const inn = s => [a0[0] + u[0] * s, a0[1] + u[1] * s];
    const out = s => s <= 1e-4 ? oa : s >= L - 1e-4 ? ob : [inn(s)[0] + on[0] * t, inn(s)[1] + on[1] * t];
    return { L, u, t, mid: s => { const i = inn(s); return [i[0] + on[0] * t / 2, i[1] + on[1] * t / 2]; }, quad: (s0, s1) => [inn(s0), inn(s1), out(s1), out(s0)] };
  }
  const L0 = dist(w.a, w.b) || 1e-3, u = [(w.b[0] - w.a[0]) / L0, (w.b[1] - w.a[1]) / L0], h = w.t / 2, A = [w.a[0] - u[0] * h, w.a[1] - u[1] * h], n = [-u[1], u[0]];
  const c = s => [A[0] + u[0] * s, A[1] + u[1] * s];
  return { L: L0 + w.t, u, t: w.t, mid: c, quad: (s0, s1) => { const p = c(s0), q = c(s1); return [[p[0] + n[0] * h, p[1] + n[1] * h], [q[0] + n[0] * h, q[1] + n[1] * h], [q[0] - n[0] * h, q[1] - n[1] * h], [p[0] - n[0] * h, p[1] - n[1] * h]]; } };
}
function wallHoles(fr, ops) {
  const out = [];
  ops.forEach((op, k) => {
    const a = num(op.rotate) * RAD, ou = [Math.cos(a), Math.sin(a)];
    if (Math.abs(ou[0] * fr.u[1] - ou[1] * fr.u[0]) > .3) return;
    const m = fr.mid(0), dx = op.x - m[0], dy = op.y - m[1], s = dx * fr.u[0] + dy * fr.u[1], d = Math.abs(-dx * fr.u[1] + dy * fr.u[0]);
    if (d > fr.t / 2 + .1) return;
    const s0 = Math.max(0, s - op.length / 2), s1 = Math.min(fr.L, s + op.length / 2);
    if (s1 - s0 > .05) out.push({ op, k, s0, s1 });
  });
  return out.sort((x, y) => x.s0 - y.s0);
}
const opRange = (op, H) => { if (op.type === 'window') return [clamp(num(op.sill, .9), 0, H), clamp(num(op.sill, .9) + num(op.height, 1.3), 0, H)]; const e = clamp(num(op.elev, 0), 0, Math.max(0, H - .1)); return [e, Math.min(H - .02, e + num(op.height, 2.05))]; };

// Lodernde Flamme (Shader, additiv): Zungen aus bewegtem Rauschen, heller Kern, Glimmen am Fuß
const FLAME_U = { t: { value: 0 } };
const FLAME_M = new THREE.ShaderMaterial({
  uniforms: FLAME_U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float t; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + 1.0), f.x), f.y); }
void main(){
  vec2 uv = vUv; float y = uv.y;
  float q = n(vec2(uv.x * 5.0, y * 3.0 - t * 2.6)) * 0.6 + n(vec2(uv.x * 11.0, y * 7.0 - t * 4.3)) * 0.4;
  float w = (1.0 - y) * 0.36 + 0.02;
  float dx = abs(uv.x - 0.5 + (q - 0.5) * 0.22 * y);
  float body = smoothstep(w, w * 0.25, dx) * smoothstep(1.0, 0.15, y + q * 0.45) * smoothstep(0.0, 0.1, y);
  float core = smoothstep(w * 0.55, 0.0, dx) * smoothstep(0.65, 0.05, y + q * 0.3) * smoothstep(0.0, 0.12, y);
  vec3 col = mix(vec3(1.0, 0.55, 0.12), vec3(0.95, 0.18, 0.04), clamp(y * 1.3 + q * 0.2, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.92, 0.6), core);
  float glow = smoothstep(0.55, 0.0, length((uv - vec2(0.5, 0.1)) * vec2(1.0, 1.8))) * (0.16 + 0.06 * sin(t * 7.0) + 0.04 * sin(t * 13.0));
  float a = clamp(body * 0.95 + core * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(col * a * 0.85 + vec3(1.0, 0.45, 0.1) * glow, a + glow * 0.5);
}`
});
// Flammen-Symbol als Aufkleber (leuchtet auch nachts, liegt auf der Heizkörper-Front)
function flameDecal(col) { return mat('flameD:' + col, () => new THREE.MeshBasicMaterial({ map: flameMat(col).map, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 })); }
// Flammen-Symbol als Sprite (Heizung heizt)
function flameMat(col) {
  return mat('flame:' + col, () => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(20,22,25,.88)'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill(); x.lineWidth = 6; x.strokeStyle = col; x.stroke();
    x.translate(24, 22); x.scale(3.4, 3.4); x.fillStyle = col; x.fill(new Path2D('M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-6 1-8.5z'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: true });
  });
}
// Glasausschnitt im Türblatt (Koordinaten im Blatt: x 0…Lw ab Band, y 0…dh ab Boden)
function paneOf(q, Lw, dh) {
  const w = clamp(num(q.w, .4), .02, Lw - .06), h = clamp(num(q.h, .9), .02, dh - .06);
  const cx = clamp(Lw / 2 + num(q.x), w / 2 + .03, Lw - w / 2 - .03), cy = clamp(num(q.y, 1.25), h / 2 + .03, dh - h / 2 - .03);
  return { cx, cy, w, h, shape: q.shape || 'rect', r: clamp(num(q.r, .06), 0, Math.min(w, h) / 2) };
}
function paneShape(q, Cls) {
  const p = new Cls(), x0 = q.cx - q.w / 2, x1 = q.cx + q.w / 2, y0 = q.cy - q.h / 2, y1 = q.cy + q.h / 2;
  if (q.shape === 'circle') { p.absellipse(q.cx, q.cy, q.w / 2, q.h / 2, 0, Math.PI * 2, false, 0); return p; }
  if (q.shape === 'arch') { const ar = q.w / 2, ya = Math.max(y0, y1 - ar); p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, ya); p.absarc(q.cx, ya, ar, 0, Math.PI, false); p.lineTo(x0, y0); return p; }
  if (q.shape === 'round' && q.r > .002) { const r = q.r; p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false); p.lineTo(x1, y1 - r); p.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false); p.lineTo(x0 + r, y1); p.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false); p.lineTo(x0, y0 + r); p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false); return p; }
  p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.lineTo(x0, y0); return p;
}
// Sichtbarer Lichtkegel (Spot): additiv, zum Rand und zum Ende hin ausblendend
const CONE_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const CONE_FS = 'uniform vec3 col; uniform float op; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.6); float a = op * pow(vUv.y, 1.4) * e; gl_FragColor = vec4(col * a, a); }';
// Laub: Kugel mit gleichmäßig verbeulter Oberfläche (positionsabhängig → keine Risse)
// ---------- Gebäude: Fassaden mit Fensterreihen, Satteldächer
const BLD_C = { unit: '#d8d1c4', own: '#d8d1c4', stair: '#cdc6ba', hall: '#cdc6ba', neighbor: '#bdb5a8' };
function facadeMat(col, h, win) {
  return mat(`fac:${col}:${h.toFixed(2)}:${win ? 1 : 0}`, () => {
    const m = std(col, { roughness: .95 }); if (!win) return m;
    const W = 128, Hc = Math.max(32, Math.round(128 * h / 2.4)), c = document.createElement('canvas'); c.width = W; c.height = Hc;
    const x = c.getContext('2d'), py = v => Hc * (1 - v / h);   // v = Höhe über dem Geschossboden (m)
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, Hc);
    const wx0 = W * .3, wx1 = W * .7, y0 = py(Math.min(h - .3, 2.25)), y1 = py(.85);
    x.fillStyle = '#ece9e3'; x.fillRect(wx0 - 5, y0 - 5, wx1 - wx0 + 10, y1 - y0 + 12);
    x.fillStyle = '#3a4654'; x.fillRect(wx0, y0, wx1 - wx0, y1 - y0);
    x.fillStyle = '#f4f4f2'; x.fillRect((wx0 + wx1) / 2 - 1.5, y0, 3, y1 - y0); x.fillRect(wx0, y0, wx1 - wx0, 2); x.fillRect(wx0, y1 - 2, wx1 - wx0, 2);
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(wx0 + 3, y0 + 3, (wx1 - wx0) * .3, (y1 - y0) * .3);
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, Hc - 3, W, 3);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false;
    t.repeat.set(1 / 2.4, 1 / h); t.offset.set(0, -1 / h); t.anisotropy = 4; m.map = t; return m;
  });
}
function roofMesh(r, eave, mR, mG) {
  const o = num(r.overhang, .35), tn = Math.tan(clamp(num(r.pitch, 38), 5, 60) * RAD);
  let [x0, y0, x1, y1] = r.rect.map(Number); if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0];
  const ax = String(r.ridge || 'x').toLowerCase() !== 'y', P = (a, b, y) => ax ? [a, y, b] : [b, y, a];
  const a0 = ax ? x0 : y0, a1 = ax ? x1 : y1, b0 = ax ? y0 : x0, b1 = ax ? y1 : x1, bm = (b0 + b1) / 2, top = eave + (bm - b0) * tn, low = eave - o * tn;
  const geo = (pts, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const grp = new THREE.Group();
  const sl = geo([P(a0 - o, b0 - o, low), P(a1 + o, b0 - o, low), P(a1 + o, bm, top), P(a0 - o, bm, top), P(a0 - o, bm, top), P(a1 + o, bm, top), P(a1 + o, b1 + o, low), P(a0 - o, b1 + o, low)], [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  const ms = new THREE.Mesh(sl, mR); ms.castShadow = true; ms.receiveShadow = false; grp.add(ms);
  const gb = geo([P(a0, b0, eave), P(a0, bm, top), P(a0, b1, eave), P(a1, b0, eave), P(a1, bm, top), P(a1, b1, eave)], [0, 1, 2, 3, 5, 4]);
  const mg = new THREE.Mesh(gb, mG); mg.castShadow = true; mg.receiveShadow = true; grp.add(mg);
  return grp;
}
function blob(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 2), P = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const n = v.clone().normalize(), f = 1 + .16 * Math.sin(n.x * 5.3 + seed) * Math.sin(n.y * 4.1 + seed * 1.7) * Math.sin(n.z * 6.2 + seed * .6) + .06 * Math.sin(n.x * 17 + n.z * 13 + seed); v.copy(n).multiplyScalar(r * f); P.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
// ---------------------------------------------------------------- Szene
export class Twin3D {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.localClippingEnabled = true; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;   // Schatten nur bei Änderungen neu berechnen
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, .3, 400);
    this.hemi = new THREE.HemisphereLight('#e8eeff', '#3a332c', 1.15); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.1); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .03; this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.controls = new OrbitControls(this.camera, r.domElement);
    const c = this.controls;
    c.enableDamping = false; c.screenSpacePanning = false; c.rotateSpeed = .55; c.maxPolarAngle = 84 * RAD; c.minDistance = 1.5; c.maxDistance = 120; c.zoomToCursor = true;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.addEventListener('change', () => this.render());
    this.dyn = []; this.key = null; this.fitKey = null; this.size = [0, 0];
    this._redraw = () => this.render();
    LIVE.add(this._redraw);
    this.ro = new ResizeObserver(() => this._resize());
  }
  dims(on) { if (this.dimsOn === !!on) return; this.dimsOn = !!on; if (this.dl) this.dl.style.display = on ? '' : 'none'; this.render(); }
  attach(host, mk) {
    this.host = host; this.mk = mk;
    if (!this.dl) { this.dl = document.createElement('div'); this.dl.className = 'v3dl'; this.dl.style.display = this.dimsOn ? '' : 'none'; }
    if (this.dl.parentNode !== host) host.appendChild(this.dl);
    if (this.renderer.domElement.parentNode !== host) host.appendChild(this.renderer.domElement);
    this.ro.disconnect(); this.ro.observe(host);
    this._resize();
  }
  _resize() {
    if (!this.host) return;
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    if (w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h]; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.pendingFit) this.fit(); else this.render();
  }
  dispose() {
    this._dead = true; if (this._an) cancelAnimationFrame(this._an);
    LIVE.delete(this._redraw); this.ro.disconnect(); this.controls.dispose();
    this._clear(); this.renderer.dispose(); this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.remove();
  }
  _clear() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear(); this.dyn = []; this.lights = []; this.winLights = []; this.spills = []; this.lamps = []; this.fills = []; this.flames = [];
  }

  // o: { plan, fl, hass, cfg, rect, rot }
  update(o) {
    this.cfg = o.cfg; this.plan = o.plan; this.bld = o.cfg._bld || null; this.bldMode = o.cfg._bldMode || 'wohnung';
    this.nb = o.cfg._nb || 'an'; this.un = o.cfg._un || 'an'; this.only = o.cfg._only || null;
    const { plan, cfg } = o, fl = this.only ? this._onlyFl(o.fl, plan, this.only) : o.fl; this.fl = fl;
    const H = clamp(num(cfg.wandhoehe ?? cfg.wall_height, num(plan.wall.height, 2.5)), .3, 6);
    this.half = !!cfg._half;
    const key = JSON.stringify([this.half, this.bld, this.bldMode, this.nb, this.un, this.only, cfg.wand_schnitt ?? cfg.wall_cut, fl.rooms, fl.walls, fl.openings.map(x => [x.x, x.y, x.rotate, x.length, x.type, x.hinge, x.sill, x.height, x.door_mat, x.leaf_color, x.frame_color, x.glass_type, x.panes, x.win_pos, x.no_sill_board, x.handle_open, x.handle_other, x.handle_color]), fl.furniture.map(m => Object.assign({}, m, { src: m.src ? m.src.length : 0, top: m.top ? m.top.length : 0 })), fl.areas, fl.devices.map(d => [d.type, d.x, d.y, d.lamp, d.spots, d.mount_height, d.heater, d.heater_length, d.heater_rotate, d.rotate, d.beam_dir, d.beam_tilt, d.beam_spread, d.radius, d.heater_kind, d.heater_height, d.heater_depth, d.heater_elev, d.heater_color, d.glow_color]), plan.wall, plan.style, H, cfg.schatten3d ?? cfg.shadows_3d, cfg.flammen3d]);
    this.shadows = (cfg.schatten3d ?? cfg.shadows_3d) !== false;
    this.renderer.shadowMap.enabled = this.shadows; this.sun.castShadow = this.shadows;
    if (key !== this.key) { this.key = key; this._build(plan, fl, H, o.hass); }
    this.controls.enabled = (cfg.bewegen3d ?? cfg.controls_3d) !== false;
    this.occlude = (cfg.verdecken3d ?? cfg.occlude_3d) !== false; this.lightShadows = (cfg.lichtschatten ?? cfg.light_shadows) !== false;
    const fk = JSON.stringify([o.rect, o.rot, cfg.neigung ?? cfg.tilt, fl.id, !!cfg._half, this.bldMode, !!this.bld]);
    if (fk !== this.fitKey) { this.fitKey = fk; this.rect = o.rect; this.rot = o.rot; this.tilt = clamp(num(cfg.neigung ?? cfg.tilt, o.view ? (cfg._half ? 40 : 22) : 38), 0, 80); this.fit(); }
    this.daylight = (cfg.tageslicht ?? cfg.daylight) !== false;
    this.states(o.hass);
  }
  fit() {
    const [x0, y0, x1, y1] = this.rect || [0, 0, 10, 8], w = this.size[0], h = this.size[1];
    if (!w || !h) { this.pendingFit = true; return; }
    this.pendingFit = false;
    const c = new THREE.Vector3((x0 + x1) / 2, 0, (y0 + y1) / 2), r = this.rot || 0, t = this.tilt * RAD;
    const ca = Math.abs(Math.cos(r * RAD)), sa = Math.abs(Math.sin(r * RAD)), rw = (x1 - x0) * ca + (y1 - y0) * sa, rh = (x1 - x0) * sa + (y1 - y0) * ca, f = this.camera.fov * RAD / 2;
    const dh = rh * (Math.cos(t) + .35 * Math.sin(t)) / 2 / Math.tan(f), dw = rw / 2 / (Math.tan(f) * this.camera.aspect), d = Math.max(dh, dw) * .98 + .3 + (this.bld && this.bldMode === 'haus' && !this.half ? 16 : this.bld && this.bldMode !== 'wohnung' ? 3 : 0);
    const dir = new THREE.Vector3(Math.sin(r * RAD) * Math.sin(t), Math.cos(t), Math.cos(r * RAD) * Math.sin(t));
    this.camera.position.copy(c).addScaledVector(dir, d);
    this.camera.up.set(0, 1, 0);
    if (t < 1 * RAD) { this.camera.position.x += -Math.sin(r * RAD) * .001; this.camera.position.z += Math.cos(r * RAD) * .001; }
    this.controls.target.copy(c); this.controls.update();
    this.render();
  }
  reset() { this.fit(); }

  _build(plan, fl, H, hass) {
    this._clear();
    const G = HG(), R = this.root, walls = fl._walls || G.floorWalls(fl, plan.wall), sty = plan.style || {}, efl = fl._full || fl;
    const capM = mat('wall:top', () => std(WALL_TOP, { roughness: .95 })), sideM = mat('wall:side', () => std(WALL_SIDE, { roughness: .92 }));
    const bb = G.floorBBox(plan, fl), cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2, span = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
    this.center = [cx, cz]; this.span = span;
    // Boden draußen
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(span + 60, span + 60), mat('ground', () => std('#24272b', { roughness: 1 })));
    const OUT = new THREE.Group(); R.add(OUT); this.out = OUT;   // Gelände – sinkt im Gebäude-Modus auf Erdgeschoss-Höhe
    gnd.rotation.x = -Math.PI / 2; gnd.position.set(cx, -.015, cz); gnd.receiveShadow = true; OUT.add(gnd);
    // Außenflächen
    (fl.areas || []).forEach((a, i) => {
      if (!G.areaOk(a)) return;
      const m = a.type === 'plain' || !G.AREATYPES[a.type] ? mat('col:' + (a.color || '#2a2d33'), () => std(a.color || '#2a2d33')) : areaMat(a.type);
      const y = .004 + i * .006, polys = a.line ? stripPolys(a.points, G.areaW(a), a.cap !== 'butt') : [a.points];
      polys.forEach(P => OUT.add(a.type === 'hedge' ? prism(P, 0, num(a.h3d, .95), m) : flat(P, y, m)));
    });
    const fy = .01 + (fl.areas || []).length * .006;
    // Böden
    fl.rooms.forEach(r => { if (r.points.length >= 3) R.add(flat(r.points, fy, patMat(G.FLOORTYPES[r.floor] ? r.floor : 'wood'))); });
    this.fy = fy;
    if (!sty.skirting_off) {
      const skH = clamp(num(sty.skirting_h, .06), .02, .2), skT = .014;
      fl.rooms.forEach(r => {
        if (r.points.length < 3 || r.floor === 'outdoor' || r.no_skirting) return;
        const col = r.skirt_color || sty.skirting || '#efece6', m = mat('skirt:' + col, () => std(col, { roughness: .45 })), P = r.points;
        P.forEach((a, j) => {
          const b = P[(j + 1) % P.length], L = dist(a, b), kind = G.edgeKind(efl, r, j); if (L < .05 || kind === 'none' || kind === 'rail') return;
          const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let nn = [-u[1], u[0]]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (!G.pip([mid[0] + nn[0] * .02, mid[1] + nn[1] * .02], P)) nn = [-nn[0], -nn[1]];
          const tw = r.wall_thickness && r.wall_thickness[j] != null ? r.wall_thickness[j] : kind === 'ext' ? plan.wall.outer : plan.wall.inner; if (tw <= 0) return;
          const off = kind === 'int' ? tw / 2 : 0, cuts = [];
          fl.openings.forEach(op => { if (op.type === 'window' || num(op.elev) > .05) return; const dx = op.x - a[0], dy = op.y - a[1], s = dx * u[0] + dy * u[1], d = Math.abs(-dx * u[1] + dy * u[0]); if (d < .12 && s > -op.length / 2 && s < L + op.length / 2) cuts.push([s - op.length / 2, s + op.length / 2]); });
          cuts.sort((x, y) => x[0] - y[0]); let c0 = 0; const seg = [];
          cuts.forEach(([s0, s1]) => { if (s0 > c0) seg.push([c0, Math.min(L, s0)]); c0 = Math.max(c0, s1); }); if (c0 < L) seg.push([c0, L]);
          seg.forEach(([s0, s1]) => { if (s1 - s0 < .02) return; const sm = (s0 + s1) / 2, o = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, skH, skT), m); o.position.set(a[0] + u[0] * sm + nn[0] * (off + skT / 2), fy + skH / 2, a[1] + u[1] * sm + nn[1] * (off + skT / 2)); o.rotation.y = -Math.atan2(u[1], u[0]); o.receiveShadow = true; R.add(o); });
        });
      });
    }
    // Wände mit Aussparungen
    this.occ = []; this.dimList = []; this.opH = new Map();
    // Außenwand = auf mindestens einer Seite liegt (in ~0,8 m Abstand) kein Innenraum; Balkone (Geländer) zählen als außen
    const inRoom = q => fl.rooms.some(r => r.floor !== 'outdoor' && r.points.length >= 3 && !(r.edge_style || []).includes('rail') && !(r.part_of) && !/balk|balcon|terras/i.test((r.id || '') + ' ' + (r.name || '')) && G.pip(q, r.points));
    const isOuter = w => {
      if (this.only) return true;
      if (!w.a || !w.b) return true;
      const ux = w.b[0] - w.a[0], uy = w.b[1] - w.a[1], L = Math.hypot(ux, uy); if (L < .05) return true;
      // je Stelle entlang der Wand: auf beiden Seiten innerhalb von 1,6 m ein Raum → innen; Mehrheit entscheidet
      const nx = -uy / L, ny = ux / L, t0 = num(w.t, .2) / 2, D = [.25, .5, .8, 1.2, 1.6].map(d => d + t0);
      const side = (mx, my, sg) => D.some(d => inRoom([mx + sg * nx * d, my + sg * ny * d]));
      const F = [.1, .3, .5, .7, .9], inner = F.filter(f => { const mx = w.a[0] + ux * f, my = w.a[1] + uy * f; return side(mx, my, 1) && side(mx, my, -1); }).length;
      return inner * 2 < F.length;
    };
    this.wallCuts = []; this.lids = [];
    const lidM = mat('wall:lid', () => std(WALL_TOP, { roughness: .95, side: THREE.DoubleSide }));
    const mkLid = (q, z1, wc) => {
      const A = q[0], B = q[1], Cq = q[2], D = q[3], len = Math.hypot(B[0] - A[0], B[1] - A[1]), N = Math.max(1, Math.ceil(len / .04));
      const P = [], idx = [];
      for (let i = 0; i <= N; i++) { const f = i / N; P.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f], [D[0] + (Cq[0] - D[0]) * f, D[1] + (Cq[1] - D[1]) * f]); }
      for (let i = 0; i < N; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(P.length * 3), 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, lidM); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false; R.add(m);
      this.lids.push({ g, P, z1, wc });
    };
    walls.forEach(w => {
      const wOut = w.kind === 'rail' || isOuter(w);
      let wc = null;
      if (wOut && w.kind !== 'rail' && w.a && w.b) { const ux = w.b[0] - w.a[0], uy = w.b[1] - w.a[1], L = Math.hypot(ux, uy); if (L > .01) { wc = { id: 'wc' + this.wallCuts.length, pl: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4), a: w.a, u: [ux / L, uy / L] }; this.wallCuts.push(wc); } }
      if (w.kind === 'rail') return this._rail(w, sty, fl.rooms.find(r => r.id === w.rid) || {});
      const Hw = w.h == null || w.h === '' ? H : clamp(num(w.h, H), .05, 6), fr = wallFrame(w), holes = wallHoles(fr, fl.openings), wm = w.col ? [capM, mat('wcol:' + w.col, () => std(w.col, { roughness: .9 }))] : [capM, sideM];
      const solid = (s0, s1, z0, z1) => { if (s1 - s0 > .004 && z1 - z0 > .004) { const o = prism(fr.quad(s0, s1), z0 <= .001 ? -.06 : z0, z1, wm); o.userData.cut = 'wall'; if (!wOut) o.userData.bldCut = true; if (wc) o.userData.wc = wc; R.add(o); this.occ.push(o); if (this.half && z0 <= .001 && z1 > H * .5 + .01) mkLid(fr.quad(s0, s1), z1, wc); } };
      let cur = 0;
      holes.forEach(hh => {
        if (!this.opH.has(hh.k)) this.opH.set(hh.k, Hw);
        if (hh.s0 > cur) solid(cur, hh.s0, 0, Hw);
        const [z0, z1] = opRange(hh.op, Hw), a = Math.max(cur, hh.s0);
        solid(a, hh.s1, 0, z0); solid(a, hh.s1, z1, Hw);
        cur = Math.max(cur, hh.s1);
      });
      if (cur < fr.L) solid(cur, fr.L, 0, Hw);
      if (fr.L > .7) { const m = fr.mid(fr.L / 2); this.dimList.push([m[0], m[1], Hw]); }
    });
    this._dimEls = null;
    // Gebäude: Nachbarwohnungen, Treppenhaus, Nachbarhaus, Dächer
    this._building(H); OUT.position.y = -(this.bldE || 0);
    // Decken (unsichtbar, werfen aber Schatten): Sonne fällt nur durch Fenster und offene Türen in die Räume
    if ((this.cfg && (this.cfg.decke3d ?? this.cfg.ceiling_3d)) !== false) {
      const cm = mat('ceil', () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      fl.rooms.forEach(r => { if (r.points.length < 3 || r.floor === 'outdoor') return; const hc = Math.max(H, ...(r.edge_height || []).filter(v => v != null).map(Number)); const c = prism(r.points, hc, hc + .06, cm, true); c.receiveShadow = false; R.add(c); });
    }
    // Fenster & Türen
    fl.openings.forEach((op, k) => this._opening(op, k, walls, this.opH.get(k) ?? H));
    // Streulicht je Raum(-gruppe): weiches Füll-Licht in Raummitte, an sobald dort eine Leuchte brennt
    const grps = new Map();
    fl.rooms.forEach(r => { if (r.points.length < 3 || r.floor === 'outdoor') return; const k = G.roomGrp(r), o = grps.get(k) || { pts: [], area: 0 }; o.pts.push(...r.points); o.area += Math.abs(r.points.reduce((s0, p, i) => { const q = r.points[(i + 1) % r.points.length]; return s0 + p[0] * q[1] - q[0] * p[1]; }, 0) / 2); if (!r.part_of) o.main = r; grps.set(k, o); });
    grps.forEach((o, k) => {
      const m = o.main || { points: o.pts }, P = m.points, cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length, rad = Math.sqrt(o.area);
      const L = new THREE.PointLight('#ffd9a0', 0, Math.max(3, rad * 1.7), 1.1); L.visible = false; L.position.set(cx, Math.min(H * .62, 1.8), cy);
      L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -.0008; L.shadow.normalBias = .006; L.shadow.camera.near = .05; R.add(L);
      this.fills.push({ L, grp: k, area: o.area });
    });
    // Lichtschein durch offene Türen: je Seite ein weicher Kegel in den Nachbarraum (an, wenn die Tür offen und die andere Seite beleuchtet ist)
    fl.openings.forEach(op => {
      if (op.type === 'window') return;
      const a = num(op.rotate) * RAD, n = [-Math.sin(a), Math.cos(a)];
      [1, -1].forEach(sd => {
        const from = G.roomAt(fl, [op.x + n[0] * .35 * sd, op.y + n[1] * .35 * sd]), to = G.roomAt(fl, [op.x - n[0] * .35 * sd, op.y - n[1] * .35 * sd]);
        if (!from || !to || G.roomGrp(from) === G.roomGrp(to)) return;
        const L = new THREE.SpotLight('#ffd9a0', 0, 5, 58 * RAD, .85, 2); L.visible = false;
        L.position.set(op.x + n[0] * .3 * sd, 1.25, op.y + n[1] * .3 * sd); L.target.position.set(op.x - n[0] * 2.6 * sd, .25, op.y - n[1] * 2.6 * sd);
        L.shadow.mapSize.set(512, 512); L.shadow.bias = -.0008; L.shadow.normalBias = .006; L.shadow.camera.near = .05; R.add(L, L.target);
        this.spills.push({ L, op, from: G.roomGrp(from) });
      });
    });
    // Möbel
    fl.furniture.forEach(m => this._furn(m));
    // Geräte
    this.lights = [];
    fl.devices.forEach(d => this._device(d, H, plan));
    // Reichweite je Leuchte: mit Schatten voll, ohne Schatten auf die Raumgröße begrenzt
    (this.lamps || []).forEach(q => { const r = G.roomAt(fl, [q.x, q.y]); q.dFull = q.L.distance; q.dSmall = r ? clamp(Math.sqrt(Math.abs(r.points.reduce((s0, p, i) => { const t = r.points[(i + 1) % r.points.length]; return s0 + p[0] * t[1] - t[0] * p[1]; }, 0) / 2)) * .55, 1, q.dFull) : q.dFull; });
    // Schnitt (halbe Wände): Wände, Fenster, Türen, Tablets, Wandleuchten bekommen eigene Materialien mit Schnittebene
    this.cutH = H * .5; this.H3 = H; this.cutMode = String((this.cfg && (this.cfg.wand_schnitt ?? this.cfg.wall_cut)) || 'schraeg').toLowerCase();
    // Außenkanten der sichtbaren Räume (Normale nach außen, Innenfläche) – daraus werden die hintersten Wände
    const inside = p => fl.rooms.some(r => r.floor !== 'outdoor' && r.points.length >= 3 && G.pip(p, r.points));
    this.bnd = [];
    walls.forEach(w => {
      if (w.kind === 'rail' || !w.a || !w.b) return;
      const ux = w.b[0] - w.a[0], uy = w.b[1] - w.a[1], L = Math.hypot(ux, uy); if (L < .4) return;
      const nx = -uy / L, ny = ux / L, mx = (w.a[0] + w.b[0]) / 2, my = (w.a[1] + w.b[1]) / 2, t = num(w.t, .2), e = t / 2 + .12;
      const i1 = inside([mx + nx * e, my + ny * e]), i2 = inside([mx - nx * e, my - ny * e]); if (i1 === i2) return;
      const ox = i1 ? -nx : nx, oy = i1 ? -ny : ny, px = mx - ox * t / 2, py = my - oy * t / 2;   // Innenfläche
      this.bnd.push({ n: [ox, oy], c: px * ox + py * oy, p: [px, py], L, q: [[w.a[0] - ox * t / 2, w.a[1] - oy * t / 2], [w.b[0] - ox * t / 2, w.b[1] - oy * t / 2]] });
    });
    if (this.half) {
      const cm = new Map(), plane = this.clip || (this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), this.cutH)), floor = this.clipMin || (this.clipMin = new THREE.Plane(new THREE.Vector3(0, -1, 0), .35));
      const flat = this.clipFlat || (this.clipFlat = new THREE.Plane(new THREE.Vector3(0, -1, 0), this.cutH)); flat.constant = this.cutH;
      const planes = [flat, plane, floor], planesB = [flat, floor];
      // Schnittflächen geschlossen zeigen: Innenseiten der aufgeschnittenen Wände in Wandkopf-Farbe
      const capF = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(0.27, 0.282, 0.31, 1.0);'); };
      const cl = (m, wall, bc, wc) => { const k = m.uuid + (wall ? 'w' : '') + (bc ? 'b' : '') + (wc ? wc.id : ''); if (!cm.has(k)) { const c = m.clone(); c.clippingPlanes = wc ? [flat, wc.pl, floor] : bc ? planesB : planes; c.clipIntersection = true; c.clipShadows = false; if (wall) { c.side = THREE.DoubleSide; c.onBeforeCompile = capF; c.customProgramCacheKey = () => 'wallcap'; } cm.set(k, c); } return cm.get(k); };
      const mark = o => { if (!o.isMesh || o.material === FLAME_M) return; const w = o.userData.cut === 'wall', bc = !!o.userData.bldCut, wc = o.userData.wc; o.material = Array.isArray(o.material) ? o.material.map(m => cl(m, w, bc, wc)) : cl(o.material, w, bc, wc); };
      R.traverse(o => { if (o.userData.cut) mark(o); else if (o.userData.cutAll) o.traverse(mark); });
      this._clipUpd();
    }
    // Sonne: Schattenbereich um den Plan
    const sc = this.sun.shadow.camera, ext = span / 2 + 3 + (this.bldE ? 14 : 0); sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = .5; sc.far = span * 3 + 60; sc.updateProjectionMatrix();
  }
  // Raum-Dashboard: nur die Raumgruppe – Wände, Öffnungen, Geräte und Möbel an diesem Raum
  _onlyFl(fl, plan, grp) {
    const G = HG(), rooms = fl.rooms.filter(r => r.points.length >= 3 && G.roomGrp(r) === grp); if (!rooms.length) return fl;
    const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    const bd = p => Math.min(...rooms.flatMap(r => r.points.map((a, j) => segD(p, a, r.points[(j + 1) % r.points.length]))));
    const inG = p => rooms.some(r => G.pip(p, r.points)), near = p => inG(p) || bd(p) < .35;
    const walls = G.floorWalls(fl, plan.wall).filter(w => { const a = w.a0 || w.a, b = w.b0 || w.b; if (!a || !b) return false; let n = 0; for (let k = 1; k <= 5; k++) { const t = k / 6; if (bd([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) < .3) n++; } return n >= 3; });
    return Object.assign({}, fl, { rooms, _walls: walls, _full: fl, openings: fl.openings.filter(o => bd([num(o.x), num(o.y)]) < .35), devices: fl.devices.filter(d => d.x == null || near([num(d.x), num(d.y)])), furniture: fl.furniture.filter(m => inG([num(m.x), num(m.y)])) });
  }
  _building(H) {
    const b = this.bld, mode = this.bldMode; this.bldE = 0;
    if (!b || !mode || (mode === 'wohnung' && !this.only)) return;
    const S = b.storeys, n = S.length, own = clamp(Math.round(num(b.own, 0)), 0, n - 1), knee = clamp(num(b.knee, .5), 0, 3);
    const hs = S.map(s => clamp(num(s.h, H + .35), 1.5, 8)), base = []; let acc = 0; S.forEach((s, i) => { base.push(acc); acc += hs[i]; });
    const E = base[own], dg = S.findIndex(s => s.roof), eaveL = (dg > -1 ? base[dg] : acc) + knee;
    this.bldE = Math.max(.001, E);
    if (mode === 'wohnung') return;   // nur der Raum – er schwebt in seiner echten Höhe über dem Gelände
    const B = new THREE.Group(); B.position.y = -E; this.root.add(B);
    const half = this.half, gh = new Map();
    const ghost = m => { if (!gh.has(m.uuid)) { const c = m.clone(); c.transparent = true; c.opacity = .045; c.depthWrite = false; c.side = THREE.DoubleSide; c.map = null; gh.set(m.uuid, c); } return gh.get(m.uuid); };
    const capM = mat('bld:cap', () => std('#6b6f76', { roughness: .95 })), edgeM = mat('bld:edge', () => new THREE.LineBasicMaterial({ color: '#c8d4e6', transparent: true, opacity: .28, depthWrite: false }));
    const add = (o, lvl, gl) => {
      if (lvl === 'above' && mode !== 'haus') return;
      if (gl || (lvl === 'above' && half)) {   // darüber: gläserne Hülle – feine Kanten, kaum sichtbare Flächen
        const ms = []; o.traverse(q => { if (q.isMesh) ms.push(q); });
        ms.forEach(q => { q.material = Array.isArray(q.material) ? q.material.map(ghost) : ghost(q.material); q.castShadow = false; q.receiveShadow = false; q.renderOrder = 2;
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(q.geometry, 25), edgeM); e.renderOrder = 3; q.add(e); });
        B.add(o); return;
      }
      if (lvl === 'own') { o.userData.cut = 'wall'; o.userData.bldCut = true; }   // Nachbarteile der eigenen Etage: nur waagerecht halb
      B.add(o); if (lvl !== 'below') this.occ.push(o);
    };
    b.parts.forEach(p => {
      const P = p.points; if (!Array.isArray(P) || P.length < 3) return;
      const r = p.storeys || [0, n - 1], f0 = clamp(Math.round(num(r[0])), 0, n - 1), f1 = clamp(Math.round(num(r[1] ?? r[0])), 0, n - 1);
      const sel = p.kind === 'neighbor' ? this.nb : this.un; if (sel === 'aus') return; const gl = sel === 'glas';
      const col = p.color || BLD_C[p.kind] || BLD_C.unit, win = p.kind !== 'stair' && p.kind !== 'hall' && p.windows !== false;
      for (let s = f0; s <= f1; s++) {
        if (p.kind === 'own' && s === own) continue;
        const lvl = s < own ? 'below' : s === own ? 'own' : 'above';
        let z0 = base[s], z1 = S[s].roof ? base[s] + knee : base[s] + hs[s];
        if (s === own) z1 = base[s] + H;                 // eigene Etage: so hoch wie die eigenen Wände (gleicher Schnitt)
        if (s === own + 1) z0 = base[own] + H;
        if (s === own - 1) z1 = base[own] - .02;
        if (z1 - z0 < .05) continue;
        add(prism(P, z0, z1, [capM, facadeMat(col, hs[s], win && !S[s].roof)]), lvl, gl);
      }
      // Kniestock bis zur Traufe, wenn das Teil nicht bis ins Dachgeschoss reicht
      if (dg > -1 && f1 < dg && p.kind !== 'hall' && p.roof !== false) { const z0 = base[f1] + hs[f1]; if (eaveL - z0 > .05) add(prism(P, z0, eaveL, [capM, facadeMat(col, 9, false)]), f1 >= own ? 'above' : 'below', gl); }
    });
    // Dach gehört zum Nachbarhaus, wenn es überwiegend über einem Nachbarhaus liegt (oder kind: neighbor)
    const nbB = b.parts.filter(p => p.kind === 'neighbor' && Array.isArray(p.points) && p.points.length > 2).map(p => { const xs = p.points.map(q => q[0]), ys = p.points.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
    const roofSel = r => { if (r.kind) return r.kind === 'neighbor' ? this.nb : this.un; const [x0, y0, x1, y1] = r.rect.map(Number), A = Math.abs((x1 - x0) * (y1 - y0)) || 1, ov = nbB.reduce((m, q) => Math.max(m, Math.max(0, Math.min(Math.max(x0, x1), q[2]) - Math.max(Math.min(x0, x1), q[0])) * Math.max(0, Math.min(Math.max(y0, y1), q[3]) - Math.max(Math.min(y0, y1), q[1]))), 0); return ov > A * .5 ? this.nb : this.un; };
    (b.roofs || []).forEach(r => {
      if (!Array.isArray(r.rect) || r.rect.length < 4) return;
      const rs = roofSel(r); if (rs === 'aus') return;
      const rc = r.color || b.roof_color || '#56585d', mR = mat('roof:' + rc, () => std(rc, { roughness: .82, side: THREE.DoubleSide })), gc = r.gable_color || BLD_C.unit, mG = mat('gable:' + gc, () => std(gc, { roughness: .95, side: THREE.DoubleSide }));
      const e = r.eave != null ? num(r.eave) : eaveL, [x0, y0, x1, y1] = r.rect.map(Number);
      const o = /^fl|^flat/.test(String(r.type || '')) ? prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], e, e + .3, [mR, mG]) : roofMesh(r, e, mR, mG);
      add(o, 'above', rs === 'glas');
    });
  }
  _rail(w, sty, room) {
    const c = w.col || sty.rail || '#8a9099', m = mat('rail:' + c, () => std(c, { roughness: .4, metalness: .6 })), L = dist(w.a, w.b), n = Math.max(1, Math.round(L / .6));
    const RH = clamp(num(room.rail_height, 1), .3, 3), a = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    const g = new THREE.Group(); g.position.set((w.a[0] + w.b[0]) / 2, 0, (w.a[1] + w.b[1]) / 2); g.rotation.y = -a; this.root.add(g);
    const add = (geo, mm, x, y, z) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(L, .05, .05), m, 0, RH, 0);
    for (let k = 0; k <= n; k++) add(new THREE.BoxGeometry(.04, RH, .04), m, -L / 2 + L * k / n, RH / 2, 0);
    const f = room.rail_fill || 'none', bh = clamp(num(room.rail_board_h, .12), .01, 1), bt = clamp(num(room.rail_board_t, .02), .005, .2), gap = clamp(num(room.rail_gap, .03), 0, 1), bot = clamp(num(room.rail_board_bottom, .08), 0, RH);
    const bm = mat('board:' + (room.rail_board_color || '#8a6a4a'), () => std(room.rail_board_color || '#8a6a4a', { roughness: .8 }));
    // Beplankung außen (Standard) oder innen am Geländer; schließt oben bündig mit dem Handlauf ab – der Rahmen bleibt so hoch wie eingestellt
    const nx = -Math.sin(a), ny = Math.cos(a), mx = (w.a[0] + w.b[0]) / 2, my = (w.a[1] + w.b[1]) / 2;
    const inPlus = Array.isArray(room.points) && room.points.length >= 3 && HG().pip([mx + nx * .15, my + ny * .15], room.points);
    const bs = (room.rail_board_side === 'innen' ? 1 : -1) * (inPlus ? 1 : -1), bz = bs * (.025 + bt / 2), top = RH + .025;
    if (f === 'boards') { const cnt = clamp(Math.round(num(room.rail_boards, 4)), 1, 40); for (let i = 0; i < cnt; i++) { const yT = top - i * (bh + gap); if (yT - bh < -.001) break; add(new THREE.BoxGeometry(L, bh, bt), bm, 0, yT - bh / 2, bz); } }
    else if (f === 'boards_v') { const hgt = Math.max(.05, top - bot), cnt = Math.max(1, Math.floor((L + gap) / (bh + gap))), used = cnt * bh + (cnt - 1) * gap; for (let i = 0; i < cnt; i++) add(new THREE.BoxGeometry(bh, hgt, bt), bm, -used / 2 + bh / 2 + i * (bh + gap), bot + hgt / 2, bz); }
    else if (f === 'glass') { const gm = mat('railglass', () => new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: .25, roughness: .05, depthWrite: false })); add(new THREE.BoxGeometry(L - .04, Math.max(.05, RH - bot - .06), .012), gm, 0, bot + (RH - bot - .06) / 2, 0).castShadow = false; }
    else { const nb = Math.max(2, Math.round(L / .12)); for (let i = 1; i < nb; i++) add(new THREE.BoxGeometry(.015, RH - .1, .015), m, -L / 2 + L * i / nb, .05 + (RH - .1) / 2, 0); }
  }
  _opening(op, k, walls, H) {
    if (op.type === 'passage') return this._passage(op, walls);
    const G = HG(), [y0, y1] = G.openingBand(op, walls), yc = (y0 + y1) / 2, Ln = op.length, hl = Ln / 2, [z0, z1] = opRange(op, H), th = Math.max(.04, y1 - y0);
    const g = new THREE.Group(); g.position.set(op.x, 0, op.y); g.rotation.y = -num(op.rotate) * RAD; g.scale.x = op.hinge === 'right' ? -1 : 1; g.userData.cutAll = true; this.root.add(g);
    const frameM = mat('frame', () => std(FRAME, { roughness: .5 }));
    if (op.type === 'window') {
      const os = y0 + y1 > .001 ? 1 : y0 + y1 < -.001 ? -1 : 1, fd = Math.min(th, .08), wz = op.win_pos === 'out' ? yc + os * (th / 2 - fd / 2) : op.win_pos === 'in' ? yc - os * (th / 2 - fd / 2) : yc, inner = yc - os * th / 2;
      const fw = .05, box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
      box(Ln, fw, fd, 0, z0 + fw / 2, wz, frameM); box(Ln, fw, fd, 0, z1 - fw / 2, wz, frameM);
      box(fw, z1 - z0, fd, -hl + fw / 2, (z0 + z1) / 2, wz, frameM); box(fw, z1 - z0, fd, hl - fw / 2, (z0 + z1) / 2, wz, frameM);
      // Fensterbank innen (von der Rahmenkante bis 3 cm vor die Wand)
      const fbz0 = wz - os * fd / 2, fbz1 = inner - os * .03, fbd = Math.abs(fbz1 - fbz0);
      if (!op.no_sill_board && fbd > .02 && z0 > .05) box(Ln + .06, .025, fbd, 0, z0 - .0125, (fbz0 + fbz1) / 2, mat('sillb', () => std('#e9e7e2', { roughness: .45 })));
      const ledM = std('#3ddc84', { emissive: '#3ddc84', emissiveIntensity: .9 }), led = box(Ln - .1, .012, .03, 0, z0 + .006, inner - os * .02, ledM); led.castShadow = false;
      const pivot = new THREE.Group(); pivot.position.set(-hl + fw, z0 + fw, wz); g.add(pivot);
      if (Math.abs(y0 + y1) > .001) {
        const wl = new THREE.SpotLight('#e4ecff', 0, 7.5, 64 * RAD, 1, 2); wl.position.set(0, (z0 + z1) / 2 + .25, wz + os * .8); wl.target.position.set(0, Math.max(0, z0 - .8), wz - os * 3.2);
        wl.shadow.mapSize.set(512, 512); wl.shadow.bias = -.001; wl.shadow.normalBias = .02; wl.shadow.camera.near = .2; g.add(wl, wl.target);
        this.winLights.push({ L: wl, a: clamp(Ln * (z1 - z0) / 1.6, .25, 2.2) });
      }
      const pane = new THREE.Group(), pw = Ln - 2 * fw, ph = z1 - z0 - 2 * fw; pivot.add(pane);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, .012), mat('glass', () => new THREE.MeshPhysicalMaterial({ color: GLASS, transparent: true, opacity: .22, roughness: .05, metalness: 0, depthWrite: false })));
      glass.position.set(pw / 2, ph / 2, 0); pane.add(glass);
      const sash = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, .04), frameM); b.position.set(x, y, 0); b.castShadow = true; pane.add(b); };
      sash(pw, .035, pw / 2, .0175); sash(pw, .035, pw / 2, ph - .0175); sash(.035, ph, .0175, ph / 2); sash(.035, ph, pw - .0175, ph / 2);
      this.dyn.push(st => {
        const s = op.entity ? G.contactState(st, op) : 'na', c = CCOL[s] || CCOL.na;
        ledM.color.set(c); ledM.emissive.set(c); ledM.emissiveIntensity = s === 'na' ? .1 : .9;
        pane.rotation.set(0, 0, 0); pane.position.set(0, 0, 0);
        if (s === 'open') pane.rotation.y = -55 * RAD;
        else if (s === 'tilt') { pane.position.set(0, 0, 0); pane.rotation.x = 9 * RAD; }
      });
    } else {
      const dm = op.door_mat === 'plastic' || op.door_mat === 'glass' ? op.door_mat : 'wood', Lw = Ln - .04, dh = Math.max(.1, z1 - z0 - .02), dth = .04;
      const lc = op.leaf_color || (dm === 'plastic' ? '#f1f1ee' : dm === 'glass' ? '#d9dcdf' : DOOR);
      const leafM = mat(`door:${dm}:${lc}`, () => std(lc, { roughness: dm === 'plastic' ? .32 : dm === 'glass' ? .3 : .62, metalness: dm === 'glass' ? .55 : 0 }));
      const fM = op.frame_color ? mat('frame:' + op.frame_color, () => std(op.frame_color, { roughness: .5 })) : frameM;
      const gt = op.glass_type || 'clear', glassM = mat('dglass:' + gt, () => new THREE.MeshPhysicalMaterial(gt === 'frosted' ? { color: '#f3f6f8', transparent: true, opacity: .8, roughness: .9 } : gt === 'tinted' ? { color: '#5f707c', transparent: true, opacity: .55, roughness: .1 } : { color: GLASS, transparent: true, opacity: .22, roughness: .05, depthWrite: false }));
      const panes = dm === 'glass' ? [{ x: 0, y: dh / 2, w: Lw - .1, h: dh - .12 }] : (op.panes || []);
      const lz = y1 + .022 - dth / 2 + .002;   // Türblatt liegt auf der Zarge (Öffnungsseite) auf
      const pivot = new THREE.Group(); pivot.position.set(-hl + .02, z0, lz); g.add(pivot);
      const shp = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(Lw, 0), new THREE.Vector2(Lw, dh), new THREE.Vector2(0, dh)]);
      const pp = panes.map(q => paneOf(q, Lw, dh)).filter(Boolean);
      pp.forEach(q => shp.holes.push(paneShape(q, THREE.Path)));
      const lg = new THREE.ExtrudeGeometry(shp, { depth: dth, bevelEnabled: false, curveSegments: 24 }); lg.translate(0, 0, -dth / 2);
      const leaf = new THREE.Mesh(lg, leafM); leaf.castShadow = true; leaf.receiveShadow = true; pivot.add(leaf);
      pp.forEach(q => { const gl = new THREE.Mesh(new THREE.ShapeGeometry(paneShape(q, THREE.Shape), 24), glassM); gl.position.z = 0; pivot.add(gl); });
      const hc = op.handle_color || '#c9ccd1', hM = mat('knob:' + hc, () => std(hc, { metalness: .8, roughness: .3 }));
      const hy = z0 > .05 || dh < 1.6 ? dh / 2 : 1.05;
      [[1, op.handle_open || 'lever'], [-1, op.handle_other || 'lever']].forEach(([sd, ty]) => this._handle(pivot, ty, sd, Lw, dth, hM, hy));
      // Zarge (bei erhöhter Tür auch unten)
      [[-hl + .01], [hl - .01]].forEach(([x]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(.03, z1 - z0, th + .03), fM); b.position.set(x, (z0 + z1) / 2, yc); g.add(b); });
      if (z0 > .01) { const bt = new THREE.Mesh(new THREE.BoxGeometry(Ln + .02, .04, th + .03), fM); bt.position.set(0, z0 - .02, yc); g.add(bt); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(Ln + .02, .04, th + .03), fM); top.position.set(0, z1 + .02, yc); g.add(top);
      this.dyn.push(st => { const s = op.entity ? G.contactState(st, op) : 'na'; pivot.rotation.y = s === 'open' ? -72 * RAD : s === 'tilt' ? -20 * RAD : 0; });
    }
  }
  // Durchgang: Boden eines Raums läuft durch, Fußleiste in der Laibung oder Übergangsleiste
  _passage(op, walls) {
    const G = HG(), [y0, y1] = G.openingBand(op, walls), hl = op.length / 2, rot = num(op.rotate) * RAD, sty = (this.plan && this.plan.style) || {}, fy = this.fy || .01;
    const W = (lx, ly) => [op.x + lx * Math.cos(rot) - ly * Math.sin(rot), op.y + lx * Math.sin(rot) + ly * Math.cos(rot)];
    const pf = op.pass_floor || 'split', n = [-Math.sin(rot), Math.cos(rot)];
    if (pf !== 'split' && this.fl) {
      const sd = pf === 'a' ? 1 : -1, r = G.roomAt(this.fl, [op.x + n[0] * .35 * sd, op.y + n[1] * .35 * sd]);
      if (r) this.root.add(flat([W(-hl, y0 - .005), W(hl, y0 - .005), W(hl, y1 + .005), W(-hl, y1 + .005)], fy + .002, patMat(G.FLOORTYPES[r.floor] ? r.floor : 'wood')));
    }
    const sk = op.pass_skirt || 'weiter'; if (sk === 'keine' || sty.skirting_off) return;
    const col = op.pass_skirt_color || sty.skirting || '#efece6', m = mat('skirt:' + col, () => std(col, { roughness: .45 })), skH = clamp(num(sty.skirting_h, .06), .02, .2), skT = .014;
    const g = new THREE.Group(); g.position.set(op.x, 0, op.y); g.rotation.y = -rot; g.userData.cutAll = true; this.root.add(g);
    if (sk === 'eine') { const yy = pf === 'a' ? y0 : pf === 'b' ? y1 : (y0 + y1) / 2, o = new THREE.Mesh(new THREE.BoxGeometry(op.length, .01, .045), m); o.position.set(0, fy + .005, yy); g.add(o); return; }
    [-1, 1].forEach(sd => { const o = new THREE.Mesh(new THREE.BoxGeometry(skT, skH, Math.max(.01, y1 - y0)), m); o.position.set(sd * (hl - skT / 2), fy + skH / 2, (y0 + y1) / 2); g.add(o); });
  }
  // Türgriff einer Seite (sd = +1 Öffnungsseite, -1 andere Seite)
  _handle(p, ty, sd, Lw, dth, hM, hy = 1.05) {
    if (ty === 'none') return;
    const z = sd * dth / 2, x = Lw - .07, y = hy, add = (geo, px, py, pz, rx, rz) => { const o = new THREE.Mesh(geo, hM); o.position.set(px, py, pz); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; o.castShadow = true; p.add(o); return o; };
    if (ty === 'shell') { const s = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .006, 20), mat('shell', () => std('#2a2c30', { roughness: .5, metalness: .4 }))); s.rotation.x = Math.PI / 2; s.scale.set(1, 1, 2.6); s.position.set(x, y, z + sd * .002); p.add(s); return; }
    add(new THREE.CylinderGeometry(.026, .026, .012, 20), x, y, z + sd * .006, Math.PI / 2);   // Rosette
    if (ty === 'lever') { add(new THREE.CylinderGeometry(.009, .009, .055, 10), x, y, z + sd * .035, Math.PI / 2); add(new THREE.BoxGeometry(.13, .02, .022), x - .055, y, z + sd * .062); }
    else if (ty === 'knob') { add(new THREE.CylinderGeometry(.01, .01, .045, 10), x, y, z + sd * .03, Math.PI / 2); add(new THREE.SphereGeometry(.032, 16, 12), x, y, z + sd * .065); }
    else if (ty === 'knob_turn') add(new THREE.CylinderGeometry(.028, .024, .055, 20), x, y, z + sd * .04, Math.PI / 2);
    else if (ty === 'pull') { const L = .42; add(new THREE.CylinderGeometry(.013, .013, L, 12), x - .02, y, z + sd * .055); [-L / 2 + .04, L / 2 - .04].forEach(dy => add(new THREE.CylinderGeometry(.008, .008, .05, 8), x - .02, y + dy, z + sd * .03, Math.PI / 2)); }
  }
  _furn(m) {
    if (m.model !== undefined) {   // eigenes 3D-Modell (SketchUp .dae / glTF .glb)
      const g = new THREE.Group(); g.position.set(m.x, num(m.z3d, 0), m.y); g.rotation.y = -num(m.rotate) * RAD; this.root.add(g);
      if (m.model) loadModel(m.model).then(sc => { g.add(fitModel(sc, num(m.w, 0), num(m.h, 0), num(m.h3d, 0))); redrawAll(); }).catch(e => console.warn('haus-grundriss 3D-Modell', m.model, e));
      return;
    }
    const h = Math.max(.005, num(m.h3d, m.src ? .02 : FURN_H[m.symbol] ?? .5)), z0 = num(m.z3d, 0), op = m.opacity ?? 1;
    let tex;
    if (m.src) { tex = mat('img:' + m.src.length + ':' + m.src.slice(-40), () => { const t = new THREE.TextureLoader().load(m.src, () => redrawAll()); t.colorSpace = THREE.SRGBColorSpace; return t; }); }
    else tex = furnTex(m.symbol || 'tisch', m.w, m.h);
    const c = (FURN_C[m.symbol] || ['#8a8f98'])[0], tr = op < 1;
    const side = mat(`fs:${c}:${op}`, () => std(c, { roughness: .8, transparent: tr, opacity: op }));
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: .8, transparent: tr || !!m.src, opacity: op });
    let mesh;
    if ((m.symbol === 'baum' || m.symbol === 'busch') && !m.src) {
      const bush = m.symbol === 'busch', r = Math.max(.2, Math.min(m.w, m.h) / 2), Ht = Math.max(.3, num(m.h3d, bush ? 1.1 : 4.5)), leafM = areaMat('hedge');
      const trunkM = mat('trunk', () => std('#5a4330', { roughness: .95 }));
      mesh = new THREE.Group(); mesh.position.set(m.x, z0, m.y);
      let sd = Math.abs(Math.round(m.x * 37 + m.y * 91)) % 1000 + 1; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      if (!bush) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(r * .06, r * .1, Ht * .55, 10), trunkM); tr.position.y = Ht * .275; tr.castShadow = true; mesh.add(tr); }
      const n = bush ? 4 : 7, cy = bush ? Ht * .5 : Ht * .64, cr = bush ? r * .62 : r * .55;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + R(), d = k === 0 ? 0 : r * (.25 + R() * .35), rr = cr * (k === 0 ? 1.05 : .7 + R() * .35);
        const b = new THREE.Mesh(blob(rr, k * 3.7 + sd % 17), leafM); b.position.set(Math.cos(a) * d, cy + (R() - .4) * (bush ? Ht * .25 : Ht * .22), Math.sin(a) * d);
        b.scale.y = bush ? Ht / (2 * r) * .9 : 1; b.castShadow = true; b.receiveShadow = true; mesh.add(b);
      }
    } else if (m.symbol === 'pflanze' && !m.src) {
      mesh = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(m.w * .22, m.w * .17, .35, 16), mat('pot', () => std('#8a5a3c', { roughness: .9 }))); pot.position.y = .175; pot.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.min(m.w, m.h) * .48, 1), mat('leaf', () => std('#3f7334', { roughness: .9, flatShading: true }))); leaves.position.y = .35 + Math.min(m.w, m.h) * .42; leaves.castShadow = true;
      mesh.add(pot, leaves); mesh.position.set(m.x, z0, m.y);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(m.w, h, m.h), [side, side, top, side, side, side]);
      mesh.position.set(m.x, z0 + h / 2, m.y); mesh.castShadow = h > .03; mesh.receiveShadow = true;
    }
    mesh.rotation.y = -num(m.rotate) * RAD; this.root.add(mesh);
  }
  _device(d, H, plan) {
    const G = HG(), R = this.root, sty = plan.style || {};
    if (d.type === 'light') {
      G.emitters(d).forEach(em => {
        const lamp = d.lamp || 'ceiling', hgt = clamp(lamp === 'floor' ? 1.55 : num(d.mount_height, lamp === 'ceiling' ? H - .05 : 2.2), .2, H - .03);
        const bulbM = std('#f3efe6', { emissive: '#ffd9a0', emissiveIntensity: 0, roughness: .4 });
        const fx = new THREE.Group(); fx.position.set(em.x, 0, em.y); if (lamp !== 'floor') fx.userData.cutAll = true; R.add(fx);
        if (lamp === 'floor') {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, hgt, 8), mat('metal', () => std('#9aa0a8', { metalness: .7, roughness: .35 }))); pole.position.y = hgt / 2; pole.castShadow = true;
          const base = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .03, 20), mat('metal', () => std('#9aa0a8', { metalness: .7, roughness: .35 }))); base.position.y = .015;
          const shade = new THREE.Mesh(new THREE.CylinderGeometry(.14, .2, .24, 24, 1, true), bulbM); shade.position.y = hgt; fx.add(pole, base, shade);
        } else {
          const r0 = lamp === 'ceiling' ? .14 : .06, disc = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * .85, .05, 24), bulbM); disc.position.y = hgt; disc.visible = !(this.half && lamp === 'ceiling'); fx.add(disc);
        }
        const spot = em.spread < 300 && lamp !== 'ceiling' && lamp !== 'floor', half = clamp(em.spread / 2, 8, 80) * RAD;
        let L, cone = null;
        if (spot) {
          L = new THREE.SpotLight('#ffd9a0', 0, em.R * 3, half, .5, 2);
          const a = em.dir * RAD, t = clamp(em.tilt, 0, 90) * RAD, dir = new THREE.Vector3(Math.sin(a) * Math.sin(t), -Math.cos(t), -Math.cos(a) * Math.sin(t)).normalize();
          L.target.position.set(em.x + dir.x * 2, hgt + dir.y * 2, em.y + dir.z * 2); R.add(L.target);
          // Kegel bis zum Boden (bzw. Reichweite), ausblendend
          const len = clamp(dir.y < -.05 ? hgt / -dir.y : em.R * 1.2, .3, em.R * 1.6), cm = new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color('#ffd9a0') }, op: { value: 0 } }, vertexShader: CONE_VS, fragmentShader: CONE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
          cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(half) * len, len, 32, 1, true), cm);
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()); cone.position.set(em.x + dir.x * len / 2, hgt + dir.y * len / 2, em.y + dir.z * len / 2); cone.renderOrder = 5; cone.visible = false; R.add(cone);
        } else L = new THREE.PointLight('#ffd9a0', 0, em.R * 3.2, 2);
        L.position.set(em.x, hgt - (lamp === 'ceiling' ? .12 : 0), em.y); L.castShadow = false;
        L.shadow.mapSize.set(768, 768); L.shadow.bias = -.0008; L.shadow.normalBias = .006; L.shadow.camera.near = .05; R.add(L);
        this.lights.push(L); this.lamps.push({ L, x: em.x, y: em.y });
        this.dyn.push(st => {
          const s = st[em.ent], on = G.isOn(s), col = d.glow_color || (on ? G.lightCol(s) : '#ffd9a0'), bri = s && s.attributes ? s.attributes.brightness : null, k = bri == null ? .85 : clamp(bri / 255, .1, 1);
          L.color.set(col); L.intensity = on ? (spot ? 26 : 16) * k : 0; L.visible = on; L._k = on ? k * (spot ? 1.3 : 1) : 0;
          bulbM.emissive.set(col); bulbM.emissiveIntensity = on ? 1.8 * k : 0;
          if (cone) { cone.visible = on; cone.material.uniforms.col.value.set(col); cone.material.uniforms.op.value = (this.night ? .26 : .1) * k; }
        });
      });
    } else if (d.type === 'climate' && (d.heater || 'radiator') === 'radiator') {
      const D = G.heaterDim(d), hc = d.heater_color || sty.heater || '#e6e8ea', hh = d.heater_heat_color || sty.heater_heat || '#ff8a3d';
      const m = std(hc, { roughness: .45, metalness: .15 });
      const g = new THREE.Group(); g.position.set(num(d.x), 0, num(d.y)); g.rotation.y = -num(d.heater_rotate) * RAD; R.add(g);
      const add = (geo, x, y, z, rot) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rot) o.rotation.z = rot; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
      const { k, L, H: Hh, T, E } = D, yc = E + Hh / 2;
      if (k === 'column') { const n = Math.max(3, Math.round(L / .06)); for (let i = 0; i < n; i++) { const x = -L / 2 + (i + .5) * L / n; [-T / 4, T / 4].forEach(z => add(new THREE.CylinderGeometry(.018, .018, Hh, 10), x, yc, z)); } [E + .03, E + Hh - .03].forEach(y => add(new THREE.BoxGeometry(L, .05, T * .7), 0, y, 0)); }
      else if (k === 'towel') { [-L / 2 + .02, L / 2 - .02].forEach(x => add(new THREE.CylinderGeometry(.018, .018, Hh, 12), x, yc, 0)); for (let y = E + .05; y < E + Hh - .02; y += (y - E) % .45 > .38 ? .12 : .065) add(new THREE.CylinderGeometry(.011, .011, L - .04, 8), 0, y, 0, Math.PI / 2); }
      else if (k === 'design') { const n = Math.max(2, Math.round(L / .075)); for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(L / n - .015, Hh, T), -L / 2 + (i + .5) * L / n, yc, 0); add(new THREE.BoxGeometry(L, .03, T * .6), 0, E + .03, 0); add(new THREE.BoxGeometry(L, .03, T * .6), 0, E + Hh - .03, 0); }
      else if (k === 'convector') { const fr = new THREE.Mesh(new THREE.BoxGeometry(L, .022, T), mat('conv', () => std('#2a2c30', { roughness: .7 }))); fr.position.set(0, .011, 0); g.add(fr); const n = Math.max(4, Math.round(L / .035)); for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(.012, .024, T * .86), -L / 2 + (i + .5) * L / n, .013, 0); }
      else if (k === 'storage') { add(new THREE.BoxGeometry(L, Hh, T), 0, yc, 0); const gr = new THREE.Mesh(new THREE.BoxGeometry(L * .9, .012, T * .5), mat('conv', () => std('#2a2c30', { roughness: .7 }))); gr.position.set(0, E + Hh + .006, 0); g.add(gr); }
      else { add(new THREE.BoxGeometry(L, Hh, T * .6), 0, yc, 0); const n = Math.max(3, Math.round(L / .05)); for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(.02, Hh * .92, .012), -L / 2 + (i + .5) * L / n, yc, T * .3 + .006); }
      // beim Heizen: Farbe bleibt, darüber ein Flammen-Symbol (verdeckt von Wänden wie alles in der Szene)
      const fw = clamp(L * .42, .14, .38), fh = clamp(Hh * .85, .16, .42), fz = { column: T / 4 + .024, towel: .024, panel: T * .3 + .018 }[k] ?? T / 2 + .006, decals = [];
      if (k === 'convector') { const p = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), FLAME_M); p.position.set(0, .02 + fh / 2, 0); g.add(p); decals.push(p); }
      else [1, -1].forEach(sd => { const p = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), FLAME_M); p.position.set(0, E + Hh * .08 + fh / 2, sd * fz); if (sd < 0) p.rotation.y = Math.PI; g.add(p); decals.push(p); });
      const gl = new THREE.PointLight('#ff8a3d', 0, 1.8, 2); gl.position.set(0, k === 'convector' ? .25 : yc, k === 'convector' ? 0 : fz + .18); gl.visible = false; g.add(gl);
      decals.forEach(p => { p.visible = false; p.renderOrder = 3; });
      const fo = { on: false, L: gl, base: .45, ph: Math.random() * 6 }; this.flames.push(fo);
      this.dyn.push(st => { const on = G.heatingOn(st[d.entity]) && (this.cfg && (this.cfg.flammen3d ?? this.cfg.flames_3d)) !== false; fo.on = on; gl.visible = on; gl.intensity = on ? fo.base : 0; decals.forEach(p => { p.visible = on; }); });
    } else if (d.type === 'tablet') {
      const g = new THREE.Group(); g.position.set(num(d.x), 1.45, num(d.y)); g.rotation.y = -num(d.rotate) * RAD; g.userData.cutAll = true; R.add(g);
      const body = new THREE.Mesh(new THREE.BoxGeometry(.28, .19, .02), mat('tab', () => std('#1b1d20', { roughness: .4 }))); body.position.z = .01;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(.25, .16), mat('tabscr', () => std('#0d2a3a', { emissive: '#4dc3ff', emissiveIntensity: .55 }))); scr.position.z = .021;
      g.add(body, scr);
    }
  }

  states(hass) {
    const st = (hass && hass.states) || {}, dl = HG().dayLight ? HG().dayLight(st, this.cfg || {}) : { up: true, el: 45, az: 160, df: 1, cf: 1 };
    const up = dl.up, df = dl.df;
    this.night = df < .3;
    const el = clamp(dl.el, 4, 85), az = dl.az;
    const [cx, cz] = this.center || [0, 0], D = (this.span || 10) + 20;
    this.sun.position.set(cx + Math.sin(az * RAD) * Math.cos(el * RAD) * D, Math.sin(el * RAD) * D, cz - Math.cos(az * RAD) * Math.cos(el * RAD) * D);
    this.sun.target.position.set(cx, 0, cz);
    // Sonne: direkt (Schatten, Sonnenflecken durch die Fenster), bei Wolken schwächer; Himmel: Grundhelligkeit
    this.sun.intensity = up ? (.5 + 2.6 * df) * Math.pow(dl.cf, 1.3) : .1; this.sun.color.set(up ? (dl.el < 12 ? '#ffd7a8' : '#fff4e0') : '#9db4e0');
    this.hemi.intensity = .14 + .62 * df; this.hemi.color.set(df > .3 ? '#e8eeff' : '#8fa3c8');
    this.renderer.toneMappingExposure = 1.05 + (1 - df) * .15;
    (this.winLights || []).forEach(w => { w.L.intensity = 16 * df * w.a; w.L.visible = df > .04; w.L._k = df * w.a * .8; w.L.color.set(dl.cf < .6 ? '#e8ecf2' : '#e4ecff'); });
    this.dyn.forEach(f => f(st));
    // Schatten für die hellsten eingeschalteten Leuchten (Licht fällt nicht durch Wände)
    // beleuchtete Räume → Lichtschein durch offene Türen
    const lit = new Map(), G = HG();
    (this.lamps || []).forEach(q => { if (!q.L.visible || !this.fl) return; const r = G.roomAt(this.fl, [q.x, q.y]); if (!r) return; const k = G.roomGrp(r), o = lit.get(k), kk = q.L._k || .5; if (!o) lit.set(k, { k: kk, col: q.L.color, sum: kk }); else { o.sum += kk; if (o.k < kk) { o.k = kk; o.col = q.L.color; } } });
    (this.fills || []).forEach(f => { const o = lit.get(f.grp); f.L.visible = !!o; if (!o) { f.L._k = 0; return; } f.L.color.copy(o.col); f.L.intensity = 5.5 * Math.min(1.8, o.sum) * Math.max(.6, Math.sqrt(f.area) / 3.5) * (1 - df * .75); f.L._k = 3 + o.sum; });
    (this.spills || []).forEach(sp => {
      const o = lit.get(sp.from), stt = sp.op.type === 'passage' ? 'open' : sp.op.entity ? G.contactState(st, sp.op) : 'na', open = stt === 'open' || stt === 'tilt';
      const on = !!o && open && df < .6; sp.L.visible = on;
      if (on) { sp.L.color.copy(o.col); sp.L.intensity = (stt === 'tilt' ? 3 : 7) * Math.min(1, o.k) * (1 - df); sp.L._k = o.k * .7; } else sp.L._k = 0;
    });
    const ls = this.cfg ? (this.cfg.lichtschatten ?? this.cfg.light_shadows) : null, MAXS = ls === false || !this.shadows ? 0 : clamp(Math.round(num(ls, 14)), 0, 24);
    const all = [...(this.lights || []), ...(this.winLights || []).map(w => w.L), ...(this.spills || []).map(x => x.L), ...(this.fills || []).map(x => x.L)], on = all.filter(l => l.visible).sort((a, b) => (b._k || 0) - (a._k || 0));
    all.forEach(l => { const c = on.indexOf(l) > -1 && on.indexOf(l) < MAXS; if (l.castShadow !== c) l.castShadow = c; });
    (this.lamps || []).forEach(q => { if (q.dFull) q.L.distance = q.L.castShadow ? q.dFull : q.dSmall; });
    this.renderer.shadowMap.needsUpdate = true;
    this.render();
    this._animate();
  }
  _animate() {
    if (this._an || this._dead || !(this.flames || []).some(f => f.on)) return;
    const step = ts => {
      if (this._dead || !(this.flames || []).some(f => f.on) || !this.host || !this.host.isConnected) { this._an = 0; return; }
      if (ts - (this._lt || 0) > 45 && this.size[0]) {
        this._lt = ts; const t = ts / 1000; FLAME_U.t.value = t;
        this.flames.forEach(f => { if (f.on) f.L.intensity = f.base * (.72 + .2 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3 + f.ph * 2) + .1 * Math.random()); });
        this.renderer.render(this.scene, this.camera);
      }
      this._an = requestAnimationFrame(step);
    };
    this._an = requestAnimationFrame(step);
  }
  _clipUpd() {
    if (!this.half || !this.clip) return;
    // Innenwände immer halb. Außenwände: der Schnitt wandert mit der Blickrichtung und läuft auf JEDER Außenwand
    // genau unter 45° (Steigung entlang der Wand = 1), ansteigend nach hinten; Beginn dort, wo die Wand die
    // Bildmitte (quer zur Blickrichtung) kreuzt. Hinter der Mitte quer liegende Wände sind damit ganz zu sehen.
    const WC = this.wallCuts || [], flatAll = () => { this.clip.normal.set(0, -1, 0); this.clip.constant = this.cutH; WC.forEach(w => { w.pl.normal.set(0, -1, 0); w.pl.constant = this.cutH; }); this._lidUpd(); };
    if (this.cutMode === 'halb' || this.cutMode === 'half' || this.cutMode === 'flach') return flatAll();
    const t = this.controls.target, c = this.camera.position, dx = t.x - c.x, dz = t.z - c.z, L = Math.hypot(dx, dz);
    if (L < .05) return flatAll();
    const fx = dx / L, fz = dz / L, k = Math.SQRT1_2, ch = this.cutH;
    this.clip.normal.set(fx * k, -k, fz * k); this.clip.constant = (ch - (t.x * fx + t.z * fz)) * k;   // Öffnungen/Möbel
    WC.forEach(w => {
      const uf = w.u[0] * fx + w.u[1] * fz, behind = (w.a[0] - t.x) * fx + (w.a[1] - t.z) * fz;
      if (Math.abs(uf) < 1e-4) {   // quer zur Blickrichtung: hinter der Mitte ganz, davor halb
        w.pl.normal.set(0, -1, 0); w.pl.constant = behind > 0 ? 1e4 : ch; return;
      }
      const sg = uf > 0 ? 1 : -1, gx = sg * w.u[0], gz = sg * w.u[1];
      const s0 = -behind / uf;                                   // Stelle auf der Wand (ab a) in Höhe der Bildmitte
      const gp0 = sg * (w.u[0] * w.a[0] + w.u[1] * w.a[1] + s0);  // g · p0
      w.pl.normal.set(gx * k, -k, gz * k); w.pl.constant = (ch - gp0) * k;   // y ≤ halbe Höhe + g·(p − p0)
    });
    this._lidUpd();
  }
  // Deckel auf die aktuelle Schnitthöhe legen: max(halbe Höhe, 45°-Schnitt der Wand), knapp unter der Wandoberkante
  _lidUpd() {
    const ch = this.cutH, k = Math.SQRT1_2;
    (this.lids || []).forEach(l => {
      const pos = l.g.attributes.position, pl = l.wc && l.wc.pl;
      l.P.forEach((p, i) => {
        let y = ch;
        if (pl) { const n = pl.normal; if (n.y > -.999) y = Math.max(ch, (n.x * p[0] + n.z * p[1] + pl.constant) / -n.y); }   // Ebene: n·x + c = 0
        pos.setXYZ(i, p[0], Math.min(y, l.z1 - .003), p[1]);
      });
      pos.needsUpdate = true; l.g.computeVertexNormals(); l.g.computeBoundingSphere();
    });
  }
  render() {
    if (!this.size[0]) return;
    if (this._rq) return;
    this._rq = requestAnimationFrame(() => { this._rq = 0; this._clipUpd(); this.renderer.render(this.scene, this.camera); this.place(); });
  }
  // Liegt zwischen Kamera und Punkt eine Wand? (Symbole anderer Räume nicht durch Wände zeigen)
  _hidden(x, y, z) {
    if (!this.occ || !this.occ.length) return false;
    const cam = this.camera.position, wp = this._wp || (this._wp = new THREE.Vector3()), d = this._dir || (this._dir = new THREE.Vector3());
    wp.set(x, y, z); const L = cam.distanceTo(wp); if (L < .4) return false;
    d.subVectors(wp, cam).divideScalar(L);
    const ray = this.ray || (this.ray = new THREE.Raycaster()); ray.set(cam, d); ray.near = 0; ray.far = L - .32;
    this._hits = this._hits || []; this._hits.length = 0;
    ray.intersectObjects(this.occ, false, this._hits);
    if (!this.half || !this.clip) return this._hits.length > 0;
    return this._hits.some(h => h.point.y <= .35 || this.clip.distanceToPoint(h.point) >= 0 || (this.clipFlat ? this.clipFlat.distanceToPoint(h.point) >= 0 : false));
  }
  // HTML-Symbole (Räume, Geräte, Kürzel) an die projizierten 3D-Positionen setzen
  place() {
    const mk = this.mk; if (!mk) return;
    const [W, H] = this.size, v = new THREE.Vector3();
    const put = (el, x, y, z) => {
      v.set(x, z, y).project(this.camera);
      const vis = v.z < 1 && v.x > -1.02 && v.x < 1.02 && v.y > -1.02 && v.y < 1.02 && !(this.occlude !== false && this._hidden(x, z, y));
      el.style.left = ((v.x + 1) / 2 * W).toFixed(1) + 'px'; el.style.top = ((1 - v.y) / 2 * H).toFixed(1) + 'px';
      el.style.visibility = vis ? '' : 'hidden';
    };
    for (const el of mk.children) {
      if (el._w == null) {
        const x = parseFloat(el.style.getPropertyValue('--wx')), y = parseFloat(el.style.getPropertyValue('--wy'));
        el._w = Number.isFinite(x) ? [x, y, el.classList.contains('room') ? .05 : .9] : false;
      }
      if (el._w) put(el, el._w[0], el._w[1], el._w[2]);
    }
    if (this.dimsOn && this.dl) {
      if (!this._dimEls) { this.dl.innerHTML = (this.dimList || []).map(q => `<span>↕ ${q[2].toFixed(2).replace('.', ',')} m</span>`).join(''); this._dimEls = [...this.dl.children]; }
      this._dimEls.forEach((el, i) => { const q = this.dimList[i]; put(el, q[0], q[1], q[2] + .04); });
    }
  }
}
