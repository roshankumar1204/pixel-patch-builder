const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/importers.js');

test('points CSV with header, sorted by index', () => {
  const r = I.parsePointsCSV('led,x,y,z\n2,5,5,1\n0,0,0,0\n1,1,2,0\n');
  assert.deepEqual(r.points, [[0, 0, 0], [1, 2, 0], [5, 5, 1]]);
  assert.equal(r.hasZ, true);
});

test('points CSV without header, semicolons and tabs', () => {
  assert.deepEqual(I.parsePointsCSV('10;20\n30;40').points, [[10, 20], [30, 40]]);
  assert.deepEqual(I.parsePointsCSV('0\t1\t2\t3\n1\t4\t5\t6').points, [[1, 2, 3], [4, 5, 6]]);
});

test('fitPoints scales to width and moves to origin', () => {
  const p = I.fitPoints([[100, 100], [200, 150]], 10, 2, 3);
  assert.deepEqual(p, [[2, 3], [12, 8]]);
});

test('parseTransform handles translate, scale, rotate', () => {
  const m = I.parseTransform('translate(10,5) scale(2)');
  assert.deepEqual(m, [2, 0, 0, 2, 10, 5]);
  const r = I.parseTransform('rotate(90)');
  assert.ok(Math.abs(r[1] - 1) < 1e-9 && Math.abs(r[2] + 1) < 1e-9);
});

test('basic SVG shapes become path data', () => {
  const attrs = (o) => (k) => o[k];
  assert.equal(I.shapeToPathD('line', attrs({ x1: 0, y1: 0, x2: 5, y2: 0 })), 'M0,0 L5,0');
  assert.match(I.shapeToPathD('rect', attrs({ x: 0, y: 0, width: 4, height: 2 })), /Z$/);
  assert.equal(I.shapeToPathD('rect', attrs({ width: 0, height: 2 })), '');
  assert.match(I.shapeToPathD('polygon', attrs({ points: '0,0 4,0 4,4' })), /^M0,0 L4,0 L4,4 Z$/);
});

test('SVG shapes are scaled to the target width and split at move-to', () => {
  const shapes = [
    { tag: 'path', attr: (k) => ({ d: 'M0,0 L100,0 M0,50 L100,50' })[k] },
    { tag: 'circle', attr: (k) => ({ cx: 50, cy: 25, r: 10 })[k] },
  ];
  const paths = I.svgShapesToPaths(shapes, 40, 0, 0);
  assert.equal(paths.length, 3);
  const xs = paths.flatMap((p) => p.points.map((q) => q[0]));
  assert.ok(Math.abs(Math.max(...xs) - 40) < 0.01);
  assert.equal(paths[2].closed, true);
  assert.equal(paths[0].points.length, 2); // straight line simplified to its ends
});

test('image mask: transparent logos use alpha, others use darkness', () => {
  const rgba = (px) => new Uint8ClampedArray(px.flat());
  const alpha = I.maskFromRGBA(rgba([[0, 0, 0, 0], [0, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 255]]), 2, 2);
  assert.deepEqual(alpha.mask, ['01', '01']);
  const dark = I.maskFromRGBA(rgba([[255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255]]), 2, 2);
  assert.deepEqual(dark.mask, ['01', '00']);
});
