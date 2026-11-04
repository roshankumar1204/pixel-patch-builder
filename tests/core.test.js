const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');

const project = (elements, settings) => ({ settings: Object.assign({ pixelType: 'RGB' }, settings), elements });

test('grid snake wiring from top-left along rows', () => {
  const px = Core.generatePixels(Core.createElement('grid', { cols: 3, rows: 2, snake: true }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]]);
});

test('grid straight wiring from bottom-right along columns', () => {
  const px = Core.generatePixels(Core.createElement('grid', {
    cols: 2, rows: 2, snake: false, startCorner: 'BR', direction: 'cols',
  }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[1, 1], [1, 0], [0, 1], [0, 0]]);
});

test('grid spacing and offset', () => {
  const px = Core.generatePixels(Core.createElement('grid', { x: 5, y: 2, cols: 2, rows: 1, spacing: 3 }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[5, 2], [8, 2]]);
});

test('strip endpoints are exact', () => {
  const px = Core.generatePixels(Core.createElement('strip', { x1: 0, y1: 0, x2: 10, y2: 5, count: 3 }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[0, 0], [5, 3], [10, 5]]);
});

test('ring has requested pixel count', () => {
  const px = Core.generatePixels(Core.createElement('circle', { cx: 20, cy: 20, radius: 10, count: 12 }));
  assert.equal(px.length, 12);
  assert.deepEqual([px[0].x, px[0].y], [20, 10]); // starts at -90 deg (top)
});

test('RGB fills 170 pixels per universe then rolls over', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { x2: 199, count: 200 })]));
  assert.equal(p.pixels[0].universe, 1);
  assert.equal(p.pixels[0].channel, 1);
  assert.equal(p.pixels[169].universe, 1);
  assert.equal(p.pixels[169].channel, 508);
  assert.equal(p.pixels[170].universe, 2);
  assert.equal(p.pixels[170].channel, 1);
  assert.equal(p.totals.universes, 2);
  assert.equal(p.totals.channels, 600);
});

test('RGBW uses 128 pixels per universe', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { x2: 128, count: 129 })], { pixelType: 'RGBW' }));
  assert.equal(p.pixels[127].channel, 509);
  assert.equal(p.pixels[128].universe, 2);
});

test('custom max pixels per universe', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { x2: 20, count: 21 })], { maxPixelsPerUniverse: 10 }));
  assert.equal(p.pixels[10].universe, 2);
  assert.equal(p.pixels[20].universe, 3);
});

test('newUniverse starts each element on a fresh universe', () => {
  const p = Core.buildPatch(project([
    Core.createElement('strip', { x2: 9, count: 10 }),
    Core.createElement('strip', { y1: 2, y2: 2, x2: 9, count: 10, newUniverse: true }),
    Core.createElement('strip', { y1: 4, y2: 4, x2: 9, count: 10, newUniverse: false }),
  ]));
  assert.equal(p.elements[1].start.universe, 2);
  assert.equal(p.elements[1].start.channel, 1);
  assert.equal(p.elements[2].start.universe, 2);
  assert.equal(p.elements[2].start.channel, 31);
});

test('newPort jumps to the next port boundary', () => {
  const p = Core.buildPatch(project([
    Core.createElement('strip', { x2: 9, count: 10 }),
    Core.createElement('strip', { y1: 2, y2: 2, x2: 9, count: 10, newPort: true }),
  ], { universesPerPort: 4, portsPerController: 2 }));
  assert.equal(p.elements[1].start.universe, 5);
  assert.equal(p.elements[1].start.port, 2);
  assert.equal(p.elements[1].start.controller, 1);
});

test('controller numbering wraps after ports per controller', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { x2: 499, count: 500 })],
    { maxPixelsPerUniverse: 100, universesPerPort: 1, portsPerController: 2 }));
  const last = p.pixels[p.pixels.length - 1];
  assert.equal(last.universe, 5);
  assert.equal(last.controller, 3);
  assert.equal(last.port, 1);
});

test('first universe 0 for Art-Net style numbering', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { count: 1 })], { firstUniverse: 0 }));
  assert.equal(p.pixels[0].universe, 0);
});

test('duplicate positions and negative coords are reported', () => {
  const p = Core.buildPatch(project([
    Core.createElement('strip', { x1: -1, x2: 2, count: 4 }),
    Core.createElement('strip', { x1: 0, x2: 2, count: 3 }),
  ]));
  const levels = p.warnings.map((w) => w.level);
  assert.ok(levels.includes('error'));
  assert.ok(p.warnings.some((w) => /negative/.test(w.text)));
});

test('CSV has header and one row per pixel, escapes separators', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { name: 'Top, left', x2: 1, count: 2 })]));
  const lines = Core.toCSV(p, ',').trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Fixture ID,Fixture Name,Display Name,Position X,Position Y,Position Z,DMX Universe,DMX Channel/);
  assert.equal(lines[2], '2,Generic RGB,"Top, left #2",1,0,0,1,4,3,"Top, left",1,1');
});

test('tab separated CSV', () => {
  const p = Core.buildPatch(project([Core.createElement('strip', { count: 1 })]));
  assert.ok(Core.toCSV(p, '\t').split('\r\n')[0].includes('\tPosition X\t'));
});

test('default project builds without errors', () => {
  const p = Core.buildPatch(Core.defaultProject());
  assert.ok(p.totals.pixels > 0);
  assert.equal(p.warnings.filter((w) => w.level === 'error').length, 0);
});

test('layouts over the pixel limit are skipped, not frozen', () => {
  const p = Core.buildPatch(project([
    Core.createElement('grid', { cols: 10, rows: 10 }),
    Core.createElement('grid', { y: 20, cols: 1000, rows: 1000 }),
  ]));
  assert.equal(p.totals.pixels, 100);
  assert.equal(p.elements[1].count, 0);
  assert.ok(p.warnings.some((w) => w.level === 'error' && /skipped/.test(w.text)));
});

test('warns above the largest MADRIX licence', () => {
  const p = Core.buildPatch(project([Core.createElement('grid', { cols: 600, rows: 600 })]));
  assert.ok(p.warnings.some((w) => /largest MADRIX 5 licence/.test(w.text)));
});

test('rect frame walks the outline clockwise from the start corner', () => {
  const px = Core.generatePixels(Core.createElement('rect', { width: 3, height: 3 }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]]);
  const ccw = Core.generatePixels(Core.createElement('rect', { width: 3, height: 3, startCorner: 'BR', clockwise: false }));
  assert.deepEqual(ccw.slice(0, 3).map((p) => [p.x, p.y]), [[2, 2], [2, 1], [2, 0]]);
});

test('arc covers the sweep including both ends', () => {
  const px = Core.generatePixels(Core.createElement('circle', { cx: 10, cy: 10, radius: 10, count: 3, startAngle: 180, sweep: 180 }));
  assert.deepEqual(px.map((p) => [p.x, p.y]), [[0, 10], [10, 0], [20, 10]]);
});

test('path spreads pixels evenly by spacing', () => {
  const px = Core.generatePixels(Core.createElement('path', { points: [[0, 0], [10, 0], [10, 5]], spacing: 1 }));
  assert.equal(px.length, 16);
  assert.deepEqual([px[15].x, px[15].y], [10, 5]);
  const closed = Core.generatePixels(Core.createElement('path', { points: [[0, 0], [4, 0], [4, 4], [0, 4]], closed: true }));
  assert.equal(closed.length, 16);
});

test('dot text uses the 5x7 font', () => {
  const px = Core.generatePixels(Core.createElement('text', { text: 'I', x: 0, y: 0 }));
  // "I" = top bar 3, stem 5, bottom bar 3
  assert.equal(px.length, 11);
  const unknown = Core.generatePixels(Core.createElement('text', { text: '~' }));
  assert.ok(unknown.length > 0); // falls back to "?"
});

test('line text uses the Hershey single-stroke font', () => {
  const px = Core.generatePixels(Core.createElement('text', { text: 'L', font: 'line', height: 21, spacing: 1 }));
  const xs = px.map((p) => p.x), ys = px.map((p) => p.y);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 21);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 7);
});

test('bitmap mask, invert and order', () => {
  const el = Core.createElement('bitmap', { mask: ['10', '01'] });
  assert.deepEqual(Core.generatePixels(el).map((p) => [p.x, p.y]), [[0, 0], [1, 1]]);
  el.invert = true;
  assert.deepEqual(Core.generatePixels(el).map((p) => [p.x, p.y]), [[1, 0], [0, 1]]);
});

test('rotation keeps pixel count and turns the shape', () => {
  const px = Core.generatePixels(Core.createElement('strip', { x1: 0, y1: 5, x2: 10, y2: 5, count: 11, rotation: 90 }));
  assert.equal(px.length, 11);
  assert.ok(px.every((p) => p.x === 5));
});

test('repeat copies with auto step and new universe per copy', () => {
  const el = Core.createElement('rect', { width: 3, height: 3, repeatX: 3, repeatY: 2 });
  const px = Core.generatePixels(el);
  assert.equal(px.length, 8 * 6);
  assert.equal(Core.pixelCount(el), 48);
  assert.deepEqual([px[8].x, px[8].y], [4, 0]); // width 2 + 2 gap
  el.repeatNewUniverse = true;
  const p = Core.buildPatch(project([el]));
  assert.equal(p.totals.universes, 6);
});

test('points keep file order and their own z', () => {
  const px = Core.generatePixels(Core.createElement('points', { points: [[5, 5, 2], [0, 0]] }));
  assert.deepEqual(px.map((p) => [p.x, p.y, p.z]), [[5, 5, 2], [0, 0, 0]]);
});

test('translateElement moves every shape type', () => {
  for (const type of Object.keys(Core.ELEMENT_DEFAULTS)) {
    const el = Core.createElement(type);
    const before = Core.generatePixels(el);
    Core.translateElement(el, 3, 2);
    const after = Core.generatePixels(el);
    assert.equal(after.length, before.length, type);
    assert.deepEqual([after[0].x - before[0].x, after[0].y - before[0].y], [3, 2], type);
  }
});

test('line text never stacks two pixels on one spot', () => {
  const px = Core.generatePixels(Core.createElement('text', { text: 'LED Neon 2026', font: 'line', height: 14 }));
  assert.equal(new Set(px.map((p) => p.x + ',' + p.y)).size, px.length);
});

test('sharp path corners do not stack pixels', () => {
  const px = Core.generatePixels(Core.createElement('path', { points: [[0, 20], [10, 0], [20, 20]], spacing: 0.7 }));
  assert.equal(new Set(px.map((p) => p.x + ',' + p.y)).size, px.length);
});
