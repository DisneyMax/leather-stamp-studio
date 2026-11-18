const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.join(__dirname, '..');
const artwork = (content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${content}</svg>`;
const compound = artwork('<path fill-rule="evenodd" d="M0 0H32V32H0Z M4 4H28V28H4Z M8 8H24V24H8Z M12 12H20V20H12Z"/>');

test.beforeEach(async ({ page }) => {
  // Exercise the production HTML and its pinned libraries without live CDN requests.
  await page.route('http://studio.test/', route => route.fulfill({ path: path.join(root, 'index.html') }));
  await page.route('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js', route =>
    route.fulfill({ path: require.resolve('clipper-lib') }));
  await page.route('https://esm.sh/three@0.180.0**', route => {
    const url = new URL(route.request().url());
    const addon = url.pathname.replace('/three@0.180.0/examples/jsm/', '');
    return route.fulfill({
      path: path.join(root, 'node_modules/three', addon === url.pathname ? 'build/three.module.js' : `examples/jsm/${addon}`),
      contentType: 'text/javascript',
    });
  });
  await page.route('https://esm.sh/three.core.js', route =>
    route.fulfill({ path: path.join(root, 'node_modules/three/build/three.core.js'), contentType: 'text/javascript' }));
  await page.goto('http://studio.test/');
  await expect(page.locator('#viewport canvas')).toBeVisible();
});

async function load(page, svg, settings) {
  const payload = settings ? {
    name: 'project.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'LeatherStampStudio', version: 2, svg, settings })),
  } : { name: 'art.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
  await page.locator(settings ? '#projectFile' : '#file').setInputFiles(payload);
  await expect(page.locator('#readyState')).toContainText(settings ? 'Project loaded' : 'Artwork loaded');
}

async function generate(page) {
  await page.getByRole('button', { name: 'Generate 3D stamp' }).click();
  await expect(page.locator('#readyState')).toHaveText(/Mesh validated|Mesh invalid|Generation failed/);
  expect(await page.locator('#status').textContent()).toContain('Basic manifold checks passed. Export enabled.');
}

async function download(page, selector) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  return readFile(await file.path());
}

function parseSTL(buffer) {
  const count = buffer.readUInt32LE(80);
  expect(buffer.length).toBe(84 + 50 * count);
  expect(count).toBeGreaterThan(0);
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: 3 }, (_, vertex) =>
      Array.from({ length: 3 }, (_, axis) => buffer.readFloatLE(96 + 50 * i + 12 * vertex + 4 * axis))));
}

function expectClosedMesh(triangles) {
  const edges = new Map();
  for (const triangle of triangles) {
    const keys = triangle.map(point => point.map(value => Math.round(value * 10000)).join(','));
    for (let i = 0; i < 3; i++) {
      const a = keys[i], b = keys[(i + 1) % 3];
      const key = [a, b].sort().join('|');
      const entry = edges.get(key) || [0, 0];
      entry[a < b ? 0 : 1]++;
      edges.set(key, entry);
    }
  }
  expect([...edges.values()].filter(([forward, reverse]) => forward !== 1 || reverse !== 1)).toEqual([]);
}

function surfaceHeight(triangles, x, y) {
  let top = -Infinity;
  for (const [a, b, c] of triangles) {
    const cross = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (a[2] !== b[2] || b[2] !== c[2]) continue;
    const signs = [cross(a, b), cross(b, c), cross(c, a)];
    if (signs.every(sign => sign >= 0) || signs.every(sign => sign <= 0)) top = Math.max(top, a[2]);
  }
  return top;
}

for (const mode of ['raised', 'recessed']) {
  for (const mirror of [false, true]) {
    for (const offset of [-0.5, 0, 0.5]) {
      test(`${mode}, mirror=${mirror}, offset=${offset} preserves compound topology`, async ({ page }) => {
        await load(page, compound, { mode, mirror, edge: 'sharp', designOffset: offset });
        await generate(page);
        const triangles = parseSTL(await download(page, '#export'));
        const filled = mode === 'raised' ? 7.5 : 4.5;
        const empty = 6;
        // Rings alternate between filled and empty. Probe both sides of each
        // original boundary at y=1, away from corners and triangulation seams.
        for (const [boundary, left, right, direction] of [
          [4, empty, filled, -1], [8, filled, empty, 1],
          [12, empty, filled, -1], [16, filled, empty, 1],
        ]) {
          expect(surfaceHeight(triangles, boundary + direction * offset - 0.13, 1)).toBe(left);
          expect(surfaceHeight(triangles, boundary + direction * offset + 0.13, 1)).toBe(right);
        }
        expectClosedMesh(triangles);
      });
    }
  }
}

test('advanced controls follow the selected mode, base shape and sizing', async ({ page }) => {
  const advanced = page.locator('#advancedSettings');
  await expect(advanced).toHaveJSProperty('open', false);
  await expect(page.locator('#exactSizeFields')).toBeHidden();
  await page.locator('#customArt').check();
  await expect(page.locator('#artWidth')).toBeEnabled();
  await expect(page.locator('#artHeight')).toBeVisible();
  await page.locator('#fitArt').check();
  await expect(page.locator('#exactSizeFields')).toBeHidden();
  await advanced.locator('summary').first().click();
  await expect(page.locator('#cornerField')).toBeHidden();
  await page.locator('#baseShape').selectOption('roundrect');
  await expect(page.locator('#cornerField')).toBeVisible();
  await page.locator('#edge').selectOption('round');
  await expect(page.locator('#bevelField')).toBeVisible();
  await page.locator('#mode').selectOption('recessed');
  await expect(page.locator('#edge')).toBeDisabled();
  await expect(page.locator('#edgeHelp')).toContainText('sharp cavity walls');
  await expect(page.locator('#bevelField')).toBeHidden();
  await page.locator('#mode').selectOption('raised');
  await expect(page.locator('#edge')).toHaveValue('round');
  await expect(page.locator('#bevelField')).toBeVisible();
  await page.locator('#designOffset').fill('0.35');
  await expect(page.locator('#designOffsetSlider')).toHaveValue('0.35');
  await page.locator('#designOffsetSlider').press('ArrowLeft');
  await expect(page.locator('#designOffset')).toHaveValue('0.30');
  await page.locator('#resetDefaults').click();
  await expect(page.locator('#designOffsetSlider')).toHaveValue('0');
  await expect(page.locator('#designOffset')).toHaveValue('0');
  await expect(page.locator('#edge')).toHaveValue('chamfer');
  await expect(page.locator('#cornerField')).toBeHidden();
});

test('V3.1 project round-trip and V3.0 project missing the adjustment', async ({ page }) => {
  await load(page, compound, { designOffset: -0.37, edge: 'sharp', artSizing: 'custom', artWidth: 25, artHeight: 24 });
  await expect(page.locator('#designOffsetSlider')).toHaveValue('-0.35');
  await expect(page.locator('#artWidth')).toHaveValue('25');
  await page.locator('#projectSettings summary').click();
  const saved = JSON.parse(await download(page, '#save'));
  expect(saved).toMatchObject({
    format: 'LeatherStampStudio', version: 2, svg: compound,
    settings: { designOffset: '-0.37', edge: 'sharp', artSizing: 'custom', artWidth: '25', artHeight: '24' },
  });
  await page.locator('#designOffset').fill('0.5');
  await load(page, saved.svg, saved.settings);
  await expect(page.locator('#designOffset')).toHaveValue('-0.37');
  delete saved.settings.designOffset;
  await load(page, saved.svg, saved.settings);
  await expect(page.locator('#designOffset')).toHaveValue('0');
  await expect(page.locator('#designOffsetSlider')).toHaveValue('0');
  await expect(page.locator('#artWidth')).toHaveValue('25');
  await generate(page);
});

test('input edits and failed builds block a previously valid STL', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H32V0.6H0Z"/>'), { edge: 'sharp' });
  await generate(page);
  await page.locator('#designOffset').fill('-0.6');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('from -0.50 to +0.50 mm');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#designOffset').fill('-0.5');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('removed all artwork');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#designOffset').fill('0');
  await generate(page);
});

test('offsets can close a small hole or remove a narrow island', async ({ page }) => {
  const detailed = artwork(
    '<path fill-rule="evenodd" d="M0 0H32V32H0Z M15.5 15.5H16.3V16.3H15.5Z M15.7 15.7H16V16Z"/>',
  );
  await load(page, detailed, { edge: 'sharp', mirror: false, designOffset: 0.5 });
  await generate(page);
  const thick = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thick, 0.2, 0.2)).toBe(7.5);
  expectClosedMesh(thick);
  await page.locator('#designOffset').fill('-0.5');
  await generate(page);
  const thin = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thin, -0.15, 0.15)).toBe(6);
  expect(surfaceHeight(thin, 2, 2)).toBe(7.5);
  expectClosedMesh(thin);
});

for (const edge of ['chamfer', 'round']) {
  test(`${edge} retains a shaped edge with a thickness adjustment`, async ({ page }) => {
    await load(page, compound, { edge, designOffset: 0.25 });
    await generate(page);
    const triangles = parseSTL(await download(page, '#export'));
    expectClosedMesh(triangles);
    const reliefLevels = new Set(triangles.flat().map(vertex => vertex[2]).filter(z => z > 6));
    expect(reliefLevels.size).toBeGreaterThan(edge === 'round' ? 7 : 5);
  });
}

test('recommended settings generate the included paw print', async ({ page }) => {
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
});

test('a zero-width chamfer is blocked instead of exporting a sharp stamp', async ({ page }) => {
  await load(page, compound, { edge: 'chamfer', bevel: 0 });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Enter a positive edge size or select Sharp');
  await expect(page.locator('#export')).toBeDisabled();
});

test('fit-to-base leaves clearance inside an ellipse', async ({ page }) => {
  await load(page, compound, { edge: 'sharp', baseShape: 'circle', height: 30, designOffset: 0.5 });
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
  await page.locator('#customArt').check();
  await generate(page);
});

test('a positive offset that exceeds a rounded base blocks export', async ({ page }) => {
  const square = artwork('<path d="M0 0H32V32H0Z"/>');
  await load(page, square, { edge: 'sharp', baseShape: 'roundrect', width: 10, height: 10, corner: 5, margin: 1.5 });
  await generate(page);
  await page.locator('#designOffset').fill('0.5');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Thickened artwork exceeds the base');
  await expect(page.locator('#export')).toBeDisabled();
});

test('nonzero fill rules and mirroring preserve off-center islands and counters', async ({ page }) => {
  const nonzero = artwork('<path d="M0 0H32V32H0Z M2 2V26H20V2Z M5 5H14V16H5Z"/>');
  await load(page, nonzero, { edge: 'sharp', mirror: true, designOffset: 0.5 });
  await generate(page);
  const thick = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thick, 6, 6)).toBe(7.5);
  expect(surfaceHeight(thick, -6, -2)).toBe(7.5);
  expect(surfaceHeight(thick, 5, -2)).toBe(6);
  expectClosedMesh(thick);
  await page.locator('#designOffset').fill('-0.5');
  await generate(page);
  const thin = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thin, 6, 6)).toBe(7.5);
  expect(surfaceHeight(thin, 5, -2)).toBe(6);
  expectClosedMesh(thin);
});
