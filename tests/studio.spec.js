const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.join(__dirname, '..');
const artwork = (content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${content}</svg>`;
const compound = artwork('<path fill-rule="evenodd" d="M0 0H32V32H0Z M4 4H28V28H4Z M8 8H24V24H8Z M12 12H20V20H12Z"/>');

test.beforeEach(async ({ page }) => {
  // Exercise the production HTML and its pinned libraries without live CDN requests.
  await page.route('http://studio.test/', route => route.fulfill({ path: path.join(root, 'index.html') }));
  await page.route('http://studio.test/modular-geometry.js', route =>
    route.fulfill({ path: path.join(root, 'modular-geometry.js'), contentType: 'text/javascript' }));
  await page.route('http://studio.test/build-version.json', route => route.fulfill({ status: 404 }));
  await page.route('http://studio.test/polygon-geometry.js?v=stamp-border-1', route =>
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

test('shows the deployed build in the footer and keeps the header version-free', async ({ page }) => {
  const commit = '1234567890abcdef1234567890abcdef12345678';
  await page.route('http://studio.test/modular-geometry.js', route =>
    route.fulfill({ path: path.join(root, 'modular-geometry.js'), contentType: 'text/javascript' }));
  await page.route('http://studio.test/build-version.json', route => route.fulfill({ json: { commit } }));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leather Stamp Studio');
  await expect(page.locator('#buildVersion')).toHaveText('Build 1234567');
  await expect(page.locator('#buildVersion')).toHaveAttribute('title', commit);
});

test('shows a fallback when deployment metadata is unavailable', async ({ page }) => {
  await expect(page.locator('#buildVersion')).toHaveText('Build version unavailable');
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
  await expect(page.locator('#readyState')).toHaveText('Ready to export');
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
  await expect(page.locator('#edge')).toHaveValue('sharp');
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
  await expect(page.locator('#edge')).toHaveValue('sharp');
  await expect(page.locator('#bevelField')).toBeHidden();
  await expect(page.locator('#cornerField')).toBeHidden();
});

test('V3.1 project round-trip and V3.0 project missing the adjustment', async ({ page }) => {
  await load(page, compound, { designOffset: -0.37, edge: 'sharp', artSizing: 'custom', artWidth: 25, artHeight: 24 });
  await expect(page.locator('#designOffsetSlider')).toHaveValue('-0.35');
  await expect(page.locator('#artWidth')).toHaveValue('25');
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

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 650 }]) {
  test(`project and export workflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const ready = page.locator('#readyState');
    const save = page.getByRole('button', { name: 'Save project JSON' });
    const loadProject = page.getByRole('button', { name: 'Load project JSON' });
    const exportSTL = page.getByRole('button', { name: 'Download STL' });
    const details = page.locator('#meshDetails');
    await expect(ready).toHaveText('Ready to generate');
    await expect(exportSTL).toBeDisabled();
    await expect(save).toBeInViewport();
    await expect(loadProject).toBeInViewport();
    expect((await save.boundingBox()).y).toBeGreaterThan((await exportSTL.boundingBox()).y);
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(loadProject).toBeFocused();

    await load(page, compound);
    await expect(page.locator('#designView')).toBeVisible();
    await generate(page);
    await expect(page.locator('#designView')).toBeHidden();
    await expect(details).toHaveJSProperty('open', false);
    await details.locator('summary').click();
    await expect(page.locator('#status')).toBeVisible();
    await details.locator('summary').click();
    expectClosedMesh(parseSTL(await download(page, '#export')));

    await page.locator('#width').fill('55');
    await expect(page.locator('#readyState')).toHaveText('Design changed — regenerate to download');
    await expect(exportSTL).toBeDisabled();
    const project = await download(page, '#save');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), loadProject.click()]);
    await chooser.setFiles({ name: 'saved.json', mimeType: 'application/json', buffer: project });
    await expect(page.locator('#readyState')).toContainText('Project loaded');
    await expect(page.locator('#width')).toHaveValue('55');
    await expect(exportSTL).toBeDisabled();
    await generate(page);
  });
}

test('input edits and failed builds block a previously valid STL', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H32V0.6H0Z"/>'), { edge: 'sharp' });
  await generate(page);
  await page.locator('#advancedSettings > summary').click();
  await page.locator('#designOffset').fill('-0.6');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#build').click();
  await expect(page.locator('#readyState')).toHaveText('Error — see details');
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await expect(page.getByRole('group', { name: 'Artwork dimensions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backing-plate dimensions' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mirror artwork for stamping' }))
    .toHaveAccessibleDescription(/text reads correctly/);
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
  await generate(page);
  await expect(page.locator('#advancedSettings')).toHaveJSProperty('open', false);
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
    await expect(page.getByRole('button', { name: '2D Design' })).toBeVisible();
    const triangles = parseSTL(await download(page, '#export'));
    const mismatches = points.filter(([x, y], i) => (surfaceHeight(triangles, x, y) === 7.5) !== filled[i]);
    expect(mismatches).toEqual([]);
    await page.getByRole('button', { name: '2D Design' }).click();
    await expect(outline).toHaveAttribute('d', /^M/);
  }
});

test('invalid 2D inputs clear stale contours and recover without generating a mesh', async ({ page }) => {
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
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
    for (const id of ['build', 'export', 'save', 'load']) {
      await expect(page.locator('#' + id)).toBeInViewport({ ratio: 1 });
    }
    await expectPageFits();

    await page.getByRole('button', { name: '2D Design' }).click();
    await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
    await expectPageFits();
    await page.getByRole('button', { name: '3D Preview' }).click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
});

test('numeric artwork placement updates the 2D view, STL, and saved project', async ({ page }) => {
  const svg = artwork('<path d="M0 0H12V2H4V6H0Z"/>');
  await load(page, svg, { edge: 'sharp', artSizing: 'custom', artWidth: 12, artHeight: 6, mirror: false });
  await expect(page.locator('#mode option')).toHaveText(['Debossing (raised stamp)', 'Embossing (recessed die)']);
  await page.getByRole('button', { name: '2D Design' }).click();
  await page.locator('#artPlacement > summary').click();
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

  await page.getByRole('button', { name: '2D Design' }).click();
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

test('preview buttons work by keyboard and keep the previous camera view', async ({ page }) => {
  const nav = page.getByRole('group', { name: 'Preview view' });
  const design = nav.getByRole('button', { name: '2D Design' });
  const preview = nav.getByRole('button', { name: '3D Preview' });
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#previewMessage')).toHaveText('Generate a stamp to see it here.');
  await expect(page.getByRole('button', { name: 'Fit view' })).toBeHidden();

  await generate(page);
  await page.getByRole('button', { name: 'Top', exact: true }).press('Enter');
  const canvas = page.locator('#viewport canvas');
  const { x, y, width, height } = await canvas.boundingBox();
  const clip = { x: Math.floor(x + width / 4), y: Math.floor(y + height / 4),
    width: Math.floor(width / 2), height: Math.floor(height / 2) };
  const topView = await page.screenshot({ clip });
  await design.focus();
  await page.keyboard.press('Enter');
  await expect(design).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#artPlacement > summary')).toBeVisible();
  await page.locator('#artPlacement > summary').click();
  await page.locator('#artRotation').fill('20');
  await expect(page.locator('#export')).toBeDisabled();
  await preview.focus();
  await page.keyboard.press('Space');
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#previewMessage')).toContainText('Showing the previous stamp');
  await expect.poll(async () => (await page.screenshot({ clip })).equals(topView)).toBe(true);
  await design.click();
  await expect(page.locator('#artRotation')).toHaveValue('20');
  await generate(page);
});

test.describe('touch preview controls', () => {
  test.use({ viewport: { width: 320, height: 650 }, hasTouch: true, isMobile: true });

  test('keeps the preview and placement controls usable on a narrow screen', async ({ page }) => {
    const nav = page.getByRole('group', { name: 'Preview view' });
    await nav.getByRole('button', { name: '2D Design' }).tap();
    const placement = page.locator('#artPlacement');
    await placement.locator('summary').tap();
    await expect(page.locator('#artRotation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Center artwork' })).toBeVisible();
    const { viewport, documentWidth } = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport).toBe(320);
    expect(documentWidth).toBe(viewport);
    await nav.getByRole('button', { name: '3D Preview' }).tap();
    await expect(placement).toBeHidden();
  });
});

test('dragging snaps to center, updates numeric offsets and saves the exported placement', async ({ page }) => {
  const svg = artwork('<path d="M0 0H12V6H0Z"/>');
  await load(page, svg, { edge: 'sharp', artSizing: 'custom', artWidth: 12, artHeight: 6 });
  await page.getByRole('button', { name: '2D Design' }).click();
  await page.locator('#artPlacement > summary').click();
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
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(shortcuts).toBeHidden();
});

test('minimum feature check highlights thin artwork and small holes without changing export', async ({ page }) => {
  const svg = artwork('<path fill-rule="evenodd" d="M0 0H20V20H0Z M9.9 9.9H10.1V10.1H9.9Z M24 5H24.2V15H24Z"/>');
  await load(page, svg, { edge: 'sharp', mirror: false, artSizing: 'custom', artWidth: 24.2, artHeight: 20 });
  await page.getByRole('button', { name: '2D Design' }).click();
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
  const openPresets = () => page.locator('#presetSettings > summary').click();
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

const smallBorderArt = artwork('<path d="M0 0H25V20H0Z"/>');
const borderSettings = { edge: 'sharp', artSizing: 'custom', artWidth: 25, artHeight: 20, borderEnabled: true };
const boundsOf = path => path.evaluate(element => {
  const { x, y, width, height } = element.getBBox();
  return [x, y, width, height];
});
const fillsPoint = (path, x, y) => path.evaluate((element, [px, py]) =>
  element.isPointInFill(new DOMPoint(px, -py)), [x, y]);

for (const baseShape of ['rect', 'roundrect', 'circle', 'contour']) {
  test(`Follow base builds a closed border on a ${baseShape} plate`, async ({ page }) => {
    await load(page, smallBorderArt, {
      ...borderSettings, artWidth: 18, artHeight: 14, baseShape, width: 42, height: 36, margin: 6,
      borderPlacement: 'base', borderShape: 'match', borderThickness: 1, borderGap: 2,
    });
    await page.getByRole('button', { name: '2D Design' }).click();
    const border = page.locator('#borderPreview');
    await expect(border).toHaveAttribute('d', /^M/);
    await expect(page.getByText('Distance from base edge (mm)')).toBeVisible();
    const x = baseShape === 'contour' ? 12.5 : 18.5;
    expect(await fillsPoint(border, x, 0)).toBe(true);
    expect(await fillsPoint(border, x - 1, 0)).toBe(false);
    expect(await fillsPoint(border, x + 1, 0)).toBe(false);
    await generate(page);
    const triangles = parseSTL(await download(page, '#export'));
    expectClosedMesh(triangles);
    expect(surfaceHeight(triangles, x, 0)).toBe(7.5);
    expect(surfaceHeight(triangles, x - 1, 0)).toBe(6);
  });
}

for (const borderShape of ['rect', 'roundrect', 'ellipse']) {
  test(`Fit around artwork with a ${borderShape} border leaves enough corner clearance`, async ({ page }) => {
    await load(page, smallBorderArt, { ...borderSettings, width: 60, height: 60, borderShape });
    await page.getByRole('button', { name: '2D Design' }).click();
    const border = page.locator('#borderPreview');
    await expect(border).toHaveAttribute('d', /^M/);
    if (borderShape === 'rect') expect(await boundsOf(border)).toEqual([-15.5, -13, 31, 26]);
    // Sample just inside the requested clearance around the top-right corner.
    for (const angle of [0, Math.PI / 8, Math.PI / 4, 3 * Math.PI / 8, Math.PI / 2]) {
      expect(await fillsPoint(border, 12.5 + 1.999 * Math.cos(angle), 10 + 1.999 * Math.sin(angle))).toBe(false);
    }
    expect(await fillsPoint(border, 12, 9)).toBe(false);
    await generate(page);
    expectClosedMesh(parseSTL(await download(page, '#export')));
  });
}

test('contour border follows concavity and disjoint artwork without lining the internal counter', async ({ page }) => {
  const svg = artwork('<path fill-rule="evenodd" d="M0 0H18V6H7V18H0Z M1 1H4V4H1Z M2 2H3V3H2Z M23 12H27V16H23Z"/>');
  await load(page, svg, { ...borderSettings, artWidth: 27, artHeight: 18, borderShape: 'contour', borderGap: 0.8, mirror: false });
  await page.getByRole('button', { name: '2D Design' }).click();
  const border = page.locator('#borderPreview');
  await expect(border).toHaveAttribute('d', /^M/);
  expect(await fillsPoint(border, -11, 6.5)).toBe(false); // Counter and island
  expect(await fillsPoint(border, 4, -6)).toBe(false); // Open concavity
  expect(await fillsPoint(border, 0, 1.7)).toBe(true); // Inside the notch's border
  expect(await fillsPoint(border, 14.8, -5)).toBe(true); // Disjoint component
  await page.locator('#advancedSettings > summary').click();
  const original = await border.getAttribute('d');
  await page.locator('#designOffset').fill('0.25');
  await expect(border).not.toHaveAttribute('d', original);
  const expanded = (await boundsOf(border))[2];
  await page.locator('#designOffset').fill('-0.25');
  await expect.poll(async () => (await boundsOf(border))[2]).toBeLessThan(expanded);
  await page.locator('#mirror').check();
  await expect.poll(() => fillsPoint(border, -14.8, -5)).toBe(true);
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
});

test('sharp border shares a valid solid with beveled artwork and persists in a project', async ({ page }) => {
  await load(page, smallBorderArt, { ...borderSettings, edge: 'chamfer', borderShape: 'rect' });
  await generate(page);
  const geometry = parseSTL(await download(page, '#export'));
  expectClosedMesh(geometry);
  expect(surfaceHeight(geometry, 15, 0)).toBe(7.5);
  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.settings).toMatchObject({ borderEnabled: true, borderPlacement: 'artwork', borderShape: 'rect', borderGap: '2', borderThickness: '1' });
  await page.locator('#borderGap').fill('20');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('border extends beyond the base');
  await expect(page.locator('#export')).toBeDisabled();
  await load(page, saved.svg, saved.settings);
  await generate(page);
  expect(parseSTL(await download(page, '#export'))).toEqual(geometry);

  await load(page, saved.svg, { edge: 'sharp' });
  await expect(page.locator('#borderEnabled')).not.toBeChecked();
  await generate(page);
  const legacy = await download(page, '#export');
  expectClosedMesh(parseSTL(legacy));
  await load(page, saved.svg, { edge: 'sharp', borderEnabled: false, borderShape: 'contour', borderGap: 20 });
  await generate(page);
  expect(await download(page, '#export')).toEqual(legacy);
});

test('zero gap joins a sharp frame and invalid border settings block export', async ({ page }) => {
  await load(page, smallBorderArt, { ...borderSettings, borderShape: 'rect', borderGap: 0 });
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 13, 0)).toBe(7.5);
  await page.locator('#edge').selectOption('round');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('zero artwork gap requires Sharp');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, smallBorderArt, { ...borderSettings, borderPlacement: 'base', borderGap: 20 });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('border collapses or splits');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, smallBorderArt, { ...borderSettings, borderShape: 'unknown' });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('valid border placement and shape');
  await expect(page.locator('#export')).toBeDisabled();

  await page.locator('#mode').selectOption('recessed');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Borders require Debossing');
  await expect(page.locator('#export')).toBeDisabled();
});


test('keyboard border toggle reveals controls and preserves settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  const toggle = page.getByRole('checkbox', { name: 'Add border' });
  const fields = page.locator('#borderFields');
  const placement = page.getByRole('combobox', { name: 'Placement', exact: true });
  await expect(fields).toBeHidden();
  await toggle.press('Space');
  await expect(fields).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(placement).toBeFocused();
  await expect(page.getByRole('spinbutton', { name: 'Gap from artwork (mm)' })).toBeVisible();
  await placement.selectOption('base');
  const distance = page.getByRole('spinbutton', { name: 'Distance from base edge (mm)' });
  await distance.fill('3');
  await toggle.press('Space');
  await expect(fields).toBeHidden();
  await toggle.press('Space');
  await expect(distance).toHaveValue('3');
  await page.locator('#mode').selectOption('recessed');
  await expect(toggle).toBeEnabled();
  await toggle.press('Space');
  await expect(toggle).toBeDisabled();
  await expect(fields).toBeHidden();
  await page.locator('#mode').selectOption('raised');
  await expect(toggle).toBeEnabled();
});

test('a flush Follow base border works on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  const panel = page.locator('#borderPanel');
  await expect(panel.getByRole('checkbox', { name: 'Add border' })).toBeVisible();
  await expect(panel.locator('#borderFields')).toBeHidden();
  await load(page, smallBorderArt, { ...borderSettings, edge: 'round', borderPlacement: 'base', borderGap: 0 });
  await expect(panel.locator('#borderGap')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 19.5, 0)).toBe(7.5);
  await expect(page.locator('#meshDetails')).toHaveJSProperty('open', false);
});


test('a stale polygon library blocks bordered export with a reload message', async ({ page }) => {
  const source = await readFile(path.join(root, 'polygon-geometry.js'), 'utf8');
  await page.route('http://studio.test/polygon-geometry.js?v=stamp-border-1', route =>
    route.fulfill({ body: source.replace(', stampBorder };', ' };'), contentType: 'text/javascript' }));
  await page.reload();
  await load(page, smallBorderArt, { ...borderSettings, borderShape: 'rect' });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('The border library is out of date. Reload the page');
  await expect(page.locator('#export')).toBeDisabled();
});

test('STL filenames use the SVG name and effective stamp settings', async ({ page }) => {
  async function expectDownloadName(expected) {
    const event = page.waitForEvent('download');
    await page.locator('#export').click();
    expect((await event).suggestedFilename()).toBe(expected);
  }

  await page.locator('#file').setInputFiles({
    name: 'Dacha Craft.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(smallBorderArt),
  });
  await expect(page.locator('#readyState')).toContainText('Artwork loaded');
  await page.locator('#baseShape').selectOption('roundrect');
  await page.locator('#edge').selectOption('round');
  await generate(page);
  await expectDownloadName('Dacha_Craft_debossing_rounded_rounded_rectangle.stl');

  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.artworkFilename).toBe('Dacha Craft.svg');
  await page.locator('#projectFile').setInputFiles({
    name: 'Renamed project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator('#readyState')).toContainText('Project loaded');
  await page.locator('#mode').selectOption('recessed');
  await generate(page);
  await expectDownloadName('Dacha_Craft_embossing_sharp_rounded_rectangle.stl');

  await load(page, smallBorderArt, { edge: 'sharp', mode: 'raised', baseShape: 'rect' });
  await generate(page);
  await expectDownloadName('project_artwork_debossing_sharp_rectangle.stl');
  await page.getByRole('button', { name: 'Use example paw print' }).click();
  await generate(page);
  await expectDownloadName('paw_print_debossing_sharp_rectangle.stl');
});

test('custom border height updates the preview and STL while preserving artwork relief', async ({ page }) => {
  await load(page, smallBorderArt, { ...borderSettings, borderShape: 'rect', edge: 'chamfer' });
  await page.getByRole('button', { name: '2D Design' }).click();
  const panel = page.locator('#borderPanel');
  const mode = panel.getByRole('combobox', { name: 'Border height', exact: true });
  const height = panel.getByRole('spinbutton', { name: 'Custom border height (mm)' });
  await expect(mode).toHaveValue('same');
  await expect(height).toBeHidden();
  const border = page.locator('#borderPreview');
  await expect(border).toHaveAttribute('d', /^M/);
  const footprint = await border.getAttribute('d');
  await expect(page.locator('#designStatus')).toContainText('1.5 mm high');

  await mode.selectOption('custom');
  await height.fill('2.25');
  await expect(page.locator('#designStatus')).toContainText('2.25 mm high');
  await expect(border).toHaveAttribute('d', footprint);
  await generate(page);
  const geometry = parseSTL(await download(page, '#export'));
  expectClosedMesh(geometry);
  expect(surfaceHeight(geometry, 0, 0)).toBe(7.5);
  expect(surfaceHeight(geometry, 15, 0)).toBe(8.25);
  expect(surfaceHeight(geometry, 14, 0)).toBe(6);

  const project = JSON.parse(await download(page, '#save'));
  expect(project.settings).toMatchObject({ borderHeightMode: 'custom', borderHeight: '2.25' });
  await height.fill('0.1');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('custom border height from 0.20 to 5.00 mm');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, project.svg, project.settings);
  await generate(page);
  expect(parseSTL(await download(page, '#export'))).toEqual(geometry);
});

test('a shorter sharp border stays distinct, and touching relief requires equal heights', async ({ page }) => {
  await load(page, smallBorderArt, {
    ...borderSettings, borderShape: 'rect', borderHeightMode: 'custom', borderHeight: 0.75,
  });
  await generate(page);
  const mesh = parseSTL(await download(page, '#export'));
  expectClosedMesh(mesh);
  expect(surfaceHeight(mesh, 0, 0)).toBe(7.5);
  expect(surfaceHeight(mesh, 15, 0)).toBe(6.75);

  await page.locator('#borderGap').fill('0');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('zero artwork gap requires the border and artwork to have the same height');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, smallBorderArt, { ...borderSettings, borderShape: 'rect', borderGap: 0 });
  await generate(page);
  const legacy = parseSTL(await download(page, '#export'));
  expectClosedMesh(legacy);
  expect(surfaceHeight(legacy, 13, 0)).toBe(7.5);
});

for (const borderShape of ['rect', 'ellipse', 'contour']) {
  for (const [borderEdge, label, layerCount] of [['chamfer', 'Chamfered', 6], ['round', 'Rounded', 8]]) {
    test(`${label} ${borderShape} border keeps intermediate relief layers`, async ({ page }) => {
      const design = borderShape === 'contour'
        ? artwork('<path d="M0 0H25V6H8V20H0Z"/>')
        : smallBorderArt;
      await load(page, design, {
        ...borderSettings, mirror: false, borderShape, borderEdge, borderEdgeSize: 0.25, width: 60, height: 60,
        borderHeightMode: 'custom', borderHeight: 2.25,
      });
      await expect(page.getByRole('spinbutton', { name: 'Border edge size (mm)' })).toBeVisible();
      await generate(page);
      const triangles = parseSTL(await download(page, '#export'));
      expectClosedMesh(triangles);
      expect(surfaceHeight(triangles, -9, 0)).toBe(7.5);
      const z = new Set(triangles.flat().map(point => point[2]).filter(height => height > 7.5));
      expect(z.size).toBe(layerCount + 1);
      await expect(page.locator('#status')).toContainText(`${label} border`);
      await expect(page.locator('#status')).toContainText(/Applied border edge: 0\.\d+ mm/);
    });
  }
}

test('border edge recovery keeps artwork bevel, saves the profile, and rejects a touching beveled border', async ({ page }) => {
  await load(page, smallBorderArt, {
    ...borderSettings, edge: 'chamfer', borderShape: 'rect', borderEdge: 'round', borderEdgeSize: 1.5,
  });
  await generate(page);
  await expect(page.locator('#status')).toContainText('Applied edge: 0.250 mm');
  await expect(page.locator('#status')).toContainText('Applied border edge: 0.450 mm (reduced');
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(new Set(triangles.flat().filter(([x, y]) => Math.abs(x) < 13 && Math.abs(y) < 11).map(point => point[2])).size).toBeGreaterThan(2);

  const saved = JSON.parse(await download(page, '#save'));
  expect(saved.settings).toMatchObject({ borderEdge: 'round', borderEdgeSize: '1.5' });
  await load(page, saved.svg, saved.settings);
  await expect(page.locator('#borderEdge')).toHaveValue('round');
  await expect(page.locator('#borderEdgeSize')).toHaveValue('1.5');
  await page.locator('#edge').selectOption('sharp');
  await page.locator('#borderGap').fill('0');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('zero artwork gap requires Sharp border edges');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, saved.svg, { ...borderSettings, borderShape: 'rect' });
  await expect(page.locator('#borderEdge')).toHaveValue('sharp');
  await expect(page.getByRole('spinbutton', { name: 'Border edge size (mm)' })).toBeHidden();
  await generate(page);
});

test('keyed insert centers SVG relief on the seated holder, with separate holder download', async ({ page }) => {
  await load(page, compound, { construction: 'modular', edge: 'sharp' });
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(page.locator('#designHolder')).toHaveAttribute('d', /^M/);
  const previewCenter = await page.locator('#designArt').evaluate(element => {
    const { x, y, width, height } = element.getBBox();
    return [x + width / 2, y + height / 2];
  });
  expect(previewCenter).toEqual([0, 0]);
  const holderLink = page.getByRole('link', { name: 'Download keyed holder STL' });
  await expect(holderLink).toHaveAttribute('href', /0p25-side-0p35-overhead\.stl$/);
  await generate(page);
  await expect(page.getByRole('checkbox', { name: 'Show holder' })).toBeVisible();
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  const points = triangles.flat();
  const top = points.filter(([, , z]) => z === 4);
  expect(top.length).toBeGreaterThan(0);
  const bounds = (vertices, axis) => [
    Math.min(...vertices.map(p => p[axis])),
    Math.max(...vertices.map(p => p[axis])),
  ];
  expect(bounds(points, 0)).toEqual([-22, 18]);
  const [leftWing, rightWing] = bounds(points, 1);
  expect(leftWing).toBeCloseTo(-19.95, 5);
  expect(rightWing).toBeCloseTo(19.95, 5);
  expect(bounds(top, 0)).toEqual([-13.5, 13.5]);
  const [minY, maxY] = bounds(top, 1);
  expect(minY + maxY).toBeCloseTo(0, 5);
  expect(surfaceHeight(triangles, 12, 0)).toBe(4);
  expect(surfaceHeight(triangles, 10, 0)).toBe(2.5);

  const project = JSON.parse(await download(page, '#save'));
  expect(project.settings.construction).toBe('modular');
  await page.locator('#construction').selectOption('solid');
  await expect(page.locator('#export')).toBeDisabled();
  await load(page, project.svg, project.settings);
  await expect(page.locator('#construction')).toHaveValue('modular');
  await load(page, project.svg, {});
  await expect(page.locator('#construction')).toHaveValue('solid');
});

test('modular generation blocks overly deep cavities and artwork outside the fixed area', async ({ page }) => {
  await load(page, compound, { construction: 'modular', mode: 'recessed', depth: 2.6 });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Keyed embossing cavity depth must be 0.2–2.5 mm');
  await expect(page.locator('#export')).toBeDisabled();
  await load(page, compound, { construction: 'modular', mode: 'raised', artSizing: 'custom', artWidth: 65, artHeight: 65 });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('exceeds');
  await expect(page.locator('#export')).toBeDisabled();
});


test('modular offset, chamfer, border and explicit placement preserve a closed insert', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H12V6H0Z"/>'), {
    construction: 'modular', artSizing: 'custom', artWidth: 18, artHeight: 9,
    artX: 2, artY: -1, designOffset: 0.25, edge: 'chamfer', bevel: 0.25,
    borderEnabled: true, borderShape: 'rect', borderGap: 2, borderThickness: 1,
  });
  await generate(page);
  await expect(page.locator('#status')).toContainText('Applied edge: 0.250 mm');
  await expect(page.locator('#status')).toContainText('Sharp border');
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 2, -1)).toBe(4);
  const top = triangles.flat().filter(([, , z]) => z === 4);
  for (const [axis, center] of [[0, 2], [1, -1]]) {
    const coords = top.map(point => point[axis]);
    expect((Math.min(...coords) + Math.max(...coords)) / 2).toBeCloseTo(center, 4);
  }
});


test('keyed embossing exports a centered compound cavity above the existing holder rim', async ({ page }) => {
  await load(page, compound, { construction: 'modular', mode: 'recessed', depth: 2.5 });
  await expect(page.locator('#depth')).toHaveAttribute('max', '2.5');
  await generate(page);
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  expect(file.suggestedFilename()).toMatch(/_embossing_insert_keyed-40-v1\.stl$/);
  const triangles = parseSTL(await readFile(await file.path()));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 12, 0)).toBe(1.5);
  expect(surfaceHeight(triangles, -12, 0)).toBe(1.5);
  expect(surfaceHeight(triangles, 10, 0)).toBe(4);
  const points = triangles.flat();
  const wings = points.filter(([, y]) => Math.abs(y) > 19.5);
  expect(Math.min(...wings.map(([, , z]) => z))).toBe(0.25);
  expect(Math.max(...wings.map(([, , z]) => z))).toBe(1);
  expect(Math.max(...points.map(([, y]) => y))).toBeCloseTo(19.95, 5);
  await page.locator('#mode').selectOption('raised');
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#depth')).toHaveAttribute('max', '5');
});

test('use SVG size preserves physical scale, expands the base and restores the saved mode', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12cm" height="99.73mm" viewBox="10 20 120 99.73"><rect x="10" y="20" width="120" height="99.73"/></svg>';
  await load(page, svg);
  await page.getByRole('radio', { name: 'Use SVG size' }).check();
  await expect(page.locator('#sizeSummary')).toContainText('120.00 × 99.73 mm');
  await expect(page.locator('#width')).toHaveValue('128');
  await expect(page.locator('#height')).toHaveValue('108');
  const project = JSON.parse(await download(page, '#save'));
  expect(project.settings.artSizing).toBe('native');
  await load(page, project.svg, project.settings);
  await expect(page.getByRole('radio', { name: 'Use SVG size' })).toBeChecked();
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
});

test('imports a stroke-only outline around filled artwork without filling the outline', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" fill="none" stroke="red" stroke-width="2"/><rect x="16" y="16" width="8" height="8"/></svg>';
  await load(page, svg);
  await page.getByRole('radio', { name: 'Use SVG size' }).check();
  await expect(page.locator('#sizeSummary')).toContainText('34.00 × 34.00 mm');
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, 16, 0)).toBe(7.5);
  expect(surfaceHeight(triangles, 8, 0)).toBe(6);
  expect(surfaceHeight(triangles, 0, 0)).toBe(7.5);
});

test('a selected SVG stroke becomes an independently adjustable border', async ({ page }) => {
  const svg = artwork('<rect id="outer" x="2" y="2" width="28" height="28" fill="none" stroke="red"/><circle id="inner" cx="16" cy="16" r="7" fill="none" stroke="blue"/><rect x="14" y="14" width="4" height="4"/>');
  await load(page, svg);
  await page.locator('#borderEnabled').check();
  await page.locator('#borderPlacement').selectOption('svg');
  await page.locator('#borderOutline').selectOption({ label: 'outer' });
  await expect(page.locator('#borderPreview')).toHaveAttribute('d', /^M/);
  const border = page.locator('#borderPreview');
  const original = await border.getAttribute('d');
  await expect(page.locator('#borderGap')).toBeHidden();
  await page.locator('#borderThickness').fill('1.2');
  await expect(border).not.toHaveAttribute('d', original);
  await page.locator('#borderHeightMode').selectOption('custom');
  await page.locator('#borderHeight').fill('2.4');
  await page.locator('#borderEdge').selectOption('chamfer');
  await generate(page);
  await expect(page.locator('#status')).toContainText('Chamfered border');
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(Math.max(...triangles.flat().map(point => point[2]))).toBeCloseTo(8.4, 5);
  expect(surfaceHeight(triangles, 0, 0)).toBe(7.5);
  const project = JSON.parse(await download(page, '#save'));
  expect(project.settings.borderOutline).toBe('0');
  await load(page, project.svg, project.settings);
  await expect(page.locator('#borderOutline')).toHaveValue('0');
});

test('a sole SVG outline replaces an obsolete saved selection', async ({ page }) => {
  const svg = artwork('<rect id="heart" x="2" y="2" width="28" height="28" fill="none" stroke="red"/><rect x="12" y="12" width="8" height="8"/>');
  const settings = { borderEnabled: true, borderPlacement: 'svg', borderOutline: '17' };
  await load(page, svg, settings);
  await expect(page.locator('#borderOutline')).toHaveValue('0');
  await generate(page);

  await load(page, compound, settings);
  await expect(page.locator('#borderOutline')).toBeDisabled();
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('This SVG has no eligible border outline.');
  await expect(page.locator('#export')).toBeDisabled();
});

test('a stroke converted to a filled ring remains selectable as an SVG border', async ({ page }) => {
  const svg = artwork('<path id="expanded-heart" fill="purple" fill-rule="evenodd" d="M2 2H30V30H2Z M4 4H28V28H4Z"/><rect x="12" y="12" width="8" height="8"/>');
  await load(page, svg, { borderEnabled: true, borderPlacement: 'svg', borderThickness: 3,
    borderHeightMode: 'custom', borderHeight: 3.5 });
  await expect(page.locator('#borderOutline')).toHaveValue('0');
  await generate(page);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(Math.max(...triangles.flat().map(point=>point[2]))).toBe(9.5);
});

test('laser SVGs share the stamped registration geometry and block stale downloads', async ({ page }) => {
  const svg = artwork('<path d="M0 0H12V4H5V10H0Z"/>');
  await load(page, svg, { artSizing: 'custom', artWidth: 20, artHeight: 16, width: 50,
    laserEnabled: true, mirror: false, artX: 2 });
  await page.locator('#laserSettings > summary').click();
  await page.getByRole('button', { name: '2D Design' }).click();
  const stampPaths = [];
  for (const id of ['laserCutPreview', 'laserMarkPreview']) {
    const preview = page.locator('#' + id);
    await expect(preview).toHaveAttribute('d', /^M/);
    stampPaths.push(await preview.getAttribute('d'));
  }
  const [cutWidth, cutHeight] = await page.locator('#laserCutPreview').evaluate(el => {
    const { width, height } = el.getBBox();
    return [width, height];
  });
  expect(cutWidth).toBeCloseTo(26, 3);
  expect(cutHeight).toBeCloseTo(22, 3);
  await expect(page.locator('#laserCutDownload')).toBeDisabled();
  await generate(page);
  const cut = (await download(page, '#laserCutDownload')).toString();
  const reference = (await download(page, '#laserReferenceDownload')).toString();
  const layout = (await download(page, '#laserLayoutDownload')).toString();
  expect(cut.match(/<svg [^>]+>/)[0]).toBe(reference.match(/<svg [^>]+>/)[0]);
  expect(layout.match(/<svg [^>]+>/)[0]).toBe(cut.match(/<svg [^>]+>/)[0]);
  const groups = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return [...doc.querySelectorAll('g')].map(group => {
      const path = group.querySelector('path');
      return { id: group.id, path: path.getAttribute('d'), color: path.getAttribute('stroke') || path.getAttribute('fill') };
    });
  }, layout);
  expect(groups).toEqual([
    { id: 'cut', path: cut.match(/ d="([^"]+)"/)[1], color: '#ff0000' },
    { id: 'alignment-reference', path: reference.match(/ d="([^"]+)"/)[1], color: '#0000ff' },
  ]);
  const leatherView = path => path.replace(/([ML])(-?[\d.]+)/g, (_, op, x) => op + (-Number(x)));
  expect(cut).toContain('d="' + leatherView(stampPaths[0]) + '"');
  expect(reference).toContain('d="' + leatherView(stampPaths[1]) + '"');
  expect(cut).toContain('fill="none"');
  expect((cut.match(/<path/g) || []).length).toBe(1);
  const triangles = parseSTL(await download(page, '#export'));
  expectClosedMesh(triangles);
  expect(surfaceHeight(triangles, -14.5, 0)).toBe(7.5);
  expect(surfaceHeight(triangles, 18.5, 0)).toBe(6); // Ring center.
  expect(surfaceHeight(triangles, 19.6, 0)).toBe(7.5);
  const project = JSON.parse(await download(page, '#save'));
  expect(project.settings).toMatchObject({ laserEnabled: true, laserCutOffset: '3', laserMarkGap: '2' });
  await page.locator('#laserCutOffset').fill('4');
  await expect(page.locator('#laserCutDownload')).toBeDisabled();
  await expect(page.locator('#laserReferenceDownload')).toBeDisabled();
  await expect(page.locator('#laserLayoutDownload')).toBeDisabled();
  await expect(page.locator('#export')).toBeDisabled();
});

test('laser registration explains required backing and rejects modular stamps', async ({ page }) => {
  const svg = artwork('<rect x="0" y="0" width="20" height="20"/>');
  await load(page, svg, { laserEnabled: true });
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Registration marks need a rectangular backing');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#construction').selectOption('modular');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Laser cut registration requires a solid debossing stamp.');
  await expect(page.locator('#export')).toBeDisabled();
});

test('leather impression flips the stamp, border and laser references without changing exports', async ({ page }) => {
  await load(page, artwork('<path d="M0 0H12V4H5V10H0Z"/>'), {
    artSizing: 'custom', artWidth: 20, artHeight: 16, width: 70, height: 50, artX: 3,
    borderEnabled: true, borderShape: 'rect', laserEnabled: true, mirror: true,
  });
  await generate(page);
  await page.locator('#laserSettings > summary').click();
  const priorCut = await download(page, '#laserCutDownload');
  await page.getByRole('button', { name: '2D Design' }).click();
  const artworkPath = page.locator('#designArt');
  await expect(artworkPath).toHaveAttribute('d', /^M/);
  const before = await artworkPath.getAttribute('d');
  const toggle = page.getByRole('checkbox', { name: 'Approximate leather impression' });
  await toggle.press('Space');
  await expect(page.locator('#designGeometry')).toHaveAttribute('transform', 'scale(-1 1)');
  await expect(page.locator('#designView')).toHaveAttribute('data-impression', 'recessed');
  await expect(page.locator('#designStatus')).toContainText('Recessed impression (debossing)');
  await expect(page.locator('#designPlate')).toBeHidden();
  for (const id of ['designArt', 'borderPreview', 'laserCutPreview', 'laserMarkPreview']) {
    const path = page.locator('#' + id);
    await expect(path).toHaveAttribute('d', /^M/);
    expect(await path.evaluate(el => el.getCTM().a)).toBeLessThan(0);
  }
  await expect(artworkPath).toHaveAttribute('d', before);
  await expect(page.locator('#export')).toBeEnabled();
  expect(await download(page, '#laserCutDownload')).toEqual(priorCut);

  await page.locator('#laserEnabled').uncheck();
  await page.locator('#borderEnabled').uncheck();
  await page.locator('#mode').selectOption('recessed');
  await expect(page.locator('#designStatus')).toContainText('Raised impression (embossing)');
  await expect(page.locator('#designView')).toHaveAttribute('data-impression', 'raised');
  await toggle.uncheck();
  await expect(page.locator('#designPlate')).toBeVisible();
  expect(await artworkPath.evaluate(el => el.getCTM().a)).toBeGreaterThan(0);
});

test('native-size heart patch exports a cut 3 mm beyond the filled SVG border', async ({ page }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="55mm" viewBox="0 0 60 55">
    <path id="heart" fill="purple" fill-rule="evenodd" d="
      M30 50 C13 40 3 29 3 17 C3 4 20 0 30 12 C40 0 57 4 57 17 C57 29 47 40 30 50 Z
      M30 47 C15 38 5 28 5 17 C5 6 20 3 30 15 C40 3 55 6 55 17 C55 28 45 38 30 47 Z"/>
    <path d="M20 21H37V25H25V32H20Z"/>
  </svg>`;
  await load(page, svg, { artSizing: 'native', width: 80, height: 64, mirror: true,
    borderEnabled: true, borderPlacement: 'svg', laserEnabled: true });
  await expect(page.getByRole('radio', { name: 'Use SVG size' })).toBeChecked();
  await expect(page.locator('#borderOutline')).toHaveValue('0');
  await page.getByRole('button', { name: '2D Design' }).click();
  const border = page.locator('#borderPreview');
  await expect(border).toHaveAttribute('d', /^M/);

  // Production SVG paths contain line segments. Reflect the border into the
  // leather-facing coordinates and measure against the actual cut download.
  const borderPath = await border.getAttribute('d');
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
  await page.locator('#laserSettings > summary').click();
  const cutSVG = (await download(page, '#laserCutDownload')).toString();
  const cutPath = cutSVG.match(/ d="([^"]+)"/)[1];
  const paths = path => path.split('Z').filter(Boolean).map(loop =>
    [...loop.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]));
  const cutLoops = paths(cutPath);
  expect(cutLoops).toHaveLength(1);
  const [cut] = cutLoops;
  const segments = paths(borderPath).flatMap(loop => loop.map(([x, y], i) => {
    const [nextX, nextY] = loop[(i + 1) % loop.length];
    return [[-x, y], [-nextX, nextY]];
  }));
  const distanceToSegment = ([x, y], [[ax, ay], [bx, by]]) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };
  const clearances = cut.map((point, i) => {
    const [x, y] = cut[(i + 1) % cut.length];
    const midpoint = [(point[0] + x) / 2, (point[1] + y) / 2];
    return Math.min(...segments.map(segment => distanceToSegment(midpoint, segment)));
  });
  expect(Math.min(...clearances)).toBeGreaterThan(2.95);
  expect(Math.max(...clearances)).toBeLessThan(3.05);
});

for (const { label, attributes, content, size } of [
  { label: 'inches and points with a letterboxed viewBox',
    attributes: 'width="2in" height="72pt" viewBox="10 20 100 100"',
    content: '<rect x="10" y="20" width="100" height="100"/>', size: '25.40 × 25.40 mm' },
  { label: 'pixels and centimeters with nested transforms and nonuniform scaling',
    attributes: 'width="96px" height="5.08cm" viewBox="10 20 100 100" preserveAspectRatio="none"',
    content: '<g transform="translate(60 70)"><g transform="rotate(90) scale(2 1)"><rect x="-10" y="-15" width="20" height="30"/></g></g>',
    size: '7.62 × 20.32 mm' },
  { label: 'unitless pixel dimensions without a viewBox',
    attributes: 'width="96" height="48"',
    content: '<rect width="96" height="48"/>', size: '25.40 × 12.70 mm' },
]) {
  test(`Use SVG size handles ${label}`, async ({ page }) => {
    await load(page, `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`);
    await page.getByRole('radio', { name: 'Use SVG size' }).check();
    await expect(page.locator('#sizeSummary')).toContainText(size);
    await generate(page);
    const triangles = parseSTL(await download(page, '#export'));
    expectClosedMesh(triangles);
    const baseThickness = Number(await page.locator('#base').inputValue());
    const relief = triangles.flat().filter(point => point[2] > baseThickness + 0.001);
    const [width, height] = size.split(' × ').map(parseFloat);
    for (const [axis, dimension] of [[0, width], [1, height]]) {
      const coords = relief.map(point => point[axis]);
      expect(Math.max(...coords) - Math.min(...coords)).toBeCloseTo(dimension, 2);
    }
  });
}

test('partial SVG import explains missing text and a dashed heart while retaining vector artwork', async ({ page }) => {
  const lettering = '<path d="M12 12H20V15H15V20H12Z"/>';
  const heart = '<g style="stroke-dasharray: 2 1"><path fill="none" stroke="red" d="M16 29C5 22 2 15 4 9C6 3 13 3 16 8C19 3 26 3 28 9C30 15 27 22 16 29Z"/></g>';
  await load(page, artwork(lettering));
  const preview = page.locator('#designArt');
  await expect(preview).toHaveAttribute('d', /^M/);
  const expectedArtwork = await preview.getAttribute('d');

  await load(page, artwork(lettering + heart + '<text x="5" y="5">Studio</text>'));
  const notice = page.locator('#svgImportNotice');
  await expect(notice).toContainText('Text was skipped. Convert text to paths');
  await expect(notice).toContainText('Dashed strokes were skipped. Convert them to filled outlines');
  await expect(preview).toHaveAttribute('d', expectedArtwork);
  await page.getByRole('checkbox', { name: 'Add border' }).check();
  await page.locator('#borderPlacement').selectOption('svg');
  await expect(page.locator('#borderOutlineNotice')).toContainText('Dashed strokes cannot be used as outlines.');

  await page.locator('#borderPlacement').selectOption('artwork');
  await expect(page.locator('#borderOutlineNotice')).toBeHidden();
  await expect(page.locator('#borderPreview')).toHaveAttribute('d', /^M/);
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));

  await page.getByRole('button', { name: 'Use example paw print' }).click();
  await expect(notice).toBeHidden();
});

test('an open SVG stroke explains border rejection while keeping the 2D artwork visible', async ({ page }) => {
  const outline = '<path id="heart" fill="none" stroke="red" d="M15 29C5 22 2 15 4 9C6 3 13 3 16 8C19 3 26 3 28 9C30 15 27 22 16 29';
  const lettering = '<rect x="12" y="12" width="8" height="8"/>';
  const settings = { borderEnabled: true, borderPlacement: 'svg' };
  await load(page, artwork(outline + '"/>' + lettering), settings);
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(page.locator('#designArt')).toHaveAttribute('d', /^M/);
  await expect(page.locator('#borderOutline')).toBeDisabled();
  await expect(page.locator('#borderOutlineNotice')).toContainText('Close open strokes in your SVG editor.');
  await expect(page.locator('#designStatus')).toContainText('Close open strokes');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Close open strokes');
  await expect(page.locator('#export')).toBeDisabled();

  await load(page, artwork(outline + 'Z"/>' + lettering), settings);
  await expect(page.locator('#borderOutline')).toHaveValue('0');
  await expect(page.locator('#borderOutlineNotice')).toBeHidden();
  await generate(page);
});

test('an SVG with only live text explains how to make usable artwork and blocks export', async ({ page }) => {
  await load(page, artwork('<text x="5" y="20">Studio</text>'));
  await expect(page.locator('#svgImportNotice')).toContainText('No visible vector shapes found.');
  await expect(page.locator('#designStatus')).toContainText('Convert text to paths');
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('No visible vector shapes found.');
  await expect(page.locator('#export')).toBeDisabled();
});

test('stylesheet-styled dashed strokes are skipped and solid strokes remain selectable', async ({ page }) => {
  const lettering = '<path d="M12 12H20V15H15V20H12Z"/>';
  const heart = 'M16 29C5 22 2 15 4 9C6 3 13 3 16 8C19 3 26 3 28 9C30 15 27 22 16 29Z';
  await load(page, artwork(lettering));
  const preview = page.locator('#designArt');
  await expect(preview).toHaveAttribute('d', /^M/);
  const letteringOnly = await preview.getAttribute('d');

  const styles = '<style>.heart { fill: none; stroke: red } .dashed { stroke-dasharray: 2 1 } .solid { stroke-dasharray: none }</style>';
  const settings = { borderEnabled: true, borderPlacement: 'svg' };
  await load(page, artwork(styles + '<g class="dashed"><path class="heart" d="' + heart + '"/></g>' + lettering), settings);
  await page.getByRole('button', { name: '2D Design' }).click();
  await expect(page.locator('#svgImportNotice')).toContainText('Dashed strokes were skipped');
  await expect(preview).toHaveAttribute('d', letteringOnly);
  await expect(page.locator('#borderOutline')).toBeDisabled();

  await load(page, artwork(styles + '<g class="dashed"><path id="heart" class="solid heart" d="' + heart + '"/></g>' + lettering), settings);
  await expect(page.locator('#svgImportNotice')).toBeHidden();
  await expect(page.locator('#borderOutline')).toHaveValue('0');
  await expect(page.locator('#borderPreview')).toHaveAttribute('d', /^M/);
  await generate(page);
  expectClosedMesh(parseSTL(await download(page, '#export')));
});

for (const { mode, settings, size } of [
  { mode: 'Fit to base', settings: {}, size: '32.00 × 16.00 mm' },
  { mode: 'Exact size', settings: { artSizing: 'custom', artWidth: 20, artHeight: 10, width: 28 }, size: '20.00 × 10.00 mm' },
  { mode: 'Use SVG size', settings: { artSizing: 'native', baseShape: 'circle', width: 30 }, size: '20.00 × 10.00 mm' },
]) {
  test(`enabling registration grows the backing and preserves ${mode} artwork dimensions`, async ({ page }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>';
    await load(page, svg, settings);
    await page.getByRole('button', { name: '2D Design' }).click();
    await expect(page.locator('#sizeSummary')).toContainText(size);
    const width = Number(await page.locator('#width').inputValue());
    const art = await page.locator('#designArt').getAttribute('d');
    const baseShape = await page.locator('#baseShape').inputValue();
    await page.locator('#laserSettings > summary').click();
    await page.getByRole('checkbox', { name: 'Add registration marks to the stamp' }).check();
    await expect(page.locator('#laserBackingNotice')).toContainText('Backing enlarged');
    expect(Number(await page.locator('#width').inputValue())).toBeGreaterThan(width);
    await expect(page.getByRole('radio', { name: mode === 'Use SVG size' ? mode : 'Exact size' })).toBeChecked();
    await expect(page.locator('#baseShape')).toHaveValue(baseShape);
    await expect(page.locator('#sizeSummary')).toContainText(size);
    await expect(page.locator('#designArt')).toHaveAttribute('d', art);
    await expect(page.locator('#laserMarkPreview')).toHaveAttribute('d', /^M/);
    await generate(page);
    await expect(page.locator('#laserLayoutDownload')).toBeEnabled();
    expectClosedMesh(parseSTL(await download(page, '#export')));
  });
}

test('registration leaves backing and sizing alone if the marks would exceed 200 mm', async ({ page }) => {
  await load(page, artwork('<rect width="20" height="20"/>'), { width: 200, height: 200 });
  await page.locator('#laserSettings > summary').click();
  await page.getByRole('checkbox', { name: 'Add registration marks to the stamp' }).check();
  await expect(page.getByRole('radio', { name: 'Fit to base' })).toBeChecked();
  await expect(page.locator('#width')).toHaveValue('200');
  await expect(page.locator('#height')).toHaveValue('200');
  await expect(page.locator('#laserBackingNotice')).toBeHidden();
  await page.locator('#build').click();
  await expect(page.locator('#status')).toContainText('Registration marks need a rectangular backing');
  await expect(page.locator('#export')).toBeDisabled();
});
