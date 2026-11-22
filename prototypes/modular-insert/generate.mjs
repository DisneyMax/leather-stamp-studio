import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import geometry from '../../modular-geometry.js';
const { interfaceId, envelope, floor, rim, holder, insert, mesh, testedFit } = geometry;
export { interfaceId, holder, insert, mesh };

const reliefTop = 4;
const face = rim - floor;
const ring = [
  [10, -10, face, 30, -7, reliefTop], [10, 7, face, 30, 10, reliefTop],
  [10, -7, face, 13, 7, reliefTop], [27, -7, face, 30, 7, reliefTop],
];
const letter = [
  [12, -9, face, 16, 9, reliefTop], [16, -9, face, 26, -5, reliefTop],
  [16, -1, face, 23, 2, reliefTop],
];

export const fitClearances = [0.15, 0.20, 0.25];
export function translate([x0, y0, z0, x1, y1, z1], [x, y, z]) {
  return [x0 + x, y0 + y, z0 + z, x1 + x, y1 + y, z1 + z];
}

export const comparisonHolders = [
  { suffix: '0p25', lateral: 0.25, overhead: 0.20 },
  { suffix: '0p35-side', lateral: 0.35, overhead: 0.20 },
  { suffix: '0p25-side-0p35-overhead', ...testedFit },
];

export function parts() {
  const couponLength = 10;
  // Join three receivers along their floors. Viewed from the open edge at X=0,
  // use the marked axis in the README to identify the clearance order.
  const coupon = fitClearances.flatMap((clearance, index) =>
    holder(clearance, couponLength).map(box => translate(box, [0, index * 44, 0])));
  return new Map([
    [`holder-${interfaceId}-0p20.stl`, holder()],
    [`insert-ring-${interfaceId}.stl`, insert(envelope, ring)],
    [`insert-asymmetric-${interfaceId}.stl`, insert(envelope, letter)],
    [`fit-coupon-${interfaceId}.stl`, coupon],
    [`fit-slider-${interfaceId}.stl`, insert(couponLength)],
    ...comparisonHolders.map(({ suffix, lateral, overhead }) =>
      [`holder-${interfaceId}-${suffix}.stl`, holder(lateral, envelope, overhead)]),
  ]);
}

export function stl(triangles) {
  const data = Buffer.alloc(84 + 50 * triangles.length);
  data.write(`Leather Stamp Studio experimental ${interfaceId}`);
  data.writeUInt32LE(triangles.length, 80);
  triangles.forEach(({ normal, vertices }, index) => {
    [...normal, ...vertices.flat()].forEach((value, component) =>
      data.writeFloatLE(value, 84 + index * 50 + component * 4));
  });
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage: node prototypes/modular-insert/generate.mjs OUTPUT_DIRECTORY');
  await mkdir(destination, { recursive: true });
  for (const [name, boxes] of parts()) {
    await writeFile(resolve(destination, name), stl(mesh(boxes)));
    console.log(name);
  }
}
