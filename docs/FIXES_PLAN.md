# Fixes and validation plan

Updated November 20, 2026. Track reproducible bugs in GitHub Issues and use this file to prioritize work and record validation gaps.

## Open regression

- [ ] **Easter Bunny Mail Stamp bevels.** [Issue #2](https://github.com/DisneyMax/leather-stamp-studio/issues/2) reports that Sharp worked while Chamfered and Rounded failed in an earlier build. Obtain the original SVG or a project JSON if needed. Rerun all three profiles on the current build and record any applied bevel recovery. If the failure reproduces, add a regression fixture and retain STL export blocking for invalid meshes.

## Release checks

- [ ] **Slicer and print checks for stamp borders.** Inspect bordered exports for the paw print and Dacha Craft in Bambu Studio, and include Bunny when the fixture is available. Check dimensions, repair warnings, layer continuity, and the space between the border and artwork. Print a representative stamp and press it into a leather offcut.
- [ ] **Dacha Craft thickness adjustment.** Inspect both +0.05 mm and −0.05 mm adjusted exports in the slicer. Check narrow details, holes, and the recovered edge on the thinned design.
- [ ] **Required CI.** GitHub Actions already runs the polygon and Playwright tests on pull requests. Decide whether both should be enforced through the existing **Playwright tests** status check before merging to `main`.

For a failed build, record the app commit or branch, browser, SVG or project JSON, exact steps and settings, and **Technical mesh details**. Keep private artwork out of public reports unless its owner approves sharing it. Record slicer import and physical test results separately from mesh validation.

## Recent fixes to keep covered

| Regression | Verification |
| --- | --- |
| Dacha Craft bevel generation at ±0.05 mm | Sharp, Chamfered, and Rounded exports passed closed-edge and orientation checks. Slicer inspection of those adjusted exports is pending. [Run](https://github.com/DisneyMax/leather-stamp-studio/actions/runs/44603908067) |
| Borders unavailable after a cached polygon script loads | The script URL is versioned. A stale-library test checks that the app shows a reload message and keeps export blocked. [Run](https://github.com/DisneyMax/leather-stamp-studio/actions/runs/44656210283) |
| Legacy project and border integration | Legacy files default to borders off. Browser tests cover border persistence, physical dimensions, contour shapes and holes, invalid geometry, and STL edge orientation. [Run](https://github.com/DisneyMax/leather-stamp-studio/actions/runs/44741969690) |

The [feature plan](FEATURE_PLAN.md) lists follow-up enhancements. The [README](../README.md#validation) records the fixture status and what to capture during manual checks.
