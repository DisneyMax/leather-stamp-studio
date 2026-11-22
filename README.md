# Leather Stamp Studio

Turn SVG artwork into a 3D-printable leather stamp or die. Artwork and mesh processing run in your browser. [Open Leather Stamp Studio](https://disneymax.github.io/leather-stamp-studio/)

## Make a stamp

1. Upload an SVG with vector fills or solid strokes, or choose **Use example paw print**. Convert text and dashed strokes to filled outlines before importing.
2. Select **Debossing (raised stamp)** for a sunken impression or **Embossing (recessed die)** for a raised impression. Use **Mirror artwork for stamping** if the design needs to read correctly after pressing. Turn mirroring off if your SVG is already reversed.
3. In **2D design**, check the artwork against the backing plate. Use **Fit to base**, enter **Exact size** dimensions, or choose **Use SVG size** to keep the file’s physical scale. The SVG must declare its width and height. A solid backing grows as needed within the app’s size limits. The keyed insert has a fixed usable area. Drag the artwork or use **Artwork position and rotation** below the preview.
4. Select **Generate 3D stamp** and inspect the result in 3D. Use the view cube to check the stamp from above and from the sides. When the mesh passes validation, select **Download STL**.
5. Import the STL into Bambu Studio in millimeters. Confirm the base dimensions, slice it, and inspect the layers for missing strokes, filled holes, or lost islands. Test the print on a leather offcut.

The **First stamp guide** below the artwork upload walks through the paw-print example. A recessed die may need a matching positive die to make a raised impression.

## Check detail and save your work

- **Design thickness adjustment** under **Advanced settings** expands or contracts filled artwork. **Show thickness changes** in 2D highlights added material in blue and removed material in pink.
- **Check small features** highlights potentially narrow artwork in purple and small gaps or holes in green. The adjustable threshold starts at 0.4 mm. Treat it as an estimate of geometry to inspect in the slicer.
- **Projects & technical checks → Save project JSON** saves the SVG and settings together. **Local presets** saves reusable settings in the current browser. Applying a preset keeps the artwork you already have loaded.

## Add a stamp border

Open **Add border** and enable **Add a printable border**. The green ring in **2D design** is the printable border. Set its width with **Border thickness**.

- **Follow base** uses the backing plate outline. **Distance from base edge** measures inward to the outside of the ring. Zero puts the ring flush with the base.
- **Fit around artwork** uses the placed artwork after sizing, mirroring, and thickness adjustment. **Gap from artwork** measures to the inside of the ring. Choose a rectangle, rounded rectangle, ellipse, or SVG contour. Rounded rectangles and ellipses may use extra clearance at corners.
- **Use SVG outline as border** lets you select a closed, solid stroke with no fill. The selected outline becomes a border that follows its original path. Adjust thickness, height, and edge profile under **Add border**. The gap comes from the SVG.
- **SVG contour** follows the artwork's outer silhouette. Separate shapes may have separate rings, and letter counters receive no rings.

Borders are available for **Debossing (raised stamp)**. They default to Sharp and the artwork height. Under **Add border**, select **Chamfered** or **Rounded** to give the border its own edge profile. After generation, the status shows the applied edge size, including any reduction needed for a valid mesh. Choose **Add border → Border height → Custom height** to set the border relief independently. For a zero artwork gap, choose **Sharp** edges for both the artwork and border and use the same height so touching relief can join. If the ring overruns the plate or collapses, reduce the gap or thickness, adjust the artwork, or enlarge the base.

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

GitHub Pages publishes the root of `main`. Each deployment displays its commit SHA (shortened to seven characters) in the footer. This also works when Pages publishes a feature branch for a pull request preview. Use a feature branch and pull request for changes.

- [Implemented features](docs/IMPLEMENTED_FEATURES.md) for the current app capabilities.
- [Feature plan](docs/FEATURE_PLAN.md) for upcoming priorities and acceptance criteria.
- [Fixes and validation plan](docs/FIXES_PLAN.md) for open regressions, release checks, and verified fixes.

Open `index.html` in a modern WebGL-capable browser, or serve the checkout with `python3 -m http.server 8000` and open `http://localhost:8000`. Keep `polygon-geometry.js` beside `index.html`. The page loads Three.js and Clipper from CDNs.

With Node.js 24, run:

```sh
npm ci
npx playwright install chromium
npm test
```

Tests use local copies of the pinned browser libraries. Set `LEATHER_STAMP_CHROMIUM` to an existing Chromium executable if needed. GitHub Actions runs the polygon tests and Playwright suite on pull requests.
