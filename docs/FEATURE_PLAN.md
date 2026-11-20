# Feature plan

Updated November 20, 2026. Leather Stamp Studio is a free, browser-based SVG-to-STL tool for leatherworkers. Prioritize reliable impressions, simple workflows, and features that save makers time over turning the app into a general-purpose vector/CAD editor.

See [implemented features](IMPLEMENTED_FEATURES.md) before planning new work, and [fixes and validation](FIXES_PLAN.md) for unresolved regressions and release checks.

## Current baseline and physical feedback

The current app already supports SVG import and compound paths, 2D positioning and rotation, 3D preview, raised/recessed generation, design-thickness adjustment, four backing shapes, optional stamp borders (including Fit around artwork and SVG contour), small-feature checks, local presets, project JSON, onboarding, and STL mesh validation. Do not re-plan these as new features.

**Initial user testing, November 2026:** Several models sliced in Bambu Studio without reported errors, physical test prints looked good, and impressions into leather looked good after light sanding of the printed stamping face. This is encouraging **initial validation**, not proof that every shape, bevel, border, or material combination works. Top-surface ironing/finish still needs tuning, and the user's preference for Sharp versus Chamfered artwork edges is not settled. Do not assert that the documented Bunny regression, all bordered fixtures, or the ±0.05 mm adjustment cases have been manually cleared.

## Proposed sequence

| Order | Workstream / feature | Outcome and acceptance criteria |
| --- | --- | --- |
| **Now — validation** | **Repeatable print-and-impression trials** | Print the same artwork with Sharp, Chamfered, and Rounded profiles under otherwise comparable settings; compare ironing against light sanding; inspect the stamp and the dried leather impression. Record filament, printer/nozzle, layer height, orientation, ironing, design/relief dimensions, leather preparation, and press conditions. Capture photos and observations. Check remaining fixture-specific items in [FIXES_PLAN.md](FIXES_PLAN.md) separately. |
| **Next focused PR** | **Independent border height** | Preserve *Same as artwork* as default. An advanced height control changes border relief independently without altering artwork depth, footprint, or gap; 2D/3D previews, saved project JSON, backward compatibility, and generated STL agree. Produce one closed, correctly oriented solid; reject invalid combinations. |
| **Following PR** | **Independent border edge profiles** | Border Sharp remains default. Add Chamfered/Rounded border options independent of the artwork's edge profile, report effective bevel/radius if recovery is needed, and block invalid STL export. Cover rectangles, ellipses, and supported SVG contours with automated tests and sample slicer inspections. |
| **Next usability milestone** | **Leather impression preview** | Add a clearly labeled *approximate impression* view/toggle that reflects mirror state, raised/recessed polarity, border placement, and artwork. Do not imply realistic leather deformation or guaranteed impression quality. Check that the projection derives from current geometry. |
| **After more print samples** | **Calibrated built-in maker presets and print guide** | Build on existing **local presets**, not duplicate them. Only recommend printer/material/profile settings supported by documented stamp prints and leather impressions. Include orientation, top-surface finishing/ironing, sanding, pressing, and troubleshooting guidance; identify test conditions and limitations. |
| **Later high-value feature** | **Text and monogram generator** | Enter initials or short text and generate closed, outlined shapes from appropriately licensed fonts. Preserve counters, mirror/placement behavior, project files, and valid STL exports; avoid requiring an external SVG editor for simple personalization. |
| **Later** | **Backing-plate and mounting improvements** | Explore reinforced backing, ergonomic/press-compatible mounts, and alignment helpers only after checking real use cases. Preserve consistent dimensions, base clearance, and watertight output. |
| **Later** | **Borders for recessed dies** | Define impression polarity and cavity/raised behavior before implementation; validate depth, clearance, preview, and STL topology. |

## Physical test protocol

Use a representative fine-detail design and a larger logo. Keep SVG, size, relief, printer settings, leather type/moisture, and press conditions fixed when comparing geometry variants. Change **one variable at a time**.

1. Compare Sharp, Chamfered, and Rounded with the same artwork; examine line definition, corners, fine lettering, and any leather damage or unwanted sharp transitions.
2. Compare an un-ironed print, ironed print, and lightly sanded print where practical. Examine top-face flatness, altered detail, and the resulting impressions; ironing affects exposed top surfaces, not sidewalls.
3. Inspect impressions both immediately and after drying. Record whether small counters, gaps, and border clearances remain visible.
4. Repeat on a bordered design, including a contour border where relevant. Confirm it imports cleanly in the slicer and that the border and artwork create the intended impression.
5. Save settings and findings as candidate presets, but label them **experimental** until repeatable.

Suggested record per trial: app commit, project/SVG, printer/nozzle, filament, orientation, layer height, ironing/sanding, edge profile and effective width, artwork and border relief, leather type/condition, press method/time, slicer warnings, photograph(s), and dried-impression assessment.

## Longer-term backlog (not scheduled)

- **Lightweight vector editor:** selection and transform of individual SVG elements, duplication/deletion, history, and edited SVG export. **Full node/Bézier editing is explicitly deferred**; external vector editors remain appropriate for advanced artwork.
- **Batch stamp layouts:** multiple stamps on a print plate and/or grouped exports; consider only when repetitive production warrants the complexity.
- **Templates and extra exports:** evaluate from actual maker requests, with privacy, accessibility, and low operating costs in mind.

## Development and release rules

- Keep the current production app usable while developing new features in focused branches and pull requests.
- For geometry work, add automated browser/polygon regression coverage, including compound paths, holes, offsets, mirroring, saved projects, and closed, consistently oriented STL edges.
- A passing topology check does not prove printability. Record **automated mesh results**, **slicer inspection**, **physical prints**, and **leather impressions** as distinct evidence.
- Preserve legacy projects and existing defaults. Advanced controls should not overwhelm first-time users.
- Prefer offline-capable, privacy-conscious, free browser workflows; avoid mandatory accounts or paid export restrictions.
- Track reproducible bugs and outstanding manual release checks in [FIXES_PLAN.md](FIXES_PLAN.md). Update [IMPLEMENTED_FEATURES.md](IMPLEMENTED_FEATURES.md) only when a feature is actually merged.
