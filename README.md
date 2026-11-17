# Leather Stamp Studio

Browser-based SVG-to-STL tool for making 3D-printable leather stamps.

## Current release: V2.7

- Import SVG designs, including compound paths and enclosed holes.
- Create raised (debossing) or recessed (embossing) stamp geometry.
- Choose rectangle, rounded rectangle, circle, or SVG-contour bases.
- Adjust base thickness, relief depth, mirroring, and edge profiles.
- Preview stamp geometry and export STL.
- Save and load project configurations.
- Validate generated meshes before export.
- Automatically reduce a chamfer width when necessary for valid topology, reporting the requested and applied widths.

## Run locally

Download `index.html` and open it in a modern browser. JavaScript dependencies may load from external CDNs, so internet access can be required.

## Validation history

Dacha Craft logo V2.7 test: 14,556 triangles, zero boundary edges, zero non-manifold edges, and zero degenerate triangles. Requested 0.250 mm chamfer automatically reduced to 0.175 mm. Bambu Studio imported the STL without repair warnings. Physical print and leather impression testing are pending.

## GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, then select **main** and **/(root)**. GitHub Pages will serve `index.html`.

Basic mesh validation does not guarantee print quality or physical strength.
