const assert = require('node:assert/strict');
const test = require('node:test');
const Clipper = require('clipper-lib');
const createPolygonGeometry = require('../polygon-geometry');

const { CS, xyPath, region, rings, offsetArtwork } = createPolygonGeometry(Clipper);

function square(min, max, hole = false) {
  const corners = [
    { x: min, y: min }, { x: max, y: min },
    { x: max, y: max }, { x: min, y: max },
  ];
  return xyPath(hole ? corners.reverse() : corners);
}

const artwork = [square(0, 32), square(4, 28, true), square(8, 24), square(12, 20, true)];

for (const offset of [-0.5, 0.5]) {
  test(`${offset} mm preserves the four nested boundaries and moves their edges`, () => {
    const original = structuredClone(artwork);
    const tree = region(Clipper.ClipType.ctUnion, offsetArtwork(artwork, offset).artworkPaths);
    assert.deepEqual(rings(tree).map(({ path, hole }) => ({
      hole,
      minX: Math.min(...path.map(point => point.X)) / CS,
      maxX: Math.max(...path.map(point => point.X)) / CS,
    })), [
      { hole: false, minX: -offset, maxX: 32 + offset },
      { hole: true, minX: 4 + offset, maxX: 28 - offset },
      { hole: false, minX: 8 - offset, maxX: 24 + offset },
      { hole: true, minX: 12 + offset, maxX: 20 - offset },
    ]);
    assert.deepEqual(artwork, original);
  });
}

test('zero offset returns the original paths', () => {
  assert.equal(offsetArtwork(artwork, 0).artworkPaths, artwork);
});

test('erosion that removes all artwork reports a generation error', () => {
  assert.throws(() => offsetArtwork([square(0, 0.6)], -0.5), /removed all artwork/);
});
