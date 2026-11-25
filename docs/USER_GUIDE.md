# Leather Stamp Studio user guide

Turn an SVG into a printable leather stamp or die. Open the app in a WebGL-capable browser with internet access for its libraries. Artwork, project files, and mesh generation stay in the browser. Dimensions and STL exports use millimeters. [Open Leather Stamp Studio](https://disneymax.github.io/leather-stamp-studio/)

- [Make your first stamp](#make-your-first-stamp)
- [Import and size artwork](#import-and-size-artwork)
- [Position, preview, and check detail](#position-preview-and-check-detail)
- [Choose the stamp construction and edges](#choose-the-stamp-construction-and-edges)
- [Add a decorative border](#add-a-decorative-border)
- [Use a keyed modular insert](#use-a-keyed-modular-insert)
- [Align a laser cut to a stamp](#align-a-laser-cut-to-a-stamp)
- [Combine features](#combine-features)
- [Save, export, and troubleshoot](#save-export-and-troubleshoot)

## Make your first stamp

1. Select **Use example paw print**. Keep **Solid stamp**, **Debossing (raised stamp)**, **Sharp**, and **Fit to base**.
2. Keep the default rectangular backing at 40 × 40 mm. The default backing thickness is 6 mm, artwork margin is 4 mm, and relief depth is 1.5 mm.
3. Open **2D Design** to inspect the artwork. Try **Approximate leather impression** to see the leather-facing orientation.
4. Select **Generate 3D stamp**. Inspect the model and select **Download STL** when the status says **Ready to export**.
5. Import the STL into your slicer at millimeter scale. Confirm its size, inspect the top layers, and test it on a leather offcut.

The **First stamp guide** at the bottom of the settings sidebar is available in the app.

## Import and size artwork

Choose or drop an SVG. Solid fills, solid strokes, and compound paths can become relief. For example, import a filled logo with a stroke-only heart around it to print both, or assign the heart as a separate border. Convert text to paths and expand dashed strokes into filled outlines before export from your vector editor. Use vector shapes in place of raster images, filters, or linked symbols.

| Artwork sizing | When to use it | Example |
| --- | --- | --- |
| **Fit to base** | The backing dimensions set the working area. The app fits the artwork inside the margin. | On a 40 × 40 mm rectangle with a 4 mm margin, a square design fits within 32 × 32 mm. |
| **Exact size** | You know the dimensions of the artwork. **Keep original proportions** updates the other dimension as you edit. | Set a square logo to 30 mm wide with a 4 mm margin. The 40 mm base already gives it room. A 36 mm square requires at least 44 mm of backing. |
| **Use SVG size** | The SVG declares fixed width and height and you want its physical scale. Blank space in the canvas can make the artwork footprint smaller than the declared size. | Artwork that fills a 120 × 99.73 mm SVG canvas keeps those dimensions. A solid rectangle can grow to 128 × 108 mm with the default margin. |

The app can grow a solid backing for exact-size edits and native SVG sizing, within its size limits. A keyed insert has a fixed area. If a native-size logo is too large for it, use **Fit to base**, set a smaller **Exact size**, or choose **Solid stamp**. The dimensions shown summarize the sized artwork and do not include every outward change made by a thickness adjustment or a border.

## Position, preview, and check detail

- **Artwork position and rotation** is below the 2D preview. Drag the artwork in the stamp view, or enter horizontal and vertical offsets and clockwise rotation. **Center artwork** clears the offsets. **Reset position and rotation** also clears rotation. For example, enter a +2 mm horizontal offset to shift a centered logo to the right on the stamp face.
- **Mirror artwork for stamping** reverses the stamp face so lettering from a normally oriented SVG reads correctly in leather. For an SVG already reversed for stamping, turn it off. Use an asymmetric logo or lettering to check the result.
- **Approximate leather impression** in **2D Design** turns the stamp face over. It shows debossing as recessed and embossing as raised, with any decorative border, laser cut line, and registration marks in the leather-facing orientation. Return to the stamp view to drag artwork and use the detail overlays. The view illustrates shape and orientation. Material, pressure, and finishing affect the actual depth and appearance.
- **Design thickness adjustment** under **Advanced settings** changes the filled features without scaling the design. Try **+0.05 mm** on thin lettering and compare its counters with **0.00 mm**. Try **−0.05 mm** if small gaps need to open. **Show thickness changes** marks added material in blue and removed material in pink. Inspect holes and small islands after each change.
- **Check small features** estimates narrow artwork in purple and small gaps or holes in green. Start at **0.4 mm** and use the highlights to decide which areas to inspect in the slicer.
- **3D Preview** shows the generated mesh. Orbit, zoom, or pan. Use **Top**, **Front**, **Right**, and **Isometric** views to inspect the face and sides, or **Fit view** to bring the whole stamp into view.

## Choose the stamp construction and edges

| Control | What it does | Example |
| --- | --- | --- |
| **Debossing (raised stamp)** | Raised artwork on the tool makes a recessed impression in leather. | Use it for a maker’s mark pressed into the surface. |
| **Embossing (recessed die)** | A recessed cavity gives the leather room to form a raised impression. | Try a simple monogram on an offcut. A matching positive counter-die may be needed for the leather to rise into the recess. |
| **Solid stamp** | Exports the relief and backing together. Choose rectangular, rounded rectangular, elliptical, or convex SVG contour backing. | Use a rounded rectangular backing for a rounded badge, or a contour backing for an irregular logo silhouette. |
| **Keyed modular insert** | Exports the artwork on a keyed insert for a reusable holder. | Print a single holder and reuse it for several small logos. See the dimensions below. |
| **Sharp**, **Chamfered**, **Rounded** | Changes the raised artwork edge. **Edge size** under **Advanced settings** controls the step or rounding. | Compare Sharp and Chamfered on a copy of the same logo. Check the applied edge size after generation. |
| **Base thickness**, **Impression depth**, **Artwork margin** | Set the thickness of the solid backing, the relief or cavity depth, and the clearance used when sizing the artwork. | Start with a 6 mm solid backing and 1.5 mm relief. Increase the margin if a border or registration marks need space. |
| **Mesh detail controls** | Set curve detail, curve accuracy, and SVG simplification. | If a small detail disappears, inspect the SVG and try lowering simplification or the curve accuracy value. Very small features can still be below your printer’s practical resolution. |

Recessed cavities use sharp walls. A solid cavity must be shallower than its backing. A keyed cavity has a separate depth limit. If the app reduces a requested artwork or border edge size to recover a valid mesh, **Technical mesh details** shows the applied size. Review it before printing.

## Add a decorative border

Turn on **Add border** for a debossing stamp. The green ring in **2D Design** shows the border footprint. Set **Border thickness** to control the width of the ring. Set **Border height → Custom height** to make it higher or lower than the artwork. Select its own **Border edge** and edge size if you want to soften it. A taller border can contact the leather earlier, so compare both impressions on an offcut.

| Placement | Where it measures from | Example |
| --- | --- | --- |
| **Follow base** | **Distance from base edge** measures inward from the backing edge to the ring’s outside. | Choose a rectangular base, a 1 mm inset, and a 1 mm border. Zero inset places the ring at the base edge. |
| **Fit around artwork** | **Gap from artwork** measures to the inside of the ring. | Choose **Rounded rectangle**, a 2 mm gap, and 1 mm thickness for a badge frame. Try **SVG contour** to follow a free-form outline. Disconnected artwork can produce separate rings. |
| **Use SVG outline as border** | Uses a selected closed solid stroke or a filled ring with one opening. The SVG sets the path and spacing. | Select the heart around a logo. Try 1 mm thickness and 1.5 mm height, then compare a thicker ring or a rounded edge. |

A zero artwork gap in **Fit around artwork** requires **Sharp** edges on the artwork and border and equal heights. With an SVG outline, keep the border from overlapping the artwork. Reduce border thickness or the positive artwork adjustment if they overlap. If a ring runs past the backing, make room with a larger solid base, a smaller design, or a thinner border.

## Use a keyed modular insert

1. Choose **Stamp construction → Keyed modular insert**. The nominal insert is 40 × 40 mm and uses the 44 × 44 mm keyed holder. The app centers the design on the seated holder, accounting for the rear stop.
2. For a debossing logo, choose **Fit to base** and check the size summary. The centered face area starts at **35 × 35.8 mm** before margin. A 4 mm margin leaves up to **27 × 27.8 mm**, and a 1 mm margin leaves up to **33 × 33.8 mm**. The actual artwork fits within those limits according to its proportions.
3. Generate and use **Show holder** in 3D to check the assembly. Download the **insert STL** and the **keyed holder STL** separately. Reuse a compatible holder for later inserts.
4. For **Embossing**, the insert face stands **1.5 mm above the holder rim**. Choose a **0.2–2.5 mm** cavity depth to leave at least **1.5 mm** beneath it. Check the recessed die on an offcut.

For a print example, use the tested Bambu Lab A1 starting settings for the **2.5 mm debossing backing** in the prototype notes. That setup uses 20 bottom shell layers at 0.12 mm layer height and a 0.20 mm first layer. Recheck the shell when the part thickness or layer height changes. The same notes cover the holder fit, sample parts, and the observed print-time savings. [Modular insert prototype and Bambu Lab A1 settings](../prototypes/modular-insert/README.md)

## Align a laser cut to a stamp

1. Start with **Solid stamp** and **Debossing**. Open **Laser cut registration** and enable **Add registration marks to the stamp**.
2. Start with a **3 mm cut offset** and **2 mm mark clearance**. The cut follows the exterior of the artwork and, when present, the outside of the decorative border. The cross and ring are printed on scrap outside the cut. Mark clearance measures from the cut line to the nearest mark edge.
3. Check **2D Design**. The dashed line shows the cut and cyan shows the marks. If the app says the backing is too small, use **Exact size** or **Use SVG size** before enlarging the solid backing so artwork scale stays fixed. With **Fit to base**, increasing the margin can make room.
4. Generate and download the STL and **laser layout SVG**. The SVG combines the red cut path and blue alignment marks in named groups. It uses millimeters and the same orientation as the impression preview.
5. Stamp an offcut. In the laser software, align the blue cross and ring to their physical impressions and **disable output for the blue group** before cutting. SVG colors and group names do not control the laser. **Download cut SVG** and **Download alignment SVG** are also available. If you import separate files, keep their scale and shared origin, especially if your laser software centers each import independently.
6. Verify the margin and confirm both marks land in scrap. The exporter generates one exterior cut contour. Interior artwork holes do not produce additional cut paths.

## Combine features

| Goal | Settings to combine | What to check |
| --- | --- | --- |
| **Beginner’s stamp** | Paw print + solid rectangle + Fit to base + Sharp | 2D footprint, validated STL, and a test impression. |
| **Branded maker’s mark** | SVG lettering + Exact size + Mirror artwork + decorative frame | Text reads correctly in the leather view. Counters stay open after any thickness adjustment. |
| **Heart-shaped leather patch** | Heart-outlined SVG + Use SVG size + Use SVG outline as border + solid debossing + laser registration | Keep the heart and inner logo separate. Fit the backing around the marks. Use a 3 mm cut offset from the outer heart edge and confirm the cut margin on an offcut. |
| **Interchangeable logo inserts** | Keyed modular insert + Debossing + Fit to base + a small artwork margin | Check the centered design in the assembly. Save a preset for reuse across SVGs and print only new inserts once the holder is ready. |
| **Raised leather monogram** | Solid or keyed construction + Embossing + mirrored lettering + impression preview | Confirm lettering reads correctly and the raised shading matches the chosen impression. Test whether a positive counter-die is needed. |

Decorative borders are available for solid and keyed **debossing** stamps. Laser registration is available for **solid debossing**. Both constructions support the leather impression preview and project saving.

## Save, export, and troubleshoot

- **Save project JSON** keeps the SVG and its settings together. Use it to reopen a specific job or keep an editable copy before printing. **Load project JSON** restores the design. Project actions remain available before generation.
- **Saved presets** stores reusable settings locally in the current browser. For example, save a **Keyed debossing** preset, upload the next logo, and apply the preset to that artwork. Use project JSON for a portable copy of the artwork and settings.
- **Generate 3D stamp** validates the mesh. Changing the design marks existing geometry stale and disables its export until it is generated again. **Technical mesh details** reports open boundaries, non-manifold edges, winding conflicts, and degenerate triangles. A passing mesh is ready for slicer inspection.
- After downloading, verify the model size and inspect the slices where the backing meets the relief. If the keyed backing prints poorly at the infill-to-shell transition, compare the exact settings in the [Bambu Lab A1 notes](../prototypes/modular-insert/README.md#bambu-lab-a1-print-recommendations).

| Problem | Check |
| --- | --- |
| **Use SVG size** is unavailable | Check for fixed SVG width and height, or enter **Exact size** dimensions. |
| **No eligible SVG border outline** | Check whether the SVG has a closed stroke with no fill or a filled ring with one opening. Otherwise, use **Fit around artwork**. |
| Border or artwork extends beyond the backing | Check placement and rotation in 2D. Increase a solid backing or reduce artwork, offset, or border size. |
| Registration marks need a larger backing | Read the suggested dimensions in the status, then enlarge a fixed-size solid backing or make space with the artwork margin. |
| A beveled edge fails mesh checks | Reduce the edge size or choose Sharp explicitly. Inspect narrow features and review **Technical mesh details**. |
| The leather impression reads backward | Check mirroring in **Approximate leather impression**, then regenerate before exporting. |
| A download button is disabled | Generate a fresh stamp and check the status. The laser SVGs require a valid stamp with registration enabled. |
