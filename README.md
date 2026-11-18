# Leather Stamp Studio

Browser-based SVG-to-STL utility for 3D-printable leather stamps, deployed via GitHub Pages.

## Stable release: V3.0

### Features
- Load SVG artwork, including compound paths, holes, and detailed designs.
- Raised (debossing) and recessed (embossing) geometry.
- Independent artwork width/height with proportional lock, or fit to the backing plate.
- Adjustable backing plate, relief depth, mirroring and edge style (Sharp, Chamfered, Rounded).
- Drag-and-drop SVG import, 3D preview, Fit View, and STL download.
- Save/load project JSON and clear stale-preview/export status.
- Chamfer/radius size recovery and geometric repair of narrowly scoped near-coincident boundary vertices and tiny slivers.
- Mesh validation blocks STL export when boundaries, non-manifold edges or degenerate faces remain.

### Validation and release history
The user tested three SVG designs (Dacha Craft logo, Bunny, Paw print) in Sharp, Chamfered and Rounded profiles. All nine combinations passed built-in mesh checks. The user additionally confirmed successful Bambu Studio imports for rounded Bunny, rounded Dacha Craft, chamfered Bunny and rounded Paw print, with no repair warnings. Physical leather impression and long-run durability tests are not yet complete.

Mesh validation is a basic topology check and does not guarantee perfect printability or strength for every SVG.

### Run
Open `index.html` in a modern browser. Some dependencies are loaded from external CDNs, so an internet connection may be required.

### Hosting
GitHub Pages deploys the `main` branch root `index.html` at:
https://disneymax.github.io/leather-stamp-studio/

### Development
Use a feature branch and pull request for future changes; preserve `main` as the tested release.

### Automated tests (V3.1)
Run `npm ci`, `npx playwright install chromium`, and `npm test`. Set
`LEATHER_STAMP_CHROMIUM` to use an existing Chromium executable. The tests
serve the production page and its pinned library versions locally. They cover
the browser controls, project files, and the topology of downloaded STLs.
