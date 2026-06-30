# Roadmap

Ordered by leverage, not by excitement. Ship top-down; resist jumping to v2
features before the v1 quality wins land.

## v1 — make the output professional (this repo)

These are the two wins both critiques independently ranked highest, plus the
one robustness fix and the verified API correctness.

- [x] **Smoothing** — One Euro filter per track (`src/oneEuro.ts`).
- [x] **Keyframe simplification** — RDP with vertical-distance metric
      (`src/simplify.ts`). 150 frames → ~20 editable keyframes in the smoke test.
- [x] **Per-person calibration** — neutral capture + deviation
      (`src/calibration.ts`).
- [x] **Graded detection-loss fallback** — hold / interpolate / ease-to-neutral
      (`src/gapFill.ts`).
- [x] **Rotation degrees fix** — radians→degrees on `ROTATION`
      (`src/applyTrack.ts`); verified against the Motion API.
- [ ] **Host wiring**: call `node.applyManualKeyframeTrack(field, track)` in
      `code.ts` using `buildManualKeyframeTrack` output; confirm timeline
      ownership and `setTimelineDuration` target in-editor.
- [ ] **Store node IDs at analyze time, re-resolve at generate** — capture root
      + child node ids when analysis runs; re-resolve and verify existence at
      generate. Add a "locked target" affordance so the user isn't relying on
      the live selection.
- [ ] **UI**: per-track exaggeration (gain) slider with live scrub; smoothing
      strength slider (exposes One Euro `minCutoff`/`beta`); Accurate /
      Balanced / Editable simplification presets; a neutral-capture button.

## v1.5 — measurement quality

- [ ] **Normalize brow height by interocular distance** so it's scale- and
      distance-invariant (EAR / mouth ratios are already self-normalizing).
- [ ] **Close the head-x / head-y gap**: define yaw/pitch proxies explicitly
      (e.g. nose-tip displacement vs face center) or drop the unmapped
      properties from the UI.
- [ ] **Faster extraction**: replace per-frame `currentTime` seeking with
      `requestVideoFrameCallback` linear decode for local files.
- [ ] **WASM backend, CPU fallback**: feature-detect and prefer the WASM TF.js
      backend; keep the working CPU path as a guaranteed fallback. Do not remove
      the existing `getContext` workaround until WASM is proven in the sandbox.
- [ ] **Re-target without re-analyze**: cache the analyzed track
      (`setPluginData` on the node, or JSON export/import) so the expensive
      analysis runs once and re-mapping to a new component is instant.
- [ ] **Persist layer mapping per component** via `setPluginData`.

## v2 — the authoring layer (defer until v1 ships)

These are real but they are a product roadmap, not the next commit.

- [ ] **MediaPipe Face Landmarker** (52 blendshapes → `jawOpen`,
      `mouthSmileLeft`, `eyeBlinkLeft`, …) as an "Expressive mode" alongside the
      current "Fast mode."
- [ ] **Viseme / phoneme mouth mapping** via component property swaps (A/E/O/
      closed variants) — the path to real lip-sync, leveraging Figma variants
      instead of translation-Y.
- [ ] **Loopability**: ease the last frame back toward the first for clean
      looping idle/talking cycles.
- [ ] **Quality report**: surface keyframe-reduction ratios, dropout count,
      calibration confidence (the pipeline already returns `reduction` +
      `neutral` for this).
- [ ] Expression-layer crossfades, puppeting templates, preset motion styles,
      rig validator — backlog.

## Framing

The product is **"retarget a facial performance onto a Figma rig,"** not "face
detection in Figma." Every v1.5/v2 item should be judged by whether it improves
the retargeting authoring loop, not by whether it adds another detector.
