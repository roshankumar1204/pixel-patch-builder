/*
 * Rizhu - importers (no DOM): CSV point lists, SVG geometry, image masks.
 * Browser: window.RizhuImport. Node: module.exports.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RizhuImport = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function pathProps() {
    if (root && root.SvgPathProperties) return root.SvgPathProperties;
    if (typeof require === 'function') {
      require('../vendor/svg-path-properties.js');
      return globalThis.SvgPathProperties;
    }
    throw new Error('svg-path-properties not loaded');
  }

  // ---------------- CSV points ----------------
  /**
   * Parses a CSV/TSV list of LED positions (e.g. from MariMapper or another mapping tool).
   * Accepts a header with x/y/z (and optional index/id/led) columns, or plain numbers:
   * 2 cols = x,y; 3 cols = x,y,z; 4+ cols = index,x,y,z.
   * Returns points in LED order: [[x,y,z?], ...]
   */
  function parsePointsCSV(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) return { points: [], hasZ: false };
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
    const isNum = (v) => v !== '' && Number.isFinite(Number(v));
    let header = null;
    if (rows[0].some((c) => !isNum(c))) header = rows.shift().map((h) => h.toLowerCase());
    let ix = -1, iy = -1, iz = -1, ii = -1;
    if (header) {
      const find = (names) => header.findIndex((h) => names.includes(h));
      ix = find(['x', 'pos x', 'position x', 'x position']);
      iy = find(['y', 'pos y', 'position y', 'y position']);
      iz = find(['z', 'pos z', 'position z', 'z position']);
      ii = find(['index', 'id', 'led', 'led_id', 'led index', 'pixel', 'n']);
    }
    if (ix < 0 || iy < 0) {
      const w = rows.length ? rows[0].length : 0;
      if (w >= 4) { ii = 0; ix = 1; iy = 2; iz = 3; } else if (w === 3) { ix = 0; iy = 1; iz = 2; } else { ix = 0; iy = 1; iz = -1; }
    }
    const recs = [];
    rows.forEach((r, n) => {
      if (!isNum(r[ix]) || !isNum(r[iy])) return;
      recs.push({
        i: ii >= 0 && isNum(r[ii]) ? Number(r[ii]) : n,
        p: [Number(r[ix]), Number(r[iy])].concat(iz >= 0 && isNum(r[iz]) ? [Number(r[iz])] : []),
      });
    });
    recs.sort((a, b) => a.i - b.i);
    return { points: recs.map((r) => r.p), hasZ: recs.some((r) => r.p.length > 2) };
  }

  /** Scales points so the X/Y width equals targetWidth and moves them to start at (ox, oy). Z is scaled and shifted to start at 0. */
  function fitPoints(points, targetWidth, ox, oy) {
    if (!points.length) return [];
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      if (p.length > 2) minZ = Math.min(minZ, p[2]);
    });
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const k = targetWidth > 0 ? targetWidth / span : 1;
    return points.map((p) => {
      const q = [ox + (p[0] - minX) * k, oy + (p[1] - minY) * k];
      if (p.length > 2) q.push((p[2] - minZ) * k);
      return q;
    });
  }

  // ---------------- geometry helpers ----------------
  /** Ramer-Douglas-Peucker simplification for [[x,y],...] */
  function simplify(points, tol) {
    if (points.length < 3) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = points[a], [bx, by] = points[b];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      let maxD = -1, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter((_, i) => keep[i]);
  }

  // 2D affine matrices as [a, b, c, d, e, f] (SVG convention)
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  function parseTransform(str) {
    let m = IDENTITY;
    if (!str) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let t;
    while ((t = re.exec(str))) {
      const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
      let n = IDENTITY;
      switch (t[1]) {
        case 'matrix': if (v.length === 6) n = v; break;
        case 'translate': n = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
        case 'scale': n = [v[0] || 1, 0, 0, v.length > 1 ? v[1] : v[0] || 1, 0, 0]; break;
        case 'rotate': {
          const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
          n = [c, s, -s, c, 0, 0];
          if (v.length >= 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
          break;
        }
        case 'skewX': n = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0]; break;
        case 'skewY': n = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
      }
      m = mul(m, n);
    }
    return m;
  }

  /** Converts a basic SVG shape (tag + attribute getter) to path data. */
  function shapeToPathD(tag, attr) {
    const n = (k) => Number(attr(k)) || 0;
    switch (tag) {
      case 'path': return attr('d') || '';
      case 'line': return `M${n('x1')},${n('y1')} L${n('x2')},${n('y2')}`;
      case 'polyline': case 'polygon': {
        const v = String(attr('points') || '').trim().split(/[\s,]+/).map(Number);
        if (v.length < 4) return '';
        let d = `M${v[0]},${v[1]}`;
        for (let i = 2; i + 1 < v.length; i += 2) d += ` L${v[i]},${v[i + 1]}`;
        return tag === 'polygon' ? d + ' Z' : d;
      }
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        if (!w || !h) return '';
        return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
      }
      case 'circle': case 'ellipse': {
        const cx = n('cx'), cy = n('cy');
        const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        if (!rx || !ry) return '';
        return `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`;
      }
      default: return '';
    }
  }

  /**
   * Samples path data every `step` units (in the path's own units), applies matrix m,
   * and splits into separate runs where the path jumps (move-to).
   */
  function samplePath(d, m, step) {
    const P = pathProps();
    let props;
    try { props = new P(d); } catch (e) { return []; }
    const L = props.getTotalLength();
    if (!(L > 0)) return [];
    const n = Math.min(20000, Math.max(2, Math.ceil(L / step) + 1));
    const runs = [];
    let cur = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
      const pt = props.getPointAtLength((i * L) / (n - 1));
      if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) > step * 3) {
        if (cur.length > 1) runs.push(cur);
        cur = [];
      }
      cur.push(apply(m, pt.x, pt.y));
      prev = pt;
    }
    if (cur.length > 1) runs.push(cur);
    return runs;
  }

  /**
   * Turns a list of {tag, attr, matrix} shapes (from an SVG) into polylines that fit targetWidth,
   * placed at (ox, oy). Returns [{points, closed}].
   */
  function svgShapesToPaths(shapes, targetWidth, ox, oy) {
    // 1st pass: rough bounds to choose sampling step
    const raw = [];
    shapes.forEach((s) => {
      const d = shapeToPathD(s.tag, s.attr);
      if (d) raw.push({ d, m: s.matrix || IDENTITY, closed: /z\s*$/i.test(d.trim()) });
    });
    if (!raw.length) return [];
    let coarse = [];
    raw.forEach((r) => samplePath(r.d, r.m, 1e9).forEach((run) => (coarse = coarse.concat(run))));
    raw.forEach((r) => {
      const P = pathProps();
      try {
        const props = new P(r.d), L = props.getTotalLength();
        for (let i = 0; i <= 16; i++) { const p = props.getPointAtLength((i * L) / 16); coarse.push(apply(r.m, p.x, p.y)); }
      } catch (e) { /* skip */ }
    });
    const xs = coarse.map((p) => p[0]), ys = coarse.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
    const k = targetWidth / span; // svg units -> pixels
    // 2nd pass: sample at ~quarter pixel (in pixel units after scaling, ignoring matrix scale)
    const runs = [];
    raw.forEach((r) => {
      const ms = Math.sqrt(Math.abs(r.m[0] * r.m[3] - r.m[1] * r.m[2])) || 1;
      samplePath(r.d, r.m, 0.25 / k / ms).forEach((run, i, all) => runs.push({ run, closed: r.closed && all.length === 1 }));
    });
    let minX = Infinity, minY = Infinity;
    runs.forEach(({ run }) => run.forEach((p) => { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); }));
    return runs.map(({ run, closed }) => {
      let pts = run.map((p) => [ox + (p[0] - minX) * k, oy + (p[1] - minY) * k]);
      if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts.pop();
      pts = simplify(pts, 0.15).map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
      return { points: pts, closed };
    }).filter((p) => p.points.length >= 2);
  }

  // ---------------- image mask ----------------
  /**
   * RGBA pixel data -> mask rows ('1' = LED). Transparent images: opaque = LED.
   * Otherwise darker-than-average = LED (logo on white).
   */
  function maskFromRGBA(data, w, h) {
    let transparent = 0, lumSum = 0;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3];
      if (a < 128) transparent++;
      lum[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      lumSum += lum[i];
    }
    const useAlpha = transparent > w * h * 0.05;
    const mean = lumSum / (w * h);
    const threshold = Math.min(200, Math.max(40, mean));
    const mask = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        row += (useAlpha ? data[i * 4 + 3] >= 128 : lum[i] < threshold) ? '1' : '0';
      }
      mask.push(row);
    }
    return { mask, mode: useAlpha ? 'alpha' : 'dark' };
  }

  return { parsePointsCSV, fitPoints, simplify, parseTransform, shapeToPathD, samplePath, svgShapesToPaths, maskFromRGBA, mul, IDENTITY };
});
