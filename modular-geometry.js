(function (root) {
'use strict';

// Coordinates in mm. Each box is [x0, y0, z0, x1, y1, z1].
const interfaceId = 'keyed-40-v1';
const envelope = 40;
const rearStop = 4;
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

function holder(clearance = 0.2, length = envelope, overheadClearance = standardOverheadClearance) {
  const railUnderside = floor + tongueTop + overheadClearance;
  const end = length + rearStop;
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

function insert(length = envelope, relief = [], wingRelief = 0) {
  return [
    [0, coreLeft, 0, length, coreRight, rim - floor],
    [0, -halfEnvelope + wingRelief, tongueBottom, length, coreLeft, tongueTop],
    [0, coreRight, tongueBottom, length, halfEnvelope - wingRelief, tongueTop],
    ...relief,
  ];
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
function mesh(boxes) {
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

const holderCenterX = (envelope + rearStop) / 2;
// Extra lateral clearance on the outer wing faces of app-generated inserts.
const insertBacking = insert(envelope, [], 0.05).map(([x0, y0, z0, x1, y1, z1]) =>
  [x0 - holderCenterX, y0, z0, x1 - holderCenterX, y1, z1]);
// Raise the working face above the holder rim while preserving the tested keys.
const embossingFaceHeight = rim - floor + 1.5;
const minimumCavityFloor = 1.5;
const maxEmbossingDepth = embossingFaceHeight - minimumCavityFloor;
const [insertCore, ...insertWings] = insertBacking;
const embossingBacking = [[...insertCore.slice(0, 5), embossingFaceHeight], ...insertWings];
const testedFit = { lateral: 0.25, overhead: 0.35 };
// Keep relief and borders off the backing seam even at zero border gap.
const faceClearance = 0.5;
const artworkSize = [
  2 * (envelope - holderCenterX - faceClearance),
  2 * (Math.min(-coreLeft, coreRight) - faceClearance),
];
const geometry = { interfaceId, envelope, floor, rim, holderCenterX, insertBacking, embossingBacking, embossingFaceHeight, maxEmbossingDepth, artworkSize, testedFit, holder, insert, mesh };
if (typeof module === 'object') module.exports = geometry;
else root.ModularStampGeometry = geometry;
})(globalThis);
