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
| **Next focused PR — UX 1** | **Project actions and workflow clarity** | Place **Save project JSON** and **Load project JSON** immediately beneath Download STL in the primary action area; preserve project download/import behavior and IDs. Keep presets separately under a **Saved presets** panel and put expandable **Technical mesh details** near export status. Clarify modified/stale STL state when settings change. |
| **Following PR — UX 2** | **Preview navigation and persistent actions** | Replace the ambiguous 2D toggle with explicit **2D Design / 3D Preview** navigation; expose center/reset and precise position/rotation near the 2D view. Keep Generate/Download/Save/Load accessible in a sticky action area on desktop and sensible non-obstructing placement on mobile. |
| **Then — UX 3** | **Settings and help polish** | Visually separate artwork size from base size, simplify border enable/expand behavior, surface contextual help for mirroring and Design Offset, and check accessible keyboard/mobile behavior. Do not change geometry or existing defaults. |
| **After UX improvements** | **Independent border height** | Preserve *Same as artwork* as default. An advanced height control changes border relief independently without altering artwork depth, footprint, or gap; 2D/3D previews, saved project JSON, backward compatibility, and generated STL agree. Produce one closed, correctly oriented solid; reject invalid combinations. |
| **Following geometry PR** | **Independent border edge profiles** | Border Sharp remains default. Add Chamfered/Rounded border options independent of the artwork's edge profile, report effective bevel/radius if recovery is needed, and block invalid STL export. Cover rectangles, ellipses, and supported SVG contours with automated tests and sample slicer inspections. |
| **Next usability milestone** | **Leather impression preview** | Add a clearly labeled *approximate impression* view/toggle that reflects mirror state, raised/recessed polarity, border placement, and artwork. Do not imply realistic leather deformation or guaranteed impression quality. Check that the projection derives from current geometry. |
| **After more print samples** | **Calibrated built-in maker presets and print guide** | Build on existing **local presets**, not duplicate them. Only recommend printer/material/profile settings supported by documented stamp prints and leather impressions. Include orientation, top-surface finishing/ironing, sanding, pressing, and troubleshooting guidance; identify test conditions and limitations. |
| **Later high-value feature** | **Text and monogram generator** | Enter initials or short text and generate closed, outlined shapes from appropriately licensed fonts. Preserve counters, mirror/placement behavior, project files, and valid STL exports; avoid requiring an external SVG editor for simple personalization. |
| **Later** | **Backing-plate and mounting improvements** | Explore reinforced backing, ergonomic/press-compatible mounts, and alignment helpers only after checking real use cases. Preserve consistent dimensions, base clearance, and watertight output. |
| **Later** | **Borders for recessed dies** | Define impression polarity and cavity/raised behavior before implementation; validate depth, clearance, preview, and STL topology. |

## UX improvement plan (priority: next development sprint)

**Goal:** Make the existing features easier to discover and use without expanding geometry scope. Main flow: **Choose SVG → configure stamp → inspect 2D/3D → Generate → Download STL / Save project**. Preserve the familiar two-panel desktop layout and all functional controls.

### UX 1 — Quick wins: project actions and status (small, low-risk PR)

- Move **Save project JSON** and **Load project JSON** directly **below Download STL** in the primary action group, as two clearly labeled secondary buttons. Save and Load must remain available without generating a current STL. Keep the hidden JSON file input and existing handlers operational; avoid duplicate buttons elsewhere.
- Retain **Local presets** as a separate collapsible **Saved presets** section in the sidebar. Make the distinction explicit: **Project JSON** includes the SVG and complete settings; **preset** stores reusable settings for the currently loaded artwork.
- Replace the mixed **Projects & technical checks** section with focused groupings: presets in the settings sidebar and **Technical mesh details / Final checks** adjacent to export readiness. Keep beginner-facing warnings brief and technical details expandable.
- Give the build/export area clear states: **Ready to generate**, **Generating**, **Design changed — regenerate to download**, **Ready to export**, **Error — see details**. When any geometry-relevant control changes, invalidate stale STL and disable Download STL while leaving Save/Load functional. Distinguish potential printability warnings from actual mesh errors.
- Do not imply mesh validation guarantees successful printing or a good leather impression.

**UX 1 acceptance:** Project save/load and legacy JSON behave unchanged; project buttons are visible near Download STL at common desktop and mobile widths; STL export remains blocked when stale/invalid; loading SVG/project and changing a setting update status correctly; no duplicate project actions; accessible labels and focus order.

### UX 2 — Preview and navigation (separate PR)

- Use an explicit, accessible **2D Design | 3D Preview** segmented/two-tab switch with a visible active state, keyboard access, and appropriate disabled/empty 3D state before generation. Preserve camera views, pan/orbit, zoom, and Fit view.
- Surface **Center artwork**, **Reset position**, and a discoverable rotation/position control near the 2D preview while retaining precise numerical editing. Reuse existing transform logic; do not introduce a full vector editor.
- Keep primary Generate/Download/project actions discoverable during long sidebar scrolling (sticky on desktop if it does not obscure the preview); on small screens do not allow the action bar to cover form controls or prevent scrolling.
- Keep user context when switching between 2D and 3D views. Editing in 2D clearly marks the existing 3D model stale until regenerated.

**UX 2 acceptance:** no incorrect stale 3D exports; view switch works by mouse/touch/keyboard; position/rotation updates and snapping agree with STL output; no clipping/overlap at narrow mobile widths; switching does not reset artwork, project settings, or 3D camera unintentionally.

### UX 3 — Controls, language, and onboarding (separate PR)

- Group **Artwork dimensions** and **Backing-plate dimensions** under distinct headings. Keep Fit to base vs Exact size and aspect lock understandable; display units in mm and explain when exact artwork dimensions cause the base to grow.
- Replace the current two-step **Add border** accordion + enable checkbox interaction with one obvious border enable control and contextual expand/collapse. Reveal thickness, gap, placement, and shape when enabled; clarify **gap from artwork** vs **distance from base edge**. Preserve advanced border height and edge profiles when implemented.
- Use short contextual explanations for impression polarity, mirroring, artwork edge profile, Design Offset, SVG contour, and minimum feature checks. Keep the First stamp guide available but out of the primary workflow.
- Confirm contrast, touch targets, input labels, logical focus and tab sequence, error announcements, and responsive layouts across desktop/tablet/mobile. Avoid icon-only buttons without names.
- Avoid noisy auto-generation on every slider movement; retain an explicit Generate action unless performance testing supports a safe alternative.

**UX 3 acceptance:** a new user can load the paw print, understand mirror/size/border choices, switch previews, generate and export without opening technical settings; all existing presets and old project files work; no geometry regressions; Playwright tests cover responsive layout, keyboard navigation, save/load, stale-export behavior, and border controls.

### Implementation constraints and release checks

1. Keep each UX milestone in a **focused branch and pull request**; avoid mixing with border geometry changes. Prefer retaining stable HTML element IDs/event handlers and adding UI adapters only where needed.
2. Update onboarding text and tests for relocated buttons and redesigned states; preserve functionality of GitHub Pages hosting and browser-only file processing.
3. Run the existing polygon and Playwright suites. Manually check a full SVG → 2D → 3D → STL path and project save/reload on desktop and mobile.
4. Update [IMPLEMENTED_FEATURES.md](IMPLEMENTED_FEATURES.md) only after merge, and [FIXES_PLAN.md](FIXES_PLAN.md) for new reproducible regressions.

## Physical test protocol

Use a representative fine-detail design and a larger logo. Keep SVG, size, relief, printer settings, leather type/moisture, and press conditions fixed when comparing geometry variants. Change **one variable at a time**.

1. Compare Sharp, Chamfered, and Rounded with the same artwork; examine line definition, corners, fine lettering, and any leather damage or unwanted sharp transitions.
2. Compare an un-ironed print, ironed print, and lightly sanded print where practical. Examine top-face flatness, altered detail, and the resulting impressions; ironing affects exposed top surfaces, not sidewalls.
3. Inspect impressions both immediately and after drying. Record whether small counters, gaps, and border clearances remain visible.
4. Repeat on a bordered design, including a contour border where relevant. Confirm it imports cleanly in the slicer and that the border and artwork create the intended impression.
5. Save settings and findings as candidate presets, but label them **experimental** until repeatable.

Suggested record per trial: app commit, project/SVG, printer/nozzle, filament, orientation, layer height, ironing/sanding, edge profile and effective width, artwork and border relief, leather type/condition, press method/time, slicer warnings, photograph(s), and dried-impression assessment.

## Longer-term backlog (not scheduled)

- **Custom keyed holder and insert sizes:** Keep the current nominal 40 × 40 mm keyed insert for now. If larger or wider artwork regularly exceeds the usable area, prototype one additional matched holder and insert size before offering arbitrary dimensions. Show the maximum centered artwork size after margin, identify compatible holders and inserts by size, and verify fit and press performance for each new size.

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
