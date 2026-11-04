/*
 * Rizhu - core patch logic (no DOM).
 * Generates pixel positions for layout elements, assigns DMX universes/channels,
 * validates the patch and builds the CSV fixture list.
 * Works in the browser (window.PatchCore) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PatchCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  const ELEMENT_DEFAULTS = {
    grid: {
      type: 'grid', name: 'Grid', x: 0, y: 0, z: 0, cols: 16, rows: 8, spacing: 1,
      startCorner: 'TL', direction: 'rows', snake: true, newUniverse: true, newPort: false,
    },
    strip: {
      type: 'strip', name: 'Strip', x1: 0, y1: 0, x2: 29, y2: 0, z: 0, count: 30,
      newUniverse: true, newPort: false,
    },
    circle: {
      type: 'circle', name: 'Ring', cx: 10, cy: 10, z: 0, radius: 8, count: 24, startAngle: -90,
      clockwise: true, newUniverse: true, newPort: false,
    },
  };

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
    return Object.assign({}, base, overrides || {});
  }

  /** Number of pixels an element will produce, without generating them. */
  function pixelCount(el) {
    if (el.type === 'grid') return Math.max(0, int(el.cols)) * Math.max(0, int(el.rows));
    if (el.type === 'strip' || el.type === 'circle') return Math.max(0, int(el.count));
    return 0;
  }

  /** Returns pixel positions [{x,y,z}] in wiring order for one element. */
  function generatePixels(el) {
    const z = int(el.z);
    const out = [];
    if (el.type === 'grid') {
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
          out.push({ x: ox + col * sp, y: oy + row * sp, z });
        }
      }
    } else if (el.type === 'strip') {
      const n = Math.max(0, int(el.count));
      const x1 = num(el.x1), y1 = num(el.y1), x2 = num(el.x2), y2 = num(el.y2);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        out.push({ x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t), z });
      }
    } else if (el.type === 'circle') {
      const n = Math.max(0, int(el.count));
      const r = Math.max(0, num(el.radius));
      const cx = num(el.cx), cy = num(el.cy);
      const dir = el.clockwise === false ? -1 : 1; // screen y points down
      const start = (num(el.startAngle) * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const ang = start + (dir * i * 2 * Math.PI) / n;
        out.push({ x: Math.round(cx + r * Math.cos(ang)), y: Math.round(cy + r * Math.sin(ang)), z });
      }
    }
    return out;
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
      pos.forEach((p, i) => {
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
        createElement('strip', { name: 'Top edge', x1: 0, y1: 14, x2: 31, y2: 14, count: 32 }),
        createElement('circle', { name: 'Logo ring', cx: 44, cy: 6, radius: 6, count: 24 }),
      ],
    };
  }

  return {
    PIXEL_TYPES, ELEMENT_DEFAULTS, DMX_UNIVERSE_SIZE, CSV_COLUMNS,
    MAX_TOTAL_PIXELS, createElement, pixelCount, generatePixels, normalizeSettings, buildPatch, toCSV, wiringCSV, defaultProject,
  };
});
