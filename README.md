# Leather Stamp Studio

Turn filled SVG artwork into a 3D-printable leather stamp or die. Artwork and mesh processing run in your browser. [Open Leather Stamp Studio](https://disneymax.github.io/leather-stamp-studio/)

## Make a stamp

1. Upload a filled SVG or choose **Use example paw print**. Convert text and strokes to filled outlines before importing your own design.
2. Select **Debossing (raised stamp)** for a sunken impression or **Embossing (recessed die)** for a raised impression. Use **Mirror artwork for stamping** if the design needs to read correctly after pressing. Turn mirroring off if your SVG is already reversed.
3. In **2D design**, check the artwork against the backing plate. Use **Fit to base** or enter **Exact size** dimensions. Drag to position the artwork, or use **Advanced settings → Artwork position and rotation** for precision.
4. Select **Generate 3D stamp** and inspect the result in 3D. Use the view cube to check the stamp from above and from the sides. When the mesh passes validation, select **Download STL**.
5. Import the STL into Bambu Studio in millimeters. Confirm the base dimensions, slice it, and inspect the layers for missing strokes, filled holes, or lost islands. Test the print on a leather offcut.

The **First stamp guide** below the artwork upload walks through the paw-print example. A recessed die may need a matching positive die to make a raised impression.

## Check detail and save your work

- **Design thickness adjustment** under **Advanced settings** expands or contracts filled artwork. **Show thickness changes** in 2D highlights added material in blue and removed material in pink.
- **Check small features** highlights potentially narrow artwork in purple and small gaps or holes in green. The adjustable threshold starts at 0.4 mm. Treat it as an estimate of geometry to inspect in the slicer.
- **Projects & technical checks → Save project JSON** saves the SVG and settings together. **Local presets** saves reusable settings in the current browser. Applying a preset keeps the artwork you already have loaded.

## Validation

Mesh checks cover open boundaries, non-manifold edges, inconsistent face orientation, and degenerate triangles. Printing and pressing also depend on your slicer, printer, material, and design.

| Fixture | Verified | Pending for the current preview |
| --- | --- | --- |
| Included paw print | Default settings generate a validated STL in automated browser tests. | Inspect a fresh export in Bambu Studio and press a sample. |
| Dacha Craft | Sharp, Chamfered, and Rounded exported closed, consistently oriented STLs at both +0.05 mm and −0.05 mm adjustment. | Inspect both adjusted designs in the slicer and press a representative sample. |
| Bunny | Earlier exports passed mesh checks, and the earlier Rounded export imported into Bambu Studio without repair warnings. | Rerun Sharp, Chamfered, and Rounded on the current preview and inspect the sliced layers. |

Earlier Bambu Studio checks also confirmed clean imports for Chamfered and Rounded Dacha Craft exports and a Rounded paw print.

For each manual test, record the artwork, project settings, edge profile and applied edge size, and the slicer version. For a physical test, record the printer, material, and whether the impression reads correctly and retains its narrow details. Use those results to calibrate any future built-in presets.

## Development

GitHub Pages publishes the root of `feature/v3-3-offset-warnings`. The V3.0 baseline is on `main`. Use a feature branch and pull request for changes. [Current preview PR](https://github.com/DisneyMax/leather-stamp-studio/pull/7)

Open `index.html` in a modern WebGL-capable browser, or serve the checkout with `python3 -m http.server 8000` and open `http://localhost:8000`. Keep `polygon-geometry.js` beside `index.html`. The page loads Three.js and Clipper from CDNs.

With Node.js 24, run:

```sh
npm ci
npx playwright install chromium
npm test
```

Tests use local copies of the pinned browser libraries. Set `LEATHER_STAMP_CHROMIUM` to an existing Chromium executable if needed. GitHub Actions runs the polygon tests and Playwright suite on pull requests.
