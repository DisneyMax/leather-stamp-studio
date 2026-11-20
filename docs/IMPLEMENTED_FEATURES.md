# Implemented features

Updated November 20, 2026. This reference covers the features included in the merged stamp-border release. [Live app](https://disneymax.github.io/leather-stamp-studio/) · [Stamp border PR](https://github.com/DisneyMax/leather-stamp-studio/pull/8)

## Artwork and sizing

- Upload or drop a filled SVG, or load the included paw print. SVG import handles compound paths with holes and nested islands. Convert text and strokes to outlines before import.
- Choose **Debossing (raised stamp)** or **Embossing (recessed die)**. Mirror the design when the leather impression needs to read in the original orientation.
- Fit artwork to the plate, or set exact dimensions with optional aspect lock. Exact-size edits grow the base as needed to preserve the selected margin, within the supported dimensions.
- Choose a rectangular, rounded rectangular, elliptical, or artwork-contour base. Base thickness, impression depth, margin, design thickness adjustment, and mesh details are under **Advanced settings**.
- Use **Sharp**, **Chamfered**, or **Rounded** edges on raised artwork. Sharp is the default. The app can reduce a bevel width to recover a valid mesh and reports the applied width.

## 2D and 3D previews

- SVG upload opens **2D design**. The view shows the artwork footprint and backing plate from the same contours used for STL generation.
- Drag artwork with center snapping, or enter horizontal and vertical offsets and clockwise rotation under **Advanced settings → Artwork position and rotation**. Center and reset controls are available there.
- **Generate 3D stamp** opens the 3D view. Orbit, zoom, pan, and use the Top, Front, Right, and Isometric shortcuts or **Fit view**.

## Stamp borders

- **Follow base** offsets the ring inward from the backing plate. **Fit around artwork** frames the final sized and positioned design with a rectangle, rounded rectangle, ellipse, or SVG contour.
- SVG-contour frames follow the outer silhouette. Internal counters receive no rings, and disconnected artwork can produce separate rings attached to the common base.
- The green preview ring becomes part of the same solid. Borders on raised stamps use sharp edges and the artwork relief height. A zero artwork gap requires Sharp artwork edges.

## Printability and export

- **Show thickness changes** highlights added material in blue and removed material in pink. A printability note appears when the thickness adjustment leaves fewer holes or filled regions.
- **Check small features** estimates narrow artwork and small gaps or holes at an adjustable threshold, with purple and green overlays.
- STL export requires a current mesh that passes boundary, manifold-edge, orientation, and degeneracy checks. Technical mesh details are expandable.
- STL filenames include the SVG name, impression type, effective artwork edge, and base shape. Project files save the source SVG name for future exports.

## Projects and onboarding

- **Save project JSON** stores artwork and settings together. Older project files load with borders off when they have no border fields.
- **Local presets** save reusable settings in the current browser and apply them to the loaded artwork.
- **First stamp guide** walks through the paw print, impression choice, 2D checks, export, and slicer inspection.

See the [feature plan](FEATURE_PLAN.md) for upcoming work and the [fixes plan](FIXES_PLAN.md) for regression and manual validation status.
