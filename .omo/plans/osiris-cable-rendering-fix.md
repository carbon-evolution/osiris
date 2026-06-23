# OSIRIS — Submarine Cable Rendering Fix

## TL;DR

> **Quick Summary**: Replace the broken land-mask-overlay approach with the correct submarinecablemap.com technique — ocean-only cable tracks + landing point dots with per-cable colors.
>
> **Deliverables**:
> - Remove `land-mask-fill` and `land-mask` source from the map
> - Replace cable data with SCM's `cable-geo.json` (ocean-only tracks, per-cable colors)
> - Add landing point dots layer from `landing-point-geo.json` (1,916 points)
> - Update cable layer to use per-cable `color` property from feature data
>
> **Estimated Effort**: Short (3-4 files, clear changes)
> **Parallel Execution**: NO — sequential, each task depends on the previous
> **Critical Path**: Map code → Data loading → Data wiring

---

## Context

### Original Request
The land-mask-fill layer introduced earlier is too aggressive — it completely hides everything under the opaque fill. At key landing hubs like Mumbai, hundreds of cable origin/termination points are invisible because they're under the land mask.

### Research Findings (submarinecablemap.com)

After inspecting `submarinecablemap.com`'s actual API, data, and rendering:

1. **Their cable-geo.json is already ocean-only** — the geometry contains only ocean coordinates. No land mask needed.
2. **They have separate landing-point-geo.json** — 1,916 point features with `id`, `name`, `is_tbd` properties — these are the dots you see at cable landing stations.
3. **Each cable has a `color` property** — 540 unique colors across 714 features, giving each cable a distinct visual identity (matching what you see on their site).
4. **No land mask overlay** — literally no fill polygon over land. The data naturally stays in the ocean.
5. **Their API data was already downloaded** — the SCM data is already saved to `public/data/submarine-cables.json` and `public/data/submarine-cables-landing-points.json`.

### Root Cause
The `land-mask-fill` layer with `fill-opacity: 1` and color `#0e0e0e` was an opaque polygon covering all land masses. Since cables' geometries include landing point coordinates (which are on land), the mask correctly covered them — but that's the wrong approach entirely.

---

## Work Objectives

### Core Objective
Make Osiris's submarine cable rendering visually identical to submarinecablemap.com's approach: ocean tracks + landing point dots + per-cable colors.

### Concrete Deliverables
- `src/components/OsirisMap.tsx` — Remove land mask source/layer/theme code; add landing points source/layer; update cable colors
- `src/app/page.tsx` — Load landing points data alongside cables
- `src/components/LayerPanel.tsx` — Update cable counter to reflect landing points (optional)

### Definition of Done
- [ ] Build compiles without errors
- [ ] Cables render in their specific colors (not uniform amber)
- [ ] Landing points appear as dots at cable origin/termination stations
- [ ] No land mask polygon visible
- [ ] Toggling cables on/off also toggles landing points

### Must Have
- Remove `land-mask` source and `land-mask-fill` layer from OsirisMap.tsx
- Remove land mask theme color update from the theme-switch useEffect
- Add `cable-landing-points` GeoJSON source (initialized as EMPTY_FC)
- Add `cable-landing-points-dots` circle layer right after cable layers
- Update `cables-line` to use per-cable color from `['get', 'color']` with `#FF6D00` fallback
- Load landing points data in page.tsx alongside cables
- Wire landing points into setGeo in OsirisMap.tsx

### Must NOT Have (Guardrails)
- Do NOT re-introduce a land mask fill layer — the data itself handles this
- Do NOT remove `cables-glow` — keep the glow but it uses a single uniform color (it's a glow effect, not per-cable)
- Do NOT change the `unwarpCableLongitudes` function — SCM data has the same longitude wrapping needs

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Next.js app, no unit test setup)
- **Automated tests**: None
- **Agent-Executed QA**: via build verification

### QA Policy
Primary verification: Build passes. Secondary: Spot-check a few major cables in browser.

---

## TODOs

- [x] 1. Remove land mask source and layer from OsirisMap.tsx

  **What to do**:
  - Replace `map.addSource('land-mask', ...)` with `map.addSource('cable-landing-points', ...)`
  - Remove `land-mask-fill` layer addition (around line 750, after cable-glow)
  - Remove land mask color update in the theme-switch useEffect (around line 1738)
  - Keep the `const landColor` line for now if needed elsewhere, otherwise remove it too

  **Must NOT do**:
  - Don't touch the cable-line or cable-glow layers — they stay
  - Don't remove the `cables` source

  **Recommended Agent Profile**: `unspecified-high`
  - **Category**: `unspecified-high` — targeted edits in a large file, needs careful reading
  - **Skills**: none needed

  **Parallelization**: Sequential (blocks tasks 2-4)
  **Blocked By**: none

  **References**:
  - `src/components/OsirisMap.tsx:263` — current land-mask source addition
  - `src/components/OsirisMap.tsx:750` — current land-mask-fill layer
  - `src/components/OsirisMap.tsx:1738` — theme switch update for land mask

  **Acceptance Criteria**:
  - [ ] `grep -c 'land-mask' src/components/OsirisMap.tsx` returns 0

  **QA Scenarios**:
  ```
  Scenario: Land mask removed
    Tool: Bash (grep)
    Steps:
      1. grep -r 'land-mask' src/components/OsirisMap.tsx
    Expected Result: No matches found — land mask code fully removed
    Evidence: .omo/evidence/task-1-land-mask-removed.txt
  ```

---

- [x] 2. Update cable line layer to use per-cable colors

  **What to do**:
  - In `src/components/OsirisMap.tsx`, update the `cables-line` layer's `line-color` paint property from `'#FF6D00'` to `['coalesce', ['get', 'color'], '#FF6D00']`
  - This uses the per-cable color from the GeoJSON feature properties, falling back to amber if absent
  - Keep `cables-glow` with uniform `#FF6D00` (glow should be subtle/ambient, not per-cable)

  **Must NOT do**:
  - Do NOT change `cables-glow` to per-cable — glow is background effect
  - Do NOT remove the `cable-line` layer

  **Recommended Agent Profile**: `quick`
  - **Category**: `quick` — single property change in one file
  - **Skills**: none needed

  **Parallelization**: Sequential
  **Blocked By**: Task 1

  **References**:
  - `src/components/OsirisMap.tsx:736` — cables-line layer definition
  - SCM data: each feature has `properties.color` as hex string

  **Acceptance Criteria**:
  - [ ] `cables-line` uses `['coalesce', ['get', 'color'], '#FF6D00']` for `line-color`

  **QA Scenarios**:
  ```
  Scenario: Per-cable color applied
    Tool: Bash (grep)
    Steps:
      1. grep "'line-color'" src/components/OsirisMap.tsx | grep -c "coalesce"
    Expected Result: 1 — the line-color uses coalesce to get per-cable color
    Evidence: .omo/evidence/task-2-per-cable-color.txt
  ```

---

- [x] 3. Add landing points source and layer in OsirisMap.tsx

  **What to do**:
  - The source was already added in Task 1 (replaced land-mask source)
  - Add a circle layer AFTER cables-glow (line ~740):
    ```typescript
    map.addLayer({ id: 'cable-landing-points-dots', type: 'circle', source: 'cable-landing-points', paint: {
      'circle-radius': ['interpolate',['linear'],['zoom'], 1, 2, 5, 3, 10, 5],
      'circle-color': '#FF6D00',
      'circle-opacity': 0.9,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000',
      'circle-stroke-opacity': 0.5,
    }});
    ```
  - Add landing points setGeo to the cables useEffect around line 1920:
    ```
    setGeo('cable-landing-points', activeLayers.cables && data.submarine_cables_landing_points ? data.submarine_cables_landing_points : []);
    ```
  - Add landing points to the visibility toggle list (around line 2000): `'cable-landing-points-dots'`

  **Recommended Agent Profile**: `unspecified-high`
  - **Category**: `unspecified-high` — multiple edits in one file
  - **Skills**: none needed

  **Parallelization**: Sequential
  **Blocked By**: Task 2

  **References**:
  - `src/components/OsirisMap.tsx:740` — after this line (after cables-glow)
  - `public/data/submarine-cables-landing-points.json` — the landing points data (1,916 Point features)
  - `src/components/OsirisMap.tsx:1922` — existing cables setGeo, add landing points here

  **Acceptance Criteria**:
  - [ ] `cable-landing-points` source exists in OsirisMap.tsx
  - [ ] `cable-landing-points-dots` layer exists with circle styling
  - [ ] `setGeo('cable-landing-points', ...)` call exists
  - [ ] Visibility toggle includes the new layer

  **QA Scenarios**:
  ```
  Scenario: Landing points layer exists
    Tool: Bash (grep)
    Steps:
      1. grep -c 'cable-landing-points' src/components/OsirisMap.tsx
    Expected Result: >= 3 (source, layer, setGeo, visibility)
    Evidence: .omo/evidence/task-3-landing-points-layer.txt
  ```

---

- [x] 4. Load landing points data in page.tsx

  **What to do**:
  - In the cables data loading block around line 457-470, add a second fetch for landing points:
    ```typescript
    const lpRes = await fetch(`/data/submarine-cables-landing-points.json?v=${ts}`);
    if (lpRes.ok) {
      const lpData = await lpRes.json();
      dataRef.current = { ...dataRef.current, submarine_cables_landing_points: lpData.features };
    }
    ```
  - Verify the data flows through to the OsirisMap component (check that `data.submarine_cables_landing_points` is accessible)

  **Must NOT do**:
  - Do NOT change the main cables fetch — it stays as-is
  - Do NOT add a separate layerFetchedRef key — landing points are part of the cables layer, share the same toggle

  **Recommended Agent Profile**: `quick`
  - **Category**: `quick` — single file, small addition
  - **Skills**: none needed

  **Parallelization**: Sequential
  **Blocked By**: Task 3

  **References**:
  - `src/app/page.tsx:456-470` — existing cables fetch block
  - `public/data/submarine-cables-landing-points.json` — landing points data file

  **Acceptance Criteria**:
  - [ ] Landing points are fetched from `/data/submarine-cables-landing-points.json`
  - [ ] Data is stored in `dataRef.current.submarine_cables_landing_points`

  **QA Scenarios**:
  ```
  Scenario: Landing points loaded
    Tool: Bash (grep)
    Steps:
      1. grep "submarine-cables-landing-points" src/app/page.tsx
    Expected Result: fetch URL and dataRef assignment both present
    Evidence: .omo/evidence/task-4-landing-points-loading.txt
  ```

---

- [x] 5. Update landing points visibility to follow cables toggle

  **What to do**:
  - Find the visibility toggle line around `setVis(['cables-line','cables-glow'], activeLayers.cables);`
  - Add `'cable-landing-points-dots'` to the array
  - Find the cursor pointer hover handler around line 1360 and add `'cable-landing-points-dots'` to the list

  **Recommended Agent Profile**: `quick`
  - **Category**: `quick` — small additions, well-defined locations
  - **Skills**: none needed

  **Parallelization**: Sequential
  **Blocked By**: Task 4

  **References**:
  - `src/components/OsirisMap.tsx:2000` — `setVis(['cables-line','cables-glow'], ...)`
  - `src/components/OsirisMap.tsx:1360` — cursor handler list

  **Acceptance Criteria**:
  - [ ] `cable-landing-points-dots` is in the visibility toggle list
  - [ ] `cable-landing-points-dots` is in the hover cursor list

  **QA Scenarios**:
  ```
  Scenario: Landing points visible with cables
    Tool: Bash (grep)
    Steps:
      1. grep "cable-landing-points-dots" src/components/OsirisMap.tsx
    Expected Result: Appears in visibility toggle and cursor handler
    Evidence: .omo/evidence/task-5-visibility-toggle.txt
  ```

---

- [x] F1. Build verification

  **What to do**:
  - Run `npx next build --webpack` from `osiris/`
  - Verify no errors
  - Verify the build output includes the new cables data (no reference to land-mask)

  **Recommended Agent Profile**: `quick`
  - **Category**: `quick` — run build
  - **Skills**: none needed

  **Acceptance Criteria**:
  - [ ] `npx next build --webpack` exits with code 0
  - [ ] No references to `land-mask` in build output

---

## Commit Strategy

- **1**: `fix(osiris): replace land mask with SCM's cable + landing points approach`
  - Files:
    - `src/components/OsirisMap.tsx`
    - `src/app/page.tsx`
    - `public/data/submarine-cables.json`
    - `public/data/submarine-cables-landing-points.json`

## Success Criteria

### Verification Commands
```bash
npx next build --webpack  # Must pass
grep -r 'land-mask' src/components/OsirisMap.tsx  # Must return nothing
grep -c 'cable-landing-points' src/components/OsirisMap.tsx  # Must be >= 3
grep 'cable-landing-points-dots' src/components/OsirisMap.tsx  # Must be in visibility + cursor lists
```

### Final Checklist
- [x] Land mask fully removed
- [x] Cables render in per-cable colors
- [x] Landing points visible as dots at cable stations
- [x] Toggling cables off hides everything (lines + landing points)
- [x] Build passes
