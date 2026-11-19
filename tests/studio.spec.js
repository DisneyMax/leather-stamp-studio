const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.join(__dirname, '..');
const artwork = (content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${content}</svg>`;
const compound = artwork('<path fill-rule="evenodd" d="M0 0H32V32H0Z M4 4H28V28H4Z M8 8H24V24H8Z M12 12H20V20H12Z"/>');

test.beforeEach(async ({ page }) => {
  // Exercise the production HTML and its pinned libraries without live CDN requests.
  await page.route('http://studio.test/', route => route.fulfill({ path: path.join(root, 'index.html') }));
  await page.route('http://studio.test/polygon-geometry.js', route =>
    route.fulfill({ path: path.join(root, 'polygon-geometry.js'), contentType: 'text/javascript' }));
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
  await expect(page.locator('#artPlacement > summary')).toBeHidden();
  await expect(page.locator('#designOffset')).toBeHidden();
  await expect(page.locator('#exactSizeFields')).toBeHidden();
  await page.locator('#customArt').check();
  await expect(page.locator('#artWidth')).toBeEnabled();
  await expect(page.locator('#artHeight')).toBeVisible();
  await page.locator('#fitArt').check();
  await expect(page.locator('#exactSizeFields')).toBeHidden();
  await advanced.locator('summary').first().click();
  await expect(advanced.locator('#designOffset')).toBeVisible();
  await expect(advanced.locator('#designOffsetSlider')).toBeVisible();
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
  await page.locator('#advancedSettings > summary').click();
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
  await page.locator('#advancedSettings > summary').click();
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
  await page.getByRole('button', { name: '2D design' }).click();
  const note = page.locator('#printabilityNote');
  await expect(note).toContainText('1 fewer hole and 1 fewer filled region');
  const toggle = page.getByRole('checkbox', { name: 'Show thickness changes' });
  const added = page.locator('#changeAdded');
  const removed = page.locator('#changeRemoved');
  const covers = (path, x, y) => path.evaluate((element, point) =>
    element.isPointInFill(new DOMPoint(...point)), [x, y]);
  await expect(added).toHaveAttribute('d', '');
  await toggle.check();
  await expect(added).toHaveAttribute('d', /^M/);
  expect(await covers(added, 0.2, 0.2)).toBe(true);
  expect(await covers(added, 2, 2)).toBe(false);
  await expect(removed).toHaveAttribute('d', '');
  await generate(page);
  await expect(note).toContainText('1 fewer hole');
  await expect(page.locator('#export')).toBeEnabled();
  const thick = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thick, 0.2, 0.2)).toBe(7.5);
  expectClosedMesh(thick);
  await page.locator('#advancedSettings > summary').click();
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#designOffset').fill('-0.5');
  await expect(removed).toHaveAttribute('d', /^M/);
  expect(await covers(removed, -0.15, -0.15)).toBe(true);
  expect(await covers(removed, 2, 2)).toBe(false);
  await expect(added).toHaveAttribute('d', '');
  await generate(page);
  await expect(note).toContainText('1 fewer filled region');
  await expect(note).not.toContainText('fewer hole');
  const thin = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thin, -0.15, 0.15)).toBe(6);
  expect(surfaceHeight(thin, 2, 2)).toBe(7.5);
  expectClosedMesh(thin);
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#designOffset').fill('0');
  await expect(note).toBeHidden();
  await expect(page.locator('#noChanges')).toBeVisible();
  await expect(added).toHaveAttribute('d', '');
  await expect(removed).toHaveAttribute('d', '');
  await toggle.uncheck();
  await expect(page.locator('#noChanges')).toBeHidden();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
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
  const guide = page.locator('#firstStampGuide');
  await expect(guide.locator('ol')).toBeHidden();
  await page.getByText('First stamp guide', { exact: true }).click();
  await expect(guide.locator('ol')).toBeVisible();
  await expect(guide).toContainText('Bambu Studio');
  await page.getByRole('button', { name: 'Use example paw print' }).click();
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
  await page.locator('#advancedSettings > summary').click();
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
  await page.locator('#advancedSettings > summary').click();
  await page.locator('#designOffset').fill('-0.5');
  await generate(page);
  const thin = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(thin, 6, 6)).toBe(7.5);
  expect(surfaceHeight(thin, 5, -2)).toBe(6);
  expectClosedMesh(thin);
});

test('live 2D design matches exported footprints for mirrored artwork with holes and an island', async ({ page }) => {
  const asymmetric = artwork('<path fill-rule="evenodd" d="M0 0H32V32H0Z M2 2H20V26H2Z M5 5H14V16H5Z"/>');
  await load(page, asymmetric, { edge: 'sharp', mirror: false, designOffset: 0 });
  await page.getByRole('button', { name: '2D design' }).click();
  const outline = page.locator('#designArt');
  await expect(outline).toHaveAttribute('d', /^M/);
  await expect(page.locator('#designPlate')).toHaveAttribute('d', /^M/);
  await expect(page.locator('#export')).toBeDisabled();
  const unmirrored = await outline.getAttribute('d');
  await page.locator('#mirror').check();
  await expect(outline).not.toHaveAttribute('d', unmirrored);
  await page.locator('#advancedSettings > summary').click();

  const points = [];
  for (let x = -16.35; x <= 16.35; x += 0.3) {
    for (const y of [-9.2, -2.3, 4.1, 15.9]) points.push([x, y]);
  }
  for (const offset of [-0.5, 0.5]) {
    const previous = await outline.getAttribute('d');
    await page.locator('#designOffset').fill(String(offset));
    await expect(outline).not.toHaveAttribute('d', previous);
    await expect(page.locator('#export')).toBeDisabled();
    const filled = await outline.evaluate((path, samples) =>
      samples.map(([x, y]) => path.isPointInFill(new DOMPoint(x, -y))), points);
    expect(filled).toContain(true);
    expect(filled).toContain(false);

    await generate(page);
    await expect(page.getByRole('button', { name: '2D design' })).toBeVisible();
    const triangles = parseSTL(await download(page, '#export'));
    const mismatches = points.filter(([x, y], i) => (surfaceHeight(triangles, x, y) === 7.5) !== filled[i]);
    expect(mismatches).toEqual([]);
    await page.getByRole('button', { name: '2D design' }).click();
    await expect(outline).toHaveAttribute('d', /^M/);
  }
});

test('invalid 2D inputs clear stale contours and recover without generating a mesh', async ({ page }) => {
  await page.getByRole('button', { name: '2D design' }).click();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
  await page.locator('#advancedSettings > summary').click();
  await page.locator('#designOffset').fill('0.6');
  await expect(page.locator('#designStatus')).toContainText('from -0.50 to +0.50 mm');
  await expect(page.locator('#designArt')).not.toHaveAttribute('d', /.+/);
  await page.locator('#designOffset').fill('0.3');
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
  await expect(page.locator('#export')).toBeDisabled();
});

test('Exact size keeps the 2D preview visible while editing dimensions', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H40V32.001H0Z"/>'), { edge: 'sharp', height: 33.6008 });
  await page.getByRole('button', { name: '2D design' }).click();
  const design = page.locator('#designArt');
  await expect(design).toHaveAttribute('d', /^M/);

  await page.locator('#customArt').check();
  await expect(page.locator('#designStatus')).toContainText('Raised artwork');
  await expect(design).toHaveAttribute('d', /^M/);
  await page.locator('#artWidth').fill('32');
  await expect(page.locator('#artHeight')).toHaveValue('25.600');

  await page.locator('#artWidth').fill('');
  await expect(page.locator('#designStatus')).toContainText('Showing the last valid design');
  await expect(design).toHaveAttribute('d', /^M/);
  await expect(page.locator('#export')).toBeDisabled();

  const previous = await design.getAttribute('d');
  await page.locator('#artWidth').fill('24');
  await expect(page.locator('#designStatus')).toContainText('Raised artwork');
  await expect(design).not.toHaveAttribute('d', previous);
  expect(await design.evaluate(path => path.getBBox().width)).toBeCloseTo(24, 3);
  await generate(page);
});

test('Exact size grows the base to preserve the artwork margin and exports the larger plate', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H1165V1000H0Z"/>'), { edge: 'sharp', margin: 6 });
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#customArt').check();
  await page.locator('#artHeight').fill('30');
  await expect(page.locator('#artWidth')).toHaveValue('34.950');
  await expect(page.locator('#width')).toHaveValue('47');
  await expect(page.locator('#height')).toHaveValue('42');
  await expect(page.locator('#sizeSummary')).toContainText('Artwork 34.95 × 30.00 mm');
  await expect(page.locator('#designStatus')).toContainText('Raised artwork');
  await generate(page);
  const vertices = parseSTL(await download(page, '#export')).flat();
  expect(Math.max(...vertices.map(([x]) => x)) - Math.min(...vertices.map(([x]) => x))).toBe(47);
  expect(Math.max(...vertices.map(([, y]) => y)) - Math.min(...vertices.map(([, y]) => y))).toBe(42);
  await page.locator('#lockAspect').uncheck();
  await page.locator('#artWidth').fill('40');
  await expect(page.locator('#width')).toHaveValue('52');
  await expect(page.locator('#height')).toHaveValue('42');
  await page.locator('#artWidth').fill('20');
  await expect(page.locator('#width')).toHaveValue('52');
  await page.locator('#artWidth').fill('200');
  await expect(page.locator('#width')).toHaveValue('52');
  await expect(page.locator('#export')).toBeDisabled();
});

test('ellipse bases grow enough to preserve clearance at artwork corners', async ({ page }) => {
  await load(page, compound, { edge: 'sharp', baseShape: 'circle' });
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#customArt').check();
  await page.locator('#artWidth').fill('34');
  await expect(page.locator('#width')).toHaveValue('57');
  await expect(page.locator('#height')).toHaveValue('57');
  await expect(page.locator('#designStatus')).toContainText('Raised artwork');
  await generate(page);
});

test.describe('desktop preview layout on a high-density screen', () => {
  test.use({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });

  test('fits the page while keeping the settings scrollable', async ({ page }) => {
    const viewport = page.locator('#viewport');
    const canvas = viewport.locator('canvas');
    const expectPageFits = async () => {
      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow).toEqual({ horizontal: 0, vertical: 0 });
    };

    const bounds = await viewport.boundingBox();
    expect(await canvas.boundingBox()).toEqual(bounds);
    await expect(canvas).toHaveAttribute('width', String(Math.floor(bounds.width * 2)));
    await expectPageFits();

    const sidebar = page.locator('aside');
    await page.locator('#advancedSettings > summary').click();
    await page.locator('#resetDefaults').scrollIntoViewIfNeeded();
    expect(await sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expectPageFits();

    await page.getByRole('button', { name: '2D design' }).click();
    await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
    await expectPageFits();
    await page.getByRole('button', { name: '3D preview' }).click();
    await page.setViewportSize({ width: 1024, height: 600 });
    await expect.poll(async () => (await canvas.boundingBox()).width).toBe(674);
    await expect(canvas).toHaveAttribute('width', '1348');
    await expectPageFits();
  });
});

test('narrow screens can scroll down to the preview without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  const root = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(root.scrollWidth).toBe(390);
  expect(root.scrollHeight).toBeGreaterThan(650);
  await page.getByRole('button', { name: '2D design' }).click();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
});

test('numeric artwork placement updates the 2D view, STL, and saved project', async ({ page }) => {
  const svg = artwork('<path d="M0 0H12V2H4V6H0Z"/>');
  await load(page, svg, { edge: 'sharp', artSizing: 'custom', artWidth: 12, artHeight: 6, mirror: false });
  await expect(page.locator('#mode option')).toHaveText(['Debossing (raised stamp)', 'Embossing (recessed die)']);
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#advancedSettings > summary').click();
  await page.locator('#advancedSettings #artPlacement > summary').click();
  const design = page.locator('#designArt');
  await expect(design).toHaveAttribute('d', /^M/);
  const original = await design.getAttribute('d');

  await page.locator('#artRotation').fill('90');
  await page.locator('#artX').fill('5');
  await page.locator('#artY').fill('3');
  await expect(design).not.toHaveAttribute('d', original);
  await expect.poll(() => design.evaluate(path => {
    const { x, y, width, height } = path.getBBox();
    return [x, y, width, height];
  })).toEqual([2, -9, 6, 12]);
  const positioned = await design.getAttribute('d');
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 7, 7)).toBe(7.5);
  expect(surfaceHeight(triangles, 3, -1)).toBe(6);

  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#projectSettings > summary').click();
  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.settings).toMatchObject({ artX: '5', artY: '3', artRotation: '90' });
  await page.getByRole('button', { name: 'Center artwork' }).click();
  await expect(page.locator('#artX')).toHaveValue('0');
  await expect(page.locator('#artY')).toHaveValue('0');
  await expect(page.locator('#artRotation')).toHaveValue('90');
  await expect(page.locator('#export')).toBeDisabled();
  await page.getByRole('button', { name: 'Reset position and rotation' }).click();
  await expect(design).toHaveAttribute('d', original);

  await load(page, saved.svg, saved.settings);
  await expect(design).toHaveAttribute('d', positioned);
  await page.locator('#artX').fill('30');
  await expect(page.locator('#designStatus')).toContainText('Artwork extends beyond the base');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Artwork extends beyond the base');
  await expect(page.locator('#export')).toBeDisabled();
  await load(page, svg, { edge: 'sharp' });
  await expect(page.locator('#artX')).toHaveValue('0');
  await expect(page.locator('#artY')).toHaveValue('0');
  await expect(page.locator('#artRotation')).toHaveValue('0');
});

test('loading an SVG opens 2D, and generating the stamp switches back to 3D', async ({ page }) => {
  await expect(page.locator('#designView')).toBeHidden();
  await load(page, compound);
  await expect(page.locator('#designView')).toBeVisible();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
  await expect(page.locator('#viewport canvas')).toBeHidden();

  await generate(page);
  await expect(page.locator('#designView')).toBeHidden();
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#export')).toBeEnabled();
});

test('dragging snaps to center, updates numeric offsets and saves the exported placement', async ({ page }) => {
  const svg = artwork('<path d="M0 0H12V6H0Z"/>');
  await load(page, svg, { edge: 'sharp', artSizing: 'custom', artWidth: 12, artHeight: 6 });
  await page.getByRole('button', { name: '2D design' }).click();
  await page.locator('#advancedSettings > summary').click();
  await page.locator('#advancedSettings #artPlacement > summary').click();
  const design = page.locator('#designArt');
  await expect(design).toHaveAttribute('d', /^M/);
  const start = await page.locator('#designCanvas').evaluate(canvas => {
    const matrix = canvas.getScreenCTM();
    const { x, y } = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x, y, scale: matrix.a };
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 5 * start.scale, start.y - 4, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#artY')).toHaveValue('0');
  await expect.poll(async () => Number(await page.locator('#artX').inputValue())).toBeCloseTo(5, 1);
  const x = await page.locator('#artX').inputValue();
  const positioned = await design.getAttribute('d');

  await page.locator('#projectSettings > summary').click();
  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.settings).toMatchObject({ artX: x, artY: '0' });
  await page.locator('#artX').fill('1');
  await load(page, saved.svg, saved.settings);
  await expect(design).toHaveAttribute('d', positioned);
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expect(surfaceHeight(triangles, 10, 0)).toBe(7.5);
  expect(surfaceHeight(triangles, -5, 0)).toBe(6);
});

test('view cube switches the 3D camera and is hidden in 2D', async ({ page }) => {
  await generate(page);
  const canvas = page.locator('#viewport canvas');
  const shortcuts = page.getByRole('group', { name: '3D view shortcuts' });
  const screenshot = await canvas.screenshot();
  await shortcuts.getByText('Top', { exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(screenshot)).toBe(false);
  const top = await canvas.screenshot();
  await shortcuts.getByRole('button', { name: 'Front', exact: true }).press('Enter');
  await expect.poll(async () => (await canvas.screenshot()).equals(top)).toBe(false);
  await shortcuts.getByRole('button', { name: 'Right', exact: true }).press('Enter');
  await shortcuts.getByRole('button', { name: 'Isometric' }).click();
  await expect(page.locator('#export')).toBeEnabled();
  await page.getByRole('button', { name: '2D design' }).click();
  await expect(shortcuts).toBeHidden();
});

test('minimum feature check highlights thin artwork and small holes without changing export', async ({ page }) => {
  const svg = artwork('<path fill-rule="evenodd" d="M0 0H20V20H0Z M9.9 9.9H10.1V10.1H9.9Z M24 5H24.2V15H24Z"/>');
  await load(page, svg, { edge: 'sharp', mirror: false, artSizing: 'custom', artWidth: 24.2, artHeight: 20 });
  await page.getByRole('button', { name: '2D design' }).click();
  const toggle = page.getByRole('checkbox', { name: 'Check small features' });
  const narrow = page.locator('#narrowFeatures');
  const gaps = page.locator('#smallGaps');
  const note = page.locator('#featureStatus');
  const covers = (path, x, y) => path.evaluate((element, point) =>
    element.isPointInFill(new DOMPoint(...point)), [x, y]);
  await expect(narrow).toHaveAttribute('d', '');
  await toggle.check();
  await expect(note).toContainText('Estimated trouble spots');
  expect(await covers(narrow, 12, 0)).toBe(true);
  expect(await covers(narrow, -6, 0)).toBe(false);
  expect(await covers(gaps, -2.1, 0)).toBe(true);

  const minimum = page.getByRole('spinbutton', { name: 'Minimum feature (mm)' });
  await minimum.fill('0.10');
  await expect(note).toContainText('No small features flagged');
  await expect(narrow).toHaveAttribute('d', '');
  await expect(gaps).toHaveAttribute('d', '');
  await minimum.fill('');
  await expect(note).toContainText('from 0.05 to 5 mm');
  await minimum.fill('0.4');
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 12, 0)).toBe(7.5);
  expect(surfaceHeight(triangles, -2.1, 0)).toBe(6);
});

test('local presets survive reload and apply settings to the current SVG', async ({ page }) => {
  const openPresets = async () => {
    await page.locator('#projectSettings > summary').click();
    await page.getByText('Local presets', { exact: true }).click();
  };
  const presetStatus = page.locator('#presetStatus');
  const name = page.getByRole('textbox', { name: 'Preset name' });
  const list = page.getByRole('combobox', { name: 'Saved presets' });
  const apply = page.getByRole('button', { name: 'Apply preset' });
  await load(page, compound, { width: 50, edge: 'sharp', designOffset: 0.25, mirror: false });
  await openPresets();
  await expect(apply).toBeDisabled();
  await name.fill('  Logo stamp  ');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(list).toHaveValue('Logo stamp');
  await expect(presetStatus).toContainText('Saved');
  await name.fill('Logo stamp');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(presetStatus).toContainText('already exists');

  await page.reload();
  const nextSvg = artwork('<path d="M0 0H32V16H0Z"/>');
  await load(page, nextSvg, { edge: 'sharp' });
  await generate(page);
  await openPresets();
  await expect(list).toHaveValue('Logo stamp');
  await apply.click();
  await expect(page.locator('#width')).toHaveValue('50');
  await expect(page.locator('#designOffset')).toHaveValue('0.25');
  await expect(page.locator('#mirror')).not.toBeChecked();
  await expect(page.locator('#export')).toBeDisabled();
  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.svg).toBe(nextSvg);
  await generate(page);
  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(apply).toBeDisabled();
  await expect(page.locator('#export')).toBeEnabled();
  await page.reload();
  await openPresets();
  await expect(list).toBeDisabled();
});
