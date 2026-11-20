# Feature plan

Updated November 20, 2026. Priority goes to the SVG-to-STL workflow and features that can be checked against exported geometry.

See [implemented features](IMPLEMENTED_FEATURES.md) for the current app capabilities.

## Proposed order

| Priority | Feature | Acceptance criteria |
| --- | --- | --- |
| Next, after border validation | Independent border height | The current same-height setting remains the default. Changing the border height changes the STL relief while preserving artwork depth, the footprint, project reload, and a single closed solid. |
| After independent height | Border edge profiles | Sharp remains the default. Chamfered and Rounded borders preserve the selected profile, show any width recovery, and block invalid exports. Verify each profile independently of artwork edge settings. |
| Later | Borders for recessed dies | Define how the border should appear on the die and on the leather. Tests verify cavity polarity, depth, clearance, and mesh validity. |
| After print samples | Calibrated built-in presets | Record printer, material, settings, and the resulting leather impression before recommending preset values. Preserve the ability to save personal presets. |
| Later | On-app text and initials | Generate outlined lettering from a licensed font. Verify letter counters, mirroring, placement, saved-project compatibility, and STL export. |

Backing and handle options, batch layouts, templates, and additional export formats remain candidates. Prioritize them after observing which workflows take the most time.

Keep geometry changes in focused PRs with automated tests. See the [fixes plan](FIXES_PLAN.md) for manual validation and open regressions.
