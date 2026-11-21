import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Coordinates in mm. Each box is [x0, y0, z0, x1, y1, z1].
export const interfaceId = 'keyed-40-v1';
const envelope = 40;
const halfEnvelope = envelope / 2;
const holderHalfWidth = 22;
const floor = 3.5;
const rim = 6;
const tongueBottom = 0.25;
const tongueTop = 1;
const standardOverheadClearance = 0.20;
const coreLeft = -19;
const coreRight = 18.4;
const entry = 4;

export function holder(clearance = 0.2, length = envelope, overheadClearance = standardOverheadClearance) {
  const railUnderside = floor + tongueTop + overheadClearance;
  const end = length + 4;
  const pocket = halfEnvelope + clearance;
  return [
    [0, -holderHalfWidth, 0, end, holderHalfWidth, floor],
    [length, -holderHalfWidth, floor, end, holderHalfWidth, rim],
    [entry, -holderHalfWidth, floor, length, -pocket, rim],
    [entry, pocket, floor, length, holderHalfWidth, rim],
    [entry, -pocket, railUnderside, length, coreLeft - clearance, rim],
    [entry, coreRight + clearance, railUnderside, length, pocket, rim],
  ];
}

export function insert(length = envelope, relief = []) {
  return [
    [0, coreLeft, 0, length, coreRight, rim - floor],
    [0, -halfEnvelope, tongueBottom, length, coreLeft, tongueTop],
    [0, coreRight, tongueBottom, length, halfEnvelope, tongueTop],
    ...relief,
  ];
}

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
  { suffix: '0p25-side-0p35-overhead', lateral: 0.25, overhead: 0.35 },
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

const faces = [
  { step: [-1, 0, 0], points: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { step: [1, 0, 0], points: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { step: [0, -1, 0], points: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { step: [0, 1, 0], points: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { step: [0, 0, -1], points: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
  { step: [0, 0, 1], points: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
];

// Split on every box boundary, then emit faces only against empty cells.
// Shared coordinate planes give matching edges and remove all interior faces.
export function mesh(boxes) {
  const axes = [0, 1, 2].map(axis =>
    [...new Set(boxes.flatMap(box => [box[axis], box[axis + 3]]))].sort((a, b) => a - b));
  const solid = new Set();
  for (let x = 0; x < axes[0].length - 1; x++) {
    for (let y = 0; y < axes[1].length - 1; y++) {
      for (let z = 0; z < axes[2].length - 1; z++) {
        const cell = [x, y, z];
        if (boxes.some(box => cell.every((index, axis) =>
          box[axis] <= axes[axis][index] && axes[axis][index + 1] <= box[axis + 3]))) {
          solid.add(cell.join(','));
        }
      }
    }
  }

  const triangles = [];
  for (const key of solid) {
    const cell = key.split(',').map(Number);
    for (const { step, points } of faces) {
      if (solid.has(cell.map((index, axis) => index + step[axis]).join(','))) continue;
      const [a, b, c, d] = points.map(point => point.map((offset, axis) => axes[axis][cell[axis] + offset]));
      triangles.push({ normal: step, vertices: [a, b, c] }, { normal: step, vertices: [a, c, d] });
    }
  }
  return triangles;
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
