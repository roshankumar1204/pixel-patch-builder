/*
 * Rizhu - core patch logic (no DOM).
 * Generates pixel positions for layout elements, assigns DMX universes/channels,
 * validates the patch and builds the CSV fixture list.
 * Works in the browser (window.PatchCore) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PatchCore = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  // Hershey single-stroke font (vendor/hershey-font.js), loaded lazily.
  let hersheyLib = null;
  function hershey() {
    if (hersheyLib) return hersheyLib;
    if (root && root.HersheyFont) hersheyLib = root.HersheyFont;
    else if (typeof require === 'function') hersheyLib = require('../vendor/hershey-font.js');
    return hersheyLib;
  }

  const DMX_UNIVERSE_SIZE = 512;
  const MAX_SACN_UNIVERSE = 63999;
  const MAX_TOTAL_PIXELS = 500000;
  const MADRIX_MAX_CHANNELS = 2048 * 512; // largest MADRIX 5 licence (Maximum)

  const PIXEL_TYPES = {
    W: { channels: 1, label: 'Single colour (1 ch)', fixture: 'Generic Single' },
    RGB: { channels: 3, label: 'RGB (3 ch)', fixture: 'Generic RGB' },
    RGBW: { channels: 4, label: 'RGBW (4 ch)', fixture: 'Generic RGBW' },
    RGBWW: { channels: 5, label: 'RGB + 2 whites (5 ch)', fixture: 'Generic RGBWW' },
  };

  const COMMON_DEFAULTS = {
    z: 0, rotation: 0, repeatX: 1, repeatY: 1, repeatStepX: 0, repeatStepY: 0, repeatNewUniverse: false,
    newUniverse: true, newPort: false,
  };

  const ELEMENT_DEFAULTS = {
    grid: {
      type: 'grid', name: 'Grid', x: 0, y: 0, cols: 16, rows: 8, spacing: 1,
      startCorner: 'TL', direction: 'rows', snake: true,
    },
    strip: { type: 'strip', name: 'Strip', x1: 0, y1: 0, x2: 29, y2: 0, count: 30 },
    circle: {
      type: 'circle', name: 'Ring', cx: 10, cy: 10, radius: 8, count: 24, startAngle: -90, sweep: 360,
      clockwise: true,
    },
    rect: {
      type: 'rect', name: 'Frame', x: 0, y: 0, width: 10, height: 6, spacing: 1, startCorner: 'TL',
      clockwise: true,
    },
    path: {
      type: 'path', name: 'Path', points: [[0, 0], [20, 0], [20, 10]], closed: false,
      mode: 'spacing', spacing: 1, count: 30,
    },
    text: {
      type: 'text', name: 'Text', text: 'RIZHU', font: 'dot', x: 0, y: 0, pitch: 1, letterGap: 1,
      order: 'letters', height: 14, spacing: 1,
    },
    points: { type: 'points', name: 'Points', points: [[0, 0], [1, 0]] },
    bitmap: {
      type: 'bitmap', name: 'Image', x: 0, y: 0, spacing: 1, mask: ['1'], invert: false, order: 'rows',
    },
  };
  Object.keys(ELEMENT_DEFAULTS).forEach((k) => {
    ELEMENT_DEFAULTS[k] = Object.assign({}, COMMON_DEFAULTS, ELEMENT_DEFAULTS[k]);
  });

  // 5x7 LED font. Each glyph = 7 rows, 5 bits per row (bit 4 = left column).
  const FONT = {
    A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11], B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    C: [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E], D: [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
    E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F], F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    G: [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F], H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
    O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D], R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    S: [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E], T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A], X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    Y: [0x11, 0x11, 0x11, 0x0A, 0x04, 0x04, 0x04], Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    0: [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E], 1: [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    2: [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F], 3: [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
    4: [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02], 5: [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    6: [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E], 7: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    8: [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], 9: [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04], '?': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C], ',': [0x00, 0x00, 0x00, 0x00, 0x0C, 0x04, 0x08],
    '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00], '+': [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
    ':': [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00], '/': [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x00],
    '&': [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D], "'": [0x0C, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
    '#': [0x0A, 0x0A, 0x1F, 0x0A, 0x1F, 0x0A, 0x0A], '*': [0x00, 0x0A, 0x1F, 0x1F, 0x0E, 0x04, 0x00],
  };
  const MAX_PATH_SAMPLES = 200000;
  const MAX_REPEAT = 1000;

  const int = (v, d = 0) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : d;
  };
  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  function createElement(type, overrides) {
    const base = ELEMENT_DEFAULTS[type];
    if (!base) throw new Error('Unknown element type: ' + type);
    const el = Object.assign({}, base, overrides || {});
    if (el.points) el.points = el.points.map((p) => p.slice(0, 3).map((v) => num(v)));
    if (el.mask) el.mask = el.mask.map(String);
    return el;
  }

  // ---- shape generators: return [{x,y}] (may be fractional) in wiring order ----
  function gridShape(el) {
    const out = [];
    const cols = Math.max(0, int(el.cols));
    const rows = Math.max(0, int(el.rows));
    const sp = Math.max(1, int(el.spacing, 1));
    const ox = int(el.x), oy = int(el.y);
    const corner = String(el.startCorner || 'TL');
    const fromBottom = corner[0] === 'B';
    const fromRight = corner[1] === 'R';
    const byRows = el.direction !== 'cols';
    const lines = byRows ? rows : cols;
    const len = byRows ? cols : rows;
    for (let a = 0; a < lines; a++) {
      for (let j = 0; j < len; j++) {
        const b = el.snake && a % 2 === 1 ? len - 1 - j : j;
        let row, col;
        if (byRows) {
          row = fromBottom ? rows - 1 - a : a;
          col = fromRight ? cols - 1 - b : b;
        } else {
          col = fromRight ? cols - 1 - a : a;
          row = fromBottom ? rows - 1 - b : b;
        }
        out.push({ x: ox + col * sp, y: oy + row * sp });
      }
    }
    return out;
  }

  function stripShape(el) {
    const out = [];
    const n = Math.max(0, int(el.count));
    const x1 = num(el.x1), y1 = num(el.y1), x2 = num(el.x2), y2 = num(el.y2);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    }
    return out;
  }

  function circleShape(el) {
    const out = [];
    const n = Math.max(0, int(el.count));
    const r = Math.max(0, num(el.radius));
    const cx = num(el.cx), cy = num(el.cy);
    const dir = el.clockwise === false ? -1 : 1; // screen y points down
    const start = (num(el.startAngle) * Math.PI) / 180;
    let sweep = Math.min(360, Math.max(0, num(el.sweep, 360)));
    const full = sweep >= 360;
    const step = full ? (2 * Math.PI) / Math.max(1, n) : n > 1 ? (sweep * Math.PI) / 180 / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const ang = start + dir * i * step;
      out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    }
    return out;
  }

  function rectShape(el) {
    const w = Math.max(0, int(el.width));
    const h = Math.max(0, int(el.height));
    const sp = Math.max(1, int(el.spacing, 1));
    const ox = int(el.x), oy = int(el.y);
    if (!w || !h) return [];
    const cells = [];
    if (w === 1 || h === 1) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.push([i, j]);
    } else {
      // clockwise from top-left
      for (let i = 0; i < w - 1; i++) cells.push([i, 0]);
      for (let j = 0; j < h - 1; j++) cells.push([w - 1, j]);
      for (let i = w - 1; i > 0; i--) cells.push([i, h - 1]);
      for (let j = h - 1; j > 0; j--) cells.push([0, j]);
      const startIdx = { TL: 0, TR: w - 1, BR: w - 1 + h - 1, BL: 2 * (w - 1) + h - 1 }[el.startCorner] || 0;
      let ordered = cells.slice(startIdx).concat(cells.slice(0, startIdx));
      if (el.clockwise === false) ordered = [ordered[0]].concat(ordered.slice(1).reverse());
      cells.length = 0;
      cells.push(...ordered);
    }
    return cells.map(([i, j]) => ({ x: ox + i * sp, y: oy + j * sp }));
  }

  function pathLength(points, closed) {
    let L = 0;
    const n = points.length;
    for (let i = 1; i < n + (closed ? 1 : 0); i++) {
      const a = points[i - 1], b = points[i % n];
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return L;
  }

  function pathSampleCount(el) {
    const pts = Array.isArray(el.points) ? el.points : [];
    if (pts.length < 2) return pts.length;
    const L = pathLength(pts, !!el.closed);
    let n;
    if (el.mode === 'count') n = Math.max(0, int(el.count));
    else {
      const sp = Math.max(0.1, num(el.spacing, 1));
      n = el.closed ? Math.round(L / sp) : Math.round(L / sp) + 1;
    }
    return Math.min(MAX_PATH_SAMPLES, Math.max(0, n));
  }

  function pathShape(el) {
    const pts = (Array.isArray(el.points) ? el.points : []).map((p) => [num(p[0]), num(p[1])]);
    if (pts.length === 0) return [];
    if (pts.length === 1) return [{ x: pts[0][0], y: pts[0][1] }];
    const closed = !!el.closed;
    const segs = [];
    for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
    const L = segs.reduce((s, g) => s + g.len, 0);
    const n = pathSampleCount(el);
    const out = [];
    if (L === 0) {
      for (let i = 0; i < n; i++) out.push({ x: pts[0][0], y: pts[0][1] });
      return out;
    }
    let si = 0, acc = 0;
    for (let i = 0; i < n; i++) {
      const d = closed ? (i * L) / n : n === 1 ? 0 : (i * L) / (n - 1);
      while (si < segs.length - 1 && acc + segs[si].len < d) { acc += segs[si].len; si++; }
      const g = segs[si];
      const t = g.len ? Math.min(1, Math.max(0, (d - acc) / g.len)) : 0;
      out.push({ x: g.a[0] + (g.b[0] - g.a[0]) * t, y: g.a[1] + (g.b[1] - g.a[1]) * t });
    }
    return out;
  }

  /** Lit dots of a text string in the 5x7 font, as a mask (array of row strings). */
  function textMask(text, letterGap) {
    const gap = Math.max(0, int(letterGap, 1));
    const chars = String(text || '').toUpperCase().slice(0, 200).split('');
    const cols = []; // array of column arrays (7 bools)
    const letterSpans = [];
    chars.forEach((c, ci) => {
      if (ci > 0) for (let g = 0; g < gap; g++) cols.push(null);
      if (c === ' ') { for (let s = 0; s < 3; s++) cols.push(null); return; }
      const glyph = FONT[c] || FONT['?'];
      const start = cols.length;
      for (let bx = 4; bx >= 0; bx--) cols.push(glyph.map((row) => ((row >> bx) & 1) === 1));
      letterSpans.push([start, cols.length]);
    });
    return { cols, letterSpans };
  }

  function lineTextShape(el) {
    const lib = hershey();
    if (!lib) return [];
    const { strokes } = lib.textStrokes(String(el.text || '').slice(0, 200));
    const k = Math.max(1, num(el.height, 14)) / 21; // Hershey cap height = 21 units
    const ox = num(el.x), oy = num(el.y);
    const sp = Math.max(0.5, num(el.spacing, 1));
    const out = [];
    const used = new Set(); // strokes meet at corners: keep one pixel per spot
    strokes.forEach((s) => {
      const pts = s.map(([x, y]) => [ox + x * k, oy + (y + 12) * k]);
      pathShape({ points: pts, closed: false, mode: 'spacing', spacing: sp }).forEach((p) => {
        const q = { x: Math.round(p.x), y: Math.round(p.y) };
        const key = q.x + ',' + q.y;
        if (!used.has(key)) { used.add(key); out.push(q); }
      });
    });
    return out;
  }

  function textShape(el) {
    if (el.font === 'line') return lineTextShape(el);
    const pitch = Math.max(1, int(el.pitch, 1));
    const ox = int(el.x), oy = int(el.y);
    const { cols, letterSpans } = textMask(el.text, el.letterGap);
    const out = [];
    const at = (c, r) => ({ x: ox + c * pitch, y: oy + r * pitch });
    if (el.order === 'rows') {
      for (let r = 0; r < 7; r++) {
        const idx = [];
        for (let c = 0; c < cols.length; c++) if (cols[c] && cols[c][r]) idx.push(c);
        if (r % 2 === 1) idx.reverse();
        idx.forEach((c) => out.push(at(c, r)));
      }
    } else {
      // letter by letter, columns top->bottom then bottom->top (snake)
      letterSpans.forEach(([s, e]) => {
        let flip = false;
        for (let c = s; c < e; c++) {
          const rows = [];
          for (let r = 0; r < 7; r++) if (cols[c][r]) rows.push(r);
          if (!rows.length) continue;
          if (flip) rows.reverse();
          rows.forEach((r) => out.push(at(c, r)));
          flip = !flip;
        }
      });
    }
    return out;
  }

  function bitmapShape(el) {
    const mask = Array.isArray(el.mask) ? el.mask : [];
    const sp = Math.max(1, int(el.spacing, 1));
    const ox = int(el.x), oy = int(el.y);
    const on = (r, c) => (mask[r][c] === '1') !== !!el.invert;
    const out = [];
    const h = mask.length;
    const w = mask.reduce((m, row) => Math.max(m, row.length), 0);
    if (el.order === 'cols') {
      for (let c = 0; c < w; c++) {
        const rows = [];
        for (let r = 0; r < h; r++) if (c < mask[r].length && on(r, c)) rows.push(r);
        if (c % 2 === 1) rows.reverse();
        rows.forEach((r) => out.push({ x: ox + c * sp, y: oy + r * sp }));
      }
    } else {
      for (let r = 0; r < h; r++) {
        const cs = [];
        for (let c = 0; c < mask[r].length; c++) if (on(r, c)) cs.push(c);
        if (r % 2 === 1) cs.reverse();
        cs.forEach((c) => out.push({ x: ox + c * sp, y: oy + r * sp }));
      }
    }
    return out;
  }

  function pointsShape(el) {
    return (Array.isArray(el.points) ? el.points : []).map((p) => ({ x: num(p[0]), y: num(p[1]), z: p.length > 2 ? num(p[2]) : null }));
  }

  const SHAPES = {
    grid: gridShape, strip: stripShape, circle: circleShape, rect: rectShape,
    path: pathShape, text: textShape, bitmap: bitmapShape, points: pointsShape,
  };

  function shapeCount(el) {
    switch (el.type) {
      case 'grid': return Math.max(0, int(el.cols)) * Math.max(0, int(el.rows));
      case 'strip': case 'circle': return Math.max(0, int(el.count));
      case 'path': return pathSampleCount(el);
      case 'rect': {
        const w = Math.max(0, int(el.width)), h = Math.max(0, int(el.height));
        return !w || !h ? 0 : w === 1 || h === 1 ? w * h : 2 * (w + h) - 4;
      }
      case 'points': return Array.isArray(el.points) ? el.points.length : 0;
      default: return (SHAPES[el.type] ? SHAPES[el.type](el) : []).length;
    }
  }
  const repeats = (el) => [
    Math.min(MAX_REPEAT, Math.max(1, int(el.repeatX, 1))),
    Math.min(MAX_REPEAT, Math.max(1, int(el.repeatY, 1))),
  ];

  /** Number of pixels an element will produce, without generating them. */
  function pixelCount(el) {
    const [nx, ny] = repeats(el);
    return shapeCount(el) * nx * ny;
  }

  function boundsOf(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  /** Returns pixel positions [{x,y,z,copy}] in wiring order for one element (integer coords). */
  function generatePixels(el) {
    const shape = SHAPES[el.type];
    if (!shape) return [];
    let pts = shape(el);
    const z = int(el.z);
    if (!pts.length) return [];

    const rot = num(el.rotation);
    if (rot % 360 !== 0) {
      const b = boundsOf(pts);
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      const a = (rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      pts = pts.map((p) => ({
        x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
        y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
        z: p.z,
      }));
    }

    const [nx, ny] = repeats(el);
    let stepX = num(el.repeatStepX), stepY = num(el.repeatStepY);
    if ((nx > 1 && !stepX) || (ny > 1 && !stepY)) {
      const b = boundsOf(pts);
      if (!stepX) stepX = Math.round(b.maxX - b.minX) + 2;
      if (!stepY) stepY = Math.round(b.maxY - b.minY) + 2;
    }
    // Paths bend at corners: two samples can round onto one spot - keep one (it is one LED on the strip).
    const dedupe = el.type === 'path';
    const out = [];
    for (let ry = 0; ry < ny; ry++) {
      for (let rx = 0; rx < nx; rx++) {
        const copy = ry * nx + rx;
        const used = dedupe ? new Set() : null;
        for (const p of pts) {
          const q = {
            x: Math.round(p.x + rx * stepX), y: Math.round(p.y + ry * stepY),
            z: p.z != null ? Math.round(p.z) : z, copy,
          };
          if (used) {
            const key = q.x + ',' + q.y;
            if (used.has(key)) continue;
            used.add(key);
          }
          out.push(q);
        }
      }
    }
    return out;
  }

  /** Moves an element by dx, dy (in place). */
  function translateElement(el, dx, dy) {
    switch (el.type) {
      case 'strip': el.x1 += dx; el.x2 += dx; el.y1 += dy; el.y2 += dy; break;
      case 'circle': el.cx += dx; el.cy += dy; break;
      case 'path': case 'points':
        el.points = el.points.map((p) => [p[0] + dx, p[1] + dy].concat(p.length > 2 ? [p[2]] : []));
        break;
      default: el.x += dx; el.y += dy;
    }
  }

  function normalizeSettings(s) {
    s = s || {};
    const pixelType = PIXEL_TYPES[s.pixelType] ? s.pixelType : 'RGB';
    const ch = PIXEL_TYPES[pixelType].channels;
    const autoMax = Math.floor(DMX_UNIVERSE_SIZE / ch);
    let maxPPU = int(s.maxPixelsPerUniverse, 0);
    if (maxPPU <= 0 || maxPPU > autoMax) maxPPU = autoMax;
    return {
      pixelType,
      channelsPerPixel: ch,
      maxPixelsPerUniverse: maxPPU,
      firstUniverse: Math.max(0, int(s.firstUniverse, 1)),
      universesPerPort: Math.max(1, int(s.universesPerPort, 1)),
      portsPerController: Math.max(1, int(s.portsPerController, 8)),
      fixtureName: (s.fixtureName && String(s.fixtureName).trim()) || PIXEL_TYPES[pixelType].fixture,
    };
  }

  /**
   * Runs the whole patch: positions + addressing + validation.
   * project = { settings, elements: [] }
   */
  function buildPatch(project) {
    const settings = normalizeSettings(project.settings);
    const ch = settings.channelsPerPixel;
    const upp = settings.universesPerPort;
    const ppc = settings.portsPerController;
    const first = settings.firstUniverse;

    const pixels = [];
    const elements = [];
    const warnings = [];

    let universe = first;
    let pixInUni = 0;
    let id = 1;

    const portOf = (u) => Math.floor((u - first) / upp); // 0-based port index overall

    (project.elements || []).forEach((el, ei) => {
      const name = (el.name && String(el.name)) || el.type + ' ' + (ei + 1);
      // Guard against layouts so big they would freeze the browser.
      if (pixels.length + pixelCount(el) > MAX_TOTAL_PIXELS) {
        warnings.push({
          level: 'error',
          text: `"${name}" was skipped: the layout would go over ${MAX_TOTAL_PIXELS.toLocaleString('en-US')} pixels. Make it smaller or split the project.`,
        });
        elements.push({ index: ei, name, type: el.type, count: 0 });
        return;
      }
      const pos = generatePixels(el);
      if (pos.length === 0) {
        warnings.push({ level: 'warn', text: `"${name}" has no pixels.` });
        elements.push({ index: ei, name, type: el.type, count: 0 });
        return;
      }
      // Start-of-element jumps
      if (el.newPort) {
        const rel = universe - first;
        const fresh = pixInUni === 0 && rel % upp === 0;
        if (!fresh) {
          universe = first + (Math.floor(rel / upp) + 1) * upp;
          pixInUni = 0;
        }
      } else if (el.newUniverse && pixInUni !== 0) {
        universe++;
        pixInUni = 0;
      }

      const startIdx = pixels.length;
      let lastCopy = 0;
      pos.forEach((p, i) => {
        if (el.repeatNewUniverse && p.copy !== lastCopy) {
          lastCopy = p.copy;
          if (pixInUni !== 0) { universe++; pixInUni = 0; }
        }
        if (pixInUni >= settings.maxPixelsPerUniverse) {
          universe++;
          pixInUni = 0;
        }
        const port = portOf(universe);
        pixels.push({
          id: id++,
          element: ei,
          elementName: name,
          index: i + 1,
          x: p.x, y: p.y, z: p.z,
          universe,
          channel: 1 + pixInUni * ch,
          channels: ch,
          controller: Math.floor(port / ppc) + 1,
          port: (port % ppc) + 1,
        });
        pixInUni++;
      });
      const a = pixels[startIdx], b = pixels[pixels.length - 1];
      elements.push({
        index: ei, name, type: el.type, count: pos.length,
        start: { universe: a.universe, channel: a.channel, controller: a.controller, port: a.port },
        end: { universe: b.universe, channel: b.channel + ch - 1, controller: b.controller, port: b.port },
        universes: b.universe - a.universe + 1,
      });
    });

    // Validation
    const seen = new Map();
    let dupes = 0;
    let negative = 0;
    for (const p of pixels) {
      const key = p.x + ',' + p.y + ',' + p.z;
      if (seen.has(key)) dupes++;
      else seen.set(key, p);
      if (p.x < 0 || p.y < 0 || p.z < 0) negative++;
    }
    if (dupes) {
      warnings.push({
        level: 'error',
        text: `${dupes} pixel(s) share a position with another pixel. MADRIX can't place two fixtures on the same voxel - move or space out the elements.`,
      });
    }
    if (negative) {
      warnings.push({
        level: 'warn',
        text: `${negative} pixel(s) have negative coordinates. The MADRIX matrix starts at 0,0 - move the layout right/down.`,
      });
    }
    const last = pixels[pixels.length - 1];
    if (pixels.length * ch > MADRIX_MAX_CHANNELS) {
      warnings.push({
        level: 'warn',
        text: `${(pixels.length * ch).toLocaleString('en-US')} DMX channels is more than the largest MADRIX 5 licence (Maximum: 2,048 universes / ${MADRIX_MAX_CHANNELS.toLocaleString('en-US')} channels).`,
      });
    }
    if (last && last.universe > MAX_SACN_UNIVERSE) {
      warnings.push({ level: 'error', text: `Universe ${last.universe} is above the sACN limit (${MAX_SACN_UNIVERSE}).` });
    }

    let bounds = null;
    if (pixels.length) {
      bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: 0 };
      for (const p of pixels) {
        if (p.x < bounds.minX) bounds.minX = p.x;
        if (p.y < bounds.minY) bounds.minY = p.y;
        if (p.x > bounds.maxX) bounds.maxX = p.x;
        if (p.y > bounds.maxY) bounds.maxY = p.y;
        if (p.z > bounds.maxZ) bounds.maxZ = p.z;
      }
    }

    const usedUniverses = new Set(pixels.map((p) => p.universe)).size;
    return {
      settings,
      pixels,
      elements,
      warnings,
      bounds,
      totals: {
        pixels: pixels.length,
        channels: pixels.length * ch,
        universes: usedUniverses,
        lastUniverse: last ? last.universe : null,
        matrix: bounds ? { width: bounds.maxX + 1, height: bounds.maxY + 1, depth: bounds.maxZ + 1 } : null,
      },
    };
  }

  const CSV_COLUMNS = [
    ['Fixture ID', (p) => p.id],
    ['Fixture Name', (p, s) => s.fixtureName],
    ['Display Name', (p) => `${p.elementName} #${p.index}`],
    ['Position X', (p) => p.x],
    ['Position Y', (p) => p.y],
    ['Position Z', (p) => p.z],
    ['DMX Universe', (p) => p.universe],
    ['DMX Channel', (p) => p.channel],
    ['Channel Count', (p) => p.channels],
    ['Group', (p) => p.elementName],
    ['Controller', (p) => p.controller],
    ['Port', (p) => p.port],
  ];

  function csvField(v, sep) {
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Builds the CSV fixture list. sep: ',' ';' or '\t'. */
  function toCSV(patch, sep) {
    sep = sep || ',';
    const lines = [CSV_COLUMNS.map((c) => csvField(c[0], sep)).join(sep)];
    for (const p of patch.pixels) {
      lines.push(CSV_COLUMNS.map((c) => csvField(c[1](p, patch.settings), sep)).join(sep));
    }
    return lines.join('\r\n') + '\r\n';
  }

  /** Wiring sheet as CSV (one row per element). */
  function wiringCSV(patch, sep) {
    sep = sep || ',';
    const head = ['Element', 'Type', 'Pixels', 'Start Universe', 'Start Channel', 'End Universe', 'End Channel',
      'Universes', 'Start Controller', 'Start Port', 'End Controller', 'End Port'];
    const lines = [head.join(sep)];
    for (const e of patch.elements) {
      if (!e.count) continue;
      lines.push([e.name, e.type, e.count, e.start.universe, e.start.channel, e.end.universe, e.end.channel,
        e.universes, e.start.controller, e.start.port, e.end.controller, e.end.port]
        .map((v) => csvField(v, sep)).join(sep));
    }
    return lines.join('\r\n') + '\r\n';
  }

  function defaultProject() {
    return {
      version: 1,
      settings: {
        pixelType: 'RGB', maxPixelsPerUniverse: 0, firstUniverse: 1,
        universesPerPort: 1, portsPerController: 8, fixtureName: '', csvSeparator: ',',
      },
      elements: [
        createElement('grid', { name: 'Wall', x: 0, y: 0, cols: 32, rows: 12 }),
        createElement('rect', { name: 'Windows', x: 0, y: 15, width: 6, height: 4, repeatX: 5 }),
        createElement('circle', { name: 'Arch', cx: 44, cy: 9, radius: 7, count: 20, startAngle: 180, sweep: 180 }),
        createElement('text', { name: 'Sign', text: 'RIZHU', x: 37, y: 13 }),
      ],
    };
  }

  return {
    PIXEL_TYPES, ELEMENT_DEFAULTS, DMX_UNIVERSE_SIZE, CSV_COLUMNS,
    MAX_TOTAL_PIXELS, FONT, createElement, pixelCount, generatePixels, translateElement, textMask, normalizeSettings, buildPatch, toCSV, wiringCSV, defaultProject,
  };
});
