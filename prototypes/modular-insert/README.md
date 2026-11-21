# Modular insert fit prototype

This Phase A prototype tests the **experimental keyed-40-v1** interface. The sample files are in [samples/](samples/). All dimensions are in millimeters. The two raised patterns are a ring with an open center and an asymmetric pattern for checking orientation and registration.

| Sample | Purpose |
| --- | --- |
| `holder-keyed-40-v1-0p20.stl` | 44 × 44 × 6 reusable holder with a 0.20 mm lateral gap per side |
| `holder-keyed-40-v1-0p25.stl` | Same holder with 0.25 mm lateral clearance per side for the full-length fit comparison |
| `holder-keyed-40-v1-0p35-side.stl` | 0.35 mm per side, 0.20 mm overhead |
| `holder-keyed-40-v1-0p25-side-0p35-overhead.stl` | 0.25 mm per side, 0.35 mm overhead |
| `insert-ring-keyed-40-v1.stl` | 40 × 40 overall envelope with a 2.5 mm backing and 1.5 mm ring relief |
| `insert-asymmetric-keyed-40-v1.stl` | Same interface with a different raised pattern |
| `fit-coupon-keyed-40-v1.stl` | 14 × 132 coupon with three short receivers |
| `fit-slider-keyed-40-v1.stl` | Short key that fits all three coupon tracks |

## How the parts mate

The holder opens at X=0. The insert slides along +X until it contacts the rear stop. Orient the sample with the relief facing out of the pocket. The left and right tongues extend 1.0 and 1.6 mm from the backing respectively, which keys the insert against an end-for-end reversal. The tongues begin 0.25 mm above the underside and have 0.20 mm of overhead clearance. The first 4 mm of the entry has no rail, leaving the insert edges accessible while preserving the entire pocket floor.

The central backing lies on a 3.5 mm continuous floor. Only the guide tongues sit above it. With the insert seated, its unraised face and the holder rim are both nominally 6 mm above the outer holder face. The relief extends another 1.5 mm towards the leather. During pressing, place the flat outer holder face against the platen and the relief towards the leather.

## Print and test

1. Import the coupon and slider in Bambu Studio at the supplied orientation and verify their dimensions. The holder and coupon have their flat outer faces on the bed. The inserts and slider have their flat central undersides on the bed. Inspect layer continuity, the underside of the rail lips, and clearance cuts before printing. Straight rail overhangs and first-layer fit still need slicer and print validation.
2. With rails facing up and the coupon openings towards you, rotate the coupon so insertion moves away from you. The tracks read left to right **0.25, 0.20, 0.15 mm per side**. Mark them before handling the coupon. Slide the key into each track gently. Check play, binding, seating, and removal. The open end is intentionally accessible.
3. The 0.25 mm-per-side full-length test still bound in use. Compare the two new holders with the same insert and print settings, at hand pressure before pressing. The side-clearance version widens the full track, while the overhead version gives the tongues more room vertically. Check for drag from entry to stop and for unwanted play at the seated position.

The initial coupon trial fit at all three clearances, while the follow-up fit was reported very snug and difficult to remove. Record whether each insert moves freely through the track or binds near the stop. A short coupon cannot reveal full-length warp or binding.
4. Check both full inserts for flat seating and repeatable registration. Start with gentle pressure on a leather offcut. Stop if the holder lip leaves a mark or if either part slips, flexes visibly, cracks, or binds. Inspect the parts after each early swap and press. This prototype has no tested load rating.
5. Record printer, nozzle, filament, layer height, walls, infill, fit, swaps, and presses. Compare slicer time/material and dried impressions with an equivalent solid stamp. Record results before choosing a default fit.

## Observed fit

The full-size holder with **0.25 mm clearance per side and 0.35 mm overhead** had a near-perfect hand fit in the latest trial. After a couple of insertion cycles, the insert slid freely in and out. The user also confirmed that the follow-up leather-offcut press check went well. This is the preferred clearance for the tested setup. Longer-term wear and fit across other printers and materials remain unverified.

## Print-test settings

| Setting | Reported value |
| --- | --- |
| Layer height | 0.12 mm |
| Infill | 80% gyroid |
| Wall count | 5 |
| Ironing speed | 30 mm/s |
| Ironing flow | 30% |

## Observed print times

Printing the insert and reusable base together took about **60 minutes** in the reported test. Printing just the insert took about **20 minutes**. Once the base is printed, reusing it saves about **40 minutes per additional insert**, a **67% reduction** compared with printing both parts again.

## Reproduce and verify

```sh
node prototypes/modular-insert/generate.mjs prototypes/modular-insert/samples
node --test prototypes/modular-insert/generate.test.mjs
```

Tests read the emitted binary mesh data and check closed edges, consistent winding, a connected shell, outward normals, and bounds. Assembly tests check insertion clearance through the full slide, keyed orientation, stop contact, floor support, and nominal rim clearance. The sample inserts use fixed geometry.

## SVG-driven inserts

Choose **Keyed modular insert** under **Stamp construction**. This mode uses the fixed keyed-40-v1 backing and the tested 0.25 mm per side / 0.35 mm overhead holder. Choose **Debossing (raised stamp)**. Generate the insert from the current SVG, then download it separately from the reusable holder. **Show holder** toggles the assembled 3D preview. The holder STL uses its original bed-facing orientation.

The seated insert extends from X=−22 to +18 mm relative to the center of the 44 mm holder. The artwork origin sits at the holder center, 2 mm toward the rear stop from the insert envelope center. The unequal keys affect the backing profile and do not shift the artwork origin in Y. Position controls are offsets from the holder center. The 35 × 35.8 mm centered face area (before artwork margin) leaves clearance at the backing edge. A **Follow base** border follows this centered area. Exact size never expands the fixed backing. A design outside the face area blocks insert export.
