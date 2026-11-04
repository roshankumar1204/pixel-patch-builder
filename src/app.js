/* Rizhu - Pixel Patch Builder UI */
(function () {
  'use strict';
  const Core = window.PatchCore;
  const STORAGE_KEY = 'rizhu.project.v1';

  // ---------- state ----------
  let project = loadProject() || Core.defaultProject();
  let selected = project.elements.length ? 0 : -1;
  let patch = null;
  const view = { scale: 12, ox: 40, oy: 40, fitted: false, userMoved: false };
  const bg = { img: null, src: project.background ? project.background.src : null };
  const opts = { path: true, numbers: false, grid: true };

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const uniColor = (u, a) => `hsla(${(u * 137.508) % 360}, 78%, 60%, ${a == null ? 1 : a})`;
  const elColor = (i) => `hsl(${(i * 67 + 280) % 360}, 70%, 62%)`;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  const safeName = () => (project.settings.projectName || 'rizhu-patch').replace(/[^\w\-]+/g, '_');

  // ---------- persistence ----------
  function loadProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitizeProject(JSON.parse(raw));
    } catch (e) { return null; }
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
    catch (e) {
      // Background images can exceed storage quota - retry without it.
      try {
        const copy = Object.assign({}, project, { background: null });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      } catch (e2) { /* storage unavailable */ }
    }
  }
  function sanitizeProject(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.elements)) return null;
    const def = Core.defaultProject();
    const out = { version: 1, settings: Object.assign({}, def.settings, p.settings || {}), elements: [] };
    p.elements.forEach((e) => {
      if (e && Core.ELEMENT_DEFAULTS[e.type]) out.elements.push(Core.createElement(e.type, e));
    });
    if (p.background && typeof p.background.src === 'string') {
      out.background = {
        src: p.background.src,
        width: Number(p.background.width) || 64,
        opacity: Number(p.background.opacity) >= 0 ? Number(p.background.opacity) : 0.5,
      };
    }
    return out;
  }

  // ---------- forms ----------
  const SETTINGS_FIELDS = [
    { key: 'projectName', label: 'Project name', type: 'text', full: true, placeholder: 'rizhu-patch' },
    { key: 'pixelType', label: 'Pixel type', type: 'select', full: true,
      options: Object.keys(Core.PIXEL_TYPES).map((k) => [k, Core.PIXEL_TYPES[k].label]) },
    { key: 'maxPixelsPerUniverse', label: 'Pixels / universe (0 = max)', type: 'number', min: 0 },
    { key: 'firstUniverse', label: 'First universe', type: 'number', min: 0 },
    { key: 'universesPerPort', label: 'Universes / port', type: 'number', min: 1 },
    { key: 'portsPerController', label: 'Ports / controller', type: 'number', min: 1 },
    { key: 'fixtureName', label: 'Fixture name in CSV', type: 'text', placeholder: 'auto', full: false },
    { key: 'csvSeparator', label: 'CSV separator', type: 'select',
      options: [[',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab']] },
  ];
  const COMMON_CHECKS = [
    { key: 'newUniverse', label: 'Start on a new universe', type: 'check' },
    { key: 'newPort', label: 'Start on a new controller port', type: 'check' },
  ];
  const ELEMENT_FIELDS = {
    grid: [
      { key: 'name', label: 'Name', type: 'text', full: true },
      { key: 'x', label: 'X (left)', type: 'number' }, { key: 'y', label: 'Y (top)', type: 'number' },
      { key: 'cols', label: 'Columns', type: 'number', min: 1 }, { key: 'rows', label: 'Rows', type: 'number', min: 1 },
      { key: 'spacing', label: 'Spacing', type: 'number', min: 1 }, { key: 'z', label: 'Z (depth)', type: 'number', min: 0 },
      { key: 'startCorner', label: 'Data starts at', type: 'select',
        options: [['TL', 'Top left'], ['TR', 'Top right'], ['BL', 'Bottom left'], ['BR', 'Bottom right']] },
      { key: 'direction', label: 'Runs along', type: 'select', options: [['rows', 'Rows →'], ['cols', 'Columns ↓']] },
      { key: 'snake', label: 'Snake / zig-zag wiring', type: 'check' },
    ].concat(COMMON_CHECKS),
    strip: [
      { key: 'name', label: 'Name', type: 'text', full: true },
      { key: 'x1', label: 'Start X', type: 'number' }, { key: 'y1', label: 'Start Y', type: 'number' },
      { key: 'x2', label: 'End X', type: 'number' }, { key: 'y2', label: 'End Y', type: 'number' },
      { key: 'count', label: 'Pixels', type: 'number', min: 1 }, { key: 'z', label: 'Z (depth)', type: 'number', min: 0 },
    ].concat(COMMON_CHECKS),
    circle: [
      { key: 'name', label: 'Name', type: 'text', full: true },
      { key: 'cx', label: 'Centre X', type: 'number' }, { key: 'cy', label: 'Centre Y', type: 'number' },
      { key: 'radius', label: 'Radius', type: 'number', min: 1 }, { key: 'count', label: 'Pixels', type: 'number', min: 1 },
      { key: 'startAngle', label: 'Start angle °', type: 'number' }, { key: 'z', label: 'Z (depth)', type: 'number', min: 0 },
      { key: 'clockwise', label: 'Clockwise', type: 'check' },
    ].concat(COMMON_CHECKS),
  };
  const TYPE_LABEL = { grid: 'Grid', strip: 'Strip', circle: 'Ring' };

  function buildForm(container, fields, obj, onChange) {
    container.innerHTML = '';
    fields.forEach((f) => {
      let input;
      if (f.type === 'select') {
        input = el('select', { 'data-key': f.key });
        f.options.forEach(([v, label]) => input.appendChild(el('option', { value: v, text: label })));
        input.value = obj[f.key] == null ? f.options[0][0] : obj[f.key];
      } else if (f.type === 'check') {
        input = el('input', { type: 'checkbox', 'data-key': f.key });
        input.checked = !!obj[f.key];
      } else {
        input = el('input', { type: f.type === 'number' ? 'number' : 'text', 'data-key': f.key });
        if (f.min != null) input.min = f.min;
        if (f.placeholder) input.placeholder = f.placeholder;
        input.value = obj[f.key] == null ? '' : obj[f.key];
      }
      input.addEventListener(f.type === 'text' || f.type === 'number' ? 'input' : 'change', () => {
        let v;
        if (f.type === 'check') v = input.checked;
        else if (f.type === 'number') {
          if (input.value === '' || !Number.isFinite(Number(input.value))) return;
          v = Number(input.value);
        } else v = input.value;
        obj[f.key] = v;
        onChange(f.key);
      });
      const cls = 'field' + (f.type === 'check' ? ' check' : '') + (f.full ? ' full' : '');
      const label = el('label', { class: cls }, f.type === 'check'
        ? [input, el('span', { text: f.label })]
        : [el('span', { text: f.label }), input]);
      container.appendChild(label);
    });
  }
  function syncForm(container, obj) {
    container.querySelectorAll('[data-key]').forEach((input) => {
      if (document.activeElement === input) return;
      const v = obj[input.dataset.key];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v == null ? '' : v;
    });
  }

  // ---------- UI rendering ----------
  function renderElementList() {
    const list = $('#element-list');
    list.innerHTML = '';
    if (!project.elements.length) {
      list.appendChild(el('li', { class: 'empty', text: 'No elements yet – add a grid, strip or ring.' }));
    }
    project.elements.forEach((e, i) => {
      const info = patch && patch.elements[i];
      const meta = info && info.count ? `${info.count} px · U${info.start.universe}` : '0 px';
      list.appendChild(el('li', {
        class: i === selected ? 'active' : '',
        onclick: () => select(i),
      }, [
        el('span', { class: 'swatch', style: `background:${elColor(i)}` }),
        el('span', { class: 'el-name', text: `${i + 1}. ${e.name || TYPE_LABEL[e.type]}` }),
        el('span', { class: 'el-meta', text: meta }),
      ]));
    });
  }

  function renderEditor() {
    const wrap = $('#element-editor-wrap');
    const e = project.elements[selected];
    if (!e) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#editor-title').textContent = `${TYPE_LABEL[e.type]} settings`;
    buildForm($('#element-form'), ELEMENT_FIELDS[e.type], e, () => update({ list: true }));
  }

  function renderSummary() {
    const t = patch.totals;
    const stats = [
      [t.pixels.toLocaleString(), 'pixels'],
      [t.universes.toLocaleString(), 'universes'],
      [t.channels.toLocaleString(), 'DMX channels'],
      [t.matrix ? `${t.matrix.width}×${t.matrix.height}${t.matrix.depth > 1 ? '×' + t.matrix.depth : ''}` : '–', 'matrix size'],
    ];
    const box = $('#stats');
    box.innerHTML = '';
    stats.forEach(([v, k]) => box.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'v', text: v }), el('div', { class: 'k', text: k }),
    ])));

    const w = $('#warnings');
    w.innerHTML = '';
    if (!patch.warnings.length) {
      w.appendChild(el('li', { class: 'ok', text: t.pixels ? 'No problems found – ready to export.' : 'Add an element to start.' }));
    }
    patch.warnings.forEach((x) => w.appendChild(el('li', { class: x.level, text: x.text })));

    const tbl = $('#wiring-table');
    tbl.innerHTML = '';
    tbl.appendChild(el('thead', null, [el('tr', null,
      ['#', 'Element', 'Pixels', 'Start', 'End', 'Ctrl / Port'].map((h) => el('th', { text: h })))]));
    const body = el('tbody');
    patch.elements.forEach((e, i) => {
      if (!e.count) return;
      const a = e.start, b = e.end;
      const ports = a.controller !== b.controller ? `${a.controller}/${a.port}–${b.controller}/${b.port}`
        : a.port === b.port ? `${a.controller}/${a.port}` : `${a.controller}/${a.port}–${b.port}`;
      body.appendChild(el('tr', null, [
        el('td', { text: String(i + 1) }), el('td', { text: e.name }), el('td', { text: String(e.count) }),
        el('td', { text: `U${e.start.universe} ch${e.start.channel}` }),
        el('td', { text: `U${e.end.universe} ch${e.end.channel}` }),
        el('td', { text: ports }),
      ]));
    });
    tbl.appendChild(body);
  }

  function update(what) {
    patch = Core.buildPatch(project);
    renderSummary();
    if (!what || what.list) renderElementList();
    draw();
    scheduleSave();
  }

  function select(i) {
    selected = i;
    renderElementList();
    renderEditor();
    draw();
  }

  // ---------- element actions ----------
  function nextFreeSpot() {
    if (!patch || !patch.bounds) return { x: 0, y: 0 };
    return { x: 0, y: patch.bounds.maxY + 3 };
  }
  function addElement(type) {
    const spot = nextFreeSpot();
    const n = project.elements.filter((e) => e.type === type).length + 1;
    const o = { name: `${TYPE_LABEL[type]} ${n}` };
    if (type === 'grid') Object.assign(o, { x: spot.x, y: spot.y });
    if (type === 'strip') Object.assign(o, { x1: spot.x, y1: spot.y, x2: spot.x + 29, y2: spot.y });
    if (type === 'circle') Object.assign(o, { cx: spot.x + 8, cy: spot.y + 8 });
    project.elements.push(Core.createElement(type, o));
    selected = project.elements.length - 1;
    update();
    renderEditor();
    fitView();
  }
  function translate(e, dx, dy) {
    if (e.type === 'grid') { e.x += dx; e.y += dy; }
    else if (e.type === 'strip') { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy; }
    else if (e.type === 'circle') { e.cx += dx; e.cy += dy; }
  }

  // ---------- canvas ----------
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const wrap = $('#canvas-wrap');
  let cw = 0, ch = 0;

  function resize() {
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!view.fitted || !view.userMoved) fitView(); else draw();
  }
  const toScreen = (x, y) => [x * view.scale + view.ox, y * view.scale + view.oy];
  const toWorld = (sx, sy) => [(sx - view.ox) / view.scale, (sy - view.oy) / view.scale];

  function fitView() {
    if (!cw || !ch) return;
    let minX = 0, minY = 0, maxX = 10, maxY = 10;
    if (patch && patch.bounds) ({ minX, minY, maxX, maxY } = patch.bounds);
    if (bg.img) { maxX = Math.max(maxX, bgWidth()); maxY = Math.max(maxY, bgHeight()); minX = Math.min(minX, 0); minY = Math.min(minY, 0); }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const pad = 40;
    view.scale = Math.max(0.5, Math.min((cw - pad * 2) / w, (ch - pad * 2) / h, 60));
    view.ox = (cw - w * view.scale) / 2 - minX * view.scale + view.scale / 2;
    view.oy = (ch - h * view.scale) / 2 - minY * view.scale + view.scale / 2;
    view.fitted = true;
    view.userMoved = false;
    draw();
  }

  const bgWidth = () => (project.background && project.background.width) || 64;
  const bgHeight = () => (bg.img ? bgWidth() * (bg.img.naturalHeight / bg.img.naturalWidth) : 0);

  function draw() {
    if (!patch || !cw) return;
    ctx.fillStyle = cssVar('--stage') || '#eef0f6';
    ctx.fillRect(0, 0, cw, ch);
    const s = view.scale;

    // background image (world 0,0 = top-left of image; pixel centres sit on integer coords)
    if (bg.img && project.background) {
      ctx.globalAlpha = project.background.opacity;
      const [bx, by] = toScreen(-0.5, -0.5);
      ctx.drawImage(bg.img, bx, by, bgWidth() * s, bgHeight() * s);
      ctx.globalAlpha = 1;
    }

    // grid
    if (opts.grid && s >= 3) {
      const step = s >= 8 ? 1 : s >= 3 ? 5 : 10;
      ctx.strokeStyle = cssVar('--stage-grid');
      ctx.lineWidth = 1;
      const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(cw, ch);
      ctx.beginPath();
      for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) {
        const sx = Math.round(toScreen(x - 0.5, 0)[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, ch);
      }
      for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) {
        const sy = Math.round(toScreen(0, y - 0.5)[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(cw, sy);
      }
      ctx.stroke();
    }

    // matrix outline
    if (patch.totals.matrix) {
      const [x0, y0] = toScreen(-0.5, -0.5);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = cssVar('--muted');
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(x0, y0, patch.totals.matrix.width * s, patch.totals.matrix.height * s);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const px = patch.pixels;
    const r = Math.max(1.6, Math.min(s * 0.36, 14));

    // wiring path
    if (opts.path && px.length) {
      ctx.lineWidth = Math.max(1, Math.min(s * 0.08, 2));
      for (let i = 1; i < px.length; i++) {
        const a = px[i - 1], b = px[i];
        if (a.element !== b.element) continue;
        ctx.strokeStyle = b.element === selected ? cssVar('--accent') : uniColor(b.universe, 0.35);
        const [ax, ay] = toScreen(a.x, a.y), [bx2, by2] = toScreen(b.x, b.y);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.stroke();
      }
    }

    // pixels
    for (const p of px) {
      const [x, y] = toScreen(p.x, p.y);
      if (x < -r || y < -r || x > cw + r || y > ch + r) continue;
      ctx.fillStyle = uniColor(p.universe);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (p.element === selected && r >= 3) {
        ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.2; ctx.stroke();
      }
    }

    // pixel numbers
    if (opts.numbers && s >= 16) {
      ctx.fillStyle = '#000';
      ctx.font = `600 ${Math.min(11, s * 0.35)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const p of px) {
        const [x, y] = toScreen(p.x, p.y);
        if (x < 0 || y < 0 || x > cw || y > ch) continue;
        ctx.fillText(String(p.index), x, y);
      }
    }

    // start markers + labels
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    patch.elements.forEach((e, i) => {
      if (!e.count) return;
      const first = px.find((p) => p.element === i);
      const [x, y] = toScreen(first.x, first.y);
      ctx.strokeStyle = i === selected ? cssVar('--accent') : cssVar('--text');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
      const label = `▶ ${e.name}  U${e.start.universe}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = cssVar('--panel');
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - 2, y - r - 22, tw + 8, 17);
      ctx.globalAlpha = 1;
      ctx.fillStyle = i === selected ? cssVar('--accent') : cssVar('--text');
      ctx.fillText(label, x + 2, y - r - 7);
    });
  }

  function hitTest(sx, sy) {
    if (!patch) return null;
    const lim = Math.max(8, view.scale * 0.55);
    let best = null, bd = lim * lim;
    for (const p of patch.pixels) {
      const [x, y] = toScreen(p.x, p.y);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }

  // pointer interaction
  let drag = null;
  const tooltip = $('#tooltip');
  canvas.addEventListener('pointerdown', (ev) => {
    const r = canvas.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const hit = hitTest(sx, sy);
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('dragging');
    tooltip.hidden = true;
    if (hit) {
      if (selected !== hit.element) select(hit.element);
      const [wx, wy] = toWorld(sx, sy);
      drag = { mode: 'move', wx, wy, dx: 0, dy: 0 };
    } else {
      drag = { mode: 'pan', sx, sy, ox: view.ox, oy: view.oy };
      view.userMoved = true;
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const r = canvas.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    if (drag && drag.mode === 'pan') {
      view.ox = drag.ox + (sx - drag.sx);
      view.oy = drag.oy + (sy - drag.sy);
      draw();
      return;
    }
    if (drag && drag.mode === 'move') {
      const [wx, wy] = toWorld(sx, sy);
      const dx = Math.round(wx - drag.wx), dy = Math.round(wy - drag.wy);
      if (dx !== drag.dx || dy !== drag.dy) {
        translate(project.elements[selected], dx - drag.dx, dy - drag.dy);
        drag.dx = dx; drag.dy = dy;
        update({ list: false });
        syncForm($('#element-form'), project.elements[selected]);
      }
      return;
    }
    const hit = hitTest(sx, sy);
    if (hit) {
      tooltip.hidden = false;
      tooltip.innerHTML = '';
      tooltip.appendChild(el('b', { text: `${hit.elementName} #${hit.index}` }));
      tooltip.appendChild(document.createTextNode(
        `Universe ${hit.universe} · ch ${hit.channel}–${hit.channel + hit.channels - 1}`));
      tooltip.appendChild(el('br'));
      tooltip.appendChild(document.createTextNode(
        `X ${hit.x} · Y ${hit.y}${hit.z ? ' · Z ' + hit.z : ''} · Ctrl ${hit.controller} / Port ${hit.port}`));
      const tx = Math.min(sx + 14, cw - tooltip.offsetWidth - 6);
      const ty = sy + 16 + tooltip.offsetHeight > ch ? sy - tooltip.offsetHeight - 10 : sy + 16;
      tooltip.style.left = Math.max(4, tx) + 'px';
      tooltip.style.top = Math.max(4, ty) + 'px';
      canvas.style.cursor = 'move';
    } else {
      tooltip.hidden = true;
      canvas.style.cursor = '';
    }
  });
  const endDrag = () => {
    if (drag && drag.mode === 'move') renderElementList();
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag) tooltip.hidden = true; });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const [wx, wy] = toWorld(sx, sy);
    const f = Math.exp(-ev.deltaY * 0.0015);
    view.userMoved = true;
    view.scale = Math.max(0.3, Math.min(120, view.scale * f));
    view.ox = sx - wx * view.scale;
    view.oy = sy - wy * view.scale;
    draw();
  }, { passive: false });

  // ---------- background image ----------
  function loadBg(src) {
    if (!src) { bg.img = null; $('#bg-ctl').hidden = true; draw(); return; }
    const img = new Image();
    img.onload = () => { bg.img = img; $('#bg-ctl').hidden = false; fitView(); };
    img.src = src;
  }

  // ---------- wire up controls ----------
  function wire() {
    buildForm($('#settings-form'), SETTINGS_FIELDS, project.settings, () => update());
    document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addElement(b.dataset.add)));

    $('#btn-up').onclick = () => {
      if (selected > 0) {
        const a = project.elements; [a[selected - 1], a[selected]] = [a[selected], a[selected - 1]];
        selected--; update();
      }
    };
    $('#btn-down').onclick = () => {
      const a = project.elements;
      if (selected >= 0 && selected < a.length - 1) {
        [a[selected + 1], a[selected]] = [a[selected], a[selected + 1]];
        selected++; update();
      }
    };
    $('#btn-dup').onclick = () => {
      const e = project.elements[selected];
      if (!e) return;
      const copy = JSON.parse(JSON.stringify(e));
      copy.name = (e.name || TYPE_LABEL[e.type]) + ' copy';
      const b = patch.bounds;
      translate(copy, 0, b ? b.maxY - b.minY + 3 : 3);
      project.elements.splice(selected + 1, 0, copy);
      selected++;
      update(); renderEditor(); fitView();
    };
    $('#btn-del').onclick = deleteSelected;

    $('#btn-fit').onclick = fitView;
    $('#opt-path').onchange = (e) => { opts.path = e.target.checked; draw(); };
    $('#opt-numbers').onchange = (e) => { opts.numbers = e.target.checked; draw(); };
    $('#opt-grid').onchange = (e) => { opts.grid = e.target.checked; draw(); };

    $('#btn-export').onclick = () => {
      if (!patch.totals.pixels) { alert('Add at least one element before exporting.'); return; }
      if (patch.warnings.some((w) => w.level === 'error') &&
        !confirm('There are errors in the patch (see Checks). Export anyway?')) return;
      download(safeName() + '.csv', Core.toCSV(patch, project.settings.csvSeparator), 'text/csv');
    };
    $('#btn-wiring-csv').onclick = () =>
      download(safeName() + '-wiring.csv', Core.wiringCSV(patch, project.settings.csvSeparator), 'text/csv');
    $('#btn-print').onclick = () => window.print();

    $('#btn-save').onclick = () => download(safeName() + '.rizhu.json', JSON.stringify(project, null, 2), 'application/json');
    $('#btn-open').onclick = () => $('#file-open').click();
    $('#file-open').onchange = (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      f.text().then((t) => {
        let p = null;
        try { p = sanitizeProject(JSON.parse(t)); } catch (e) { /* invalid */ }
        if (!p) { alert('That file is not a valid Rizhu project.'); return; }
        replaceProject(p);
      });
      ev.target.value = '';
    };
    $('#btn-new').onclick = () => {
      if (!confirm('Start a new project? Unsaved changes in this one will be lost.')) return;
      const p = Core.defaultProject();
      p.elements = [Core.createElement('grid', { name: 'Grid 1' })];
      replaceProject(p);
    };

    $('#btn-bg').onclick = () => $('#file-bg').click();
    $('#file-bg').onchange = (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        project.background = { src: reader.result, width: Number($('#bg-width').value) || 64, opacity: Number($('#bg-opacity').value) };
        loadBg(reader.result);
        scheduleSave();
      };
      reader.readAsDataURL(f);
      ev.target.value = '';
    };
    $('#bg-width').oninput = (e) => {
      if (project.background && Number(e.target.value) > 0) { project.background.width = Number(e.target.value); draw(); scheduleSave(); }
    };
    $('#bg-opacity').oninput = (e) => {
      if (project.background) { project.background.opacity = Number(e.target.value); draw(); scheduleSave(); }
    };
    $('#btn-bg-clear').onclick = () => { project.background = null; loadBg(null); scheduleSave(); };

    document.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (ev.key === 'f' || ev.key === 'F') { fitView(); return; }
      const e = project.elements[selected];
      if (!e) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelected(); return; }
      const step = ev.shiftKey ? 10 : 1;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[ev.key]) {
        ev.preventDefault();
        translate(e, moves[ev.key][0], moves[ev.key][1]);
        update({ list: false });
        syncForm($('#element-form'), e);
      }
    });

    new ResizeObserver(resize).observe(wrap);
    window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
    }
  }

  function deleteSelected() {
    if (selected < 0) return;
    project.elements.splice(selected, 1);
    selected = Math.min(selected, project.elements.length - 1);
    update(); renderEditor();
  }

  function replaceProject(p) {
    project = p;
    selected = project.elements.length ? 0 : -1;
    buildForm($('#settings-form'), SETTINGS_FIELDS, project.settings, () => update());
    if (project.background) {
      $('#bg-width').value = project.background.width;
      $('#bg-opacity').value = project.background.opacity;
    }
    loadBg(project.background ? project.background.src : null);
    update(); renderEditor();
    view.fitted = false; fitView();
  }

  // ---------- boot ----------
  patch = Core.buildPatch(project);
  wire();
  if (project.background) {
    $('#bg-width').value = project.background.width;
    $('#bg-opacity').value = project.background.opacity;
    loadBg(project.background.src);
  }
  update();
  renderEditor();
})();
