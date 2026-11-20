import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fitClearances, holder, insert, mesh, parts, stl, translate } from './generate.mjs';

function collides(a, b) {
  return [0, 1, 2].every(axis =>
    Math.min(a[axis + 3], b[axis + 3]) - Math.max(a[axis], b[axis]) > 1e-8);
}

function bounds(boxes) {
  return [
    ...[0, 1, 2].map(axis => Math.min(...boxes.map(box => box[axis]))),
    ...[3, 4, 5].map(axis => Math.max(...boxes.map(box => box[axis]))),
  ];
}

for (const [name, boxes] of parts()) {
  test(name + ' exports one closed, outward-facing solid', () => {
    const binary = stl(mesh(boxes));
    assert.ok(binary.equals(readFileSync(new URL('samples/' + name, import.meta.url))), 'Sample matches generator');
    const count = binary.readUInt32LE(80);
    assert.equal(binary.length, 84 + count * 50);
    const edges = new Map();
    const neighbors = Array.from({ length: count }, () => []);
    let volume = 0;
    const vertices = [];
    for (let index = 0; index < count; index++) {
      const start = 84 + index * 50;
      const vector = offset => [0, 4, 8].map(axis => binary.readFloatLE(start + offset + axis));
      const [a, b, c] = [12, 24, 36].map(vector);
      const normal = vector(0);
      vertices.push(a, b, c);
      const [ux, uy, uz] = b.map((value, axis) => value - a[axis]);
      const [vx, vy, vz] = c.map((value, axis) => value - a[axis]);
      const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      assert.ok(cross.reduce((dot, value, axis) => dot + value * normal[axis], 0) > 0);
      volume += a.reduce((dot, value, axis) => dot + value * cross[axis], 0) / 6;
      for (const [from, to] of [[a, b], [b, c], [c, a]]) {
        const ends = [from.join(','), to.join(',')];
        const key = [...ends].sort().join('|');
        const adjoining = edges.get(key) ?? [];
        adjoining.push({ index, first: ends[0] });
        edges.set(key, adjoining);
      }
    }
    assert.ok(volume > 0);
    for (const adjoining of edges.values()) {
      assert.equal(adjoining.length, 2);
      const [a, b] = adjoining;
      assert.notEqual(a.first, b.first);
      neighbors[a.index].push(b.index);
      neighbors[b.index].push(a.index);
    }
    const visited = new Set([0]);
    for (const index of visited) for (const neighbor of neighbors[index]) visited.add(neighbor);
    assert.equal(visited.size, count);
    const expected = bounds(boxes);
    for (const axis of [0, 1, 2]) {
      const values = vertices.map(vertex => vertex[axis]);
      assert.ok(Math.abs(Math.min(...values) - expected[axis]) < 0.00001);
      assert.ok(Math.abs(Math.max(...values) - expected[axis + 3]) < 0.00001);
    }
    assert.equal(expected[2], 0);
  });
}

for (const clearance of fitClearances) {
  test(`coupon clearance ${clearance} mm per side and keyed orientation`, () => {
    const length = 10;
    const receiver = holder(clearance, length);
    const key = insert(length);
    const [, , leftWall, rightWall] = receiver;
    assert.ok(Math.abs(key[1][1] - leftWall[4] - clearance) < 1e-8);
    assert.ok(Math.abs(rightWall[1] - key[2][4] - clearance) < 1e-8);
    const seated = key.map(box => translate(box, [0, 0, 3.5]));
    assert.ok(seated.every(box => !receiver.some(wall => collides(box, wall))));
    const backwards = seated.map(([x0, y0, z0, x1, y1, z1]) =>
      [length - x1, -y1, z0, length - x0, -y0, z1]);
    assert.ok(backwards.some(box => receiver.some(wall => collides(box, wall))));
  });
}

test('both prints slide along +X, seat on the continuous floor, and clear the holder rim', () => {
  const printed = [...parts().values()];
  const [receiver, ...inserts] = printed.slice(0, 3);
  const [floor, stop] = receiver;
  assert.deepEqual(bounds(receiver), [0, -22, 0, 44, 22, 6]);
  for (const component of inserts) {
    assert.deepEqual(bounds(component), [0, -20, 0, 40, 20, 4]);
    const [backing, ...detail] = component.map(box => translate(box, [0, 0, floor[5]]));
    for (const box of [backing, ...detail]) {
      // Union of every translated position from fully outside to seated.
      const swept = [box[0] - 40, ...box.slice(1)];
      assert.ok(receiver.every(wall => !collides(swept, wall)));
    }
    assert.equal(backing[2], floor[5]);
    assert.equal(backing[3], stop[0]);
    assert.ok(collides(translate(backing, [0.01, 0, 0]), stop));
    assert.ok(floor[0] <= backing[0] && floor[3] >= backing[3]);
    assert.ok(floor[1] <= backing[1] && floor[4] >= backing[4]);
    for (const relief of detail.slice(2)) {
      assert.equal(relief[2], 6);
      assert.equal(relief[5] - bounds(receiver)[5], 1.5);
    }
  }
});
