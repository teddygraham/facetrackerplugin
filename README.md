# facetrackplugin

**Retarget a facial performance onto a Figma rig.**

A Figma Motion plugin that analyzes a video of a face and drives a Figma
component's keyframe tracks from it. This repo holds the **analysis pipeline**
— the part that turns a noisy, gappy stream of per-frame measurements into a
small set of clean, editable Motion keyframes — plus a worked critique of the
design.

> The reframe that drives everything here: this is *not* "face detection in
> Figma," it's *retargeting a performance onto a rig*. That's why the leverage
> is in the authoring layer between tracking and keyframes, not in more
> detectors.

## Why this exists

Raw per-frame tracking produces output that is technically correct and looks
amateur: jittery, one keyframe per frame, un-editable, and biased by whoever's
resting face it captured. Two independent critiques (see
[`docs/CRITIQUE_ASSESSMENT.md`](docs/CRITIQUE_ASSESSMENT.md)) converged on the
same two highest-leverage fixes. This pipeline implements them.

## The pipeline

```
raw frame samples
   │  (may contain detection-loss gaps)
   ▼
1. gap-fill      hold short gaps → interpolate → ease to neutral on long gaps
   ▼             — no detected→neutral→detected snap
2. calibrate     express every measurement as deviation from a captured neutral
   ▼             — fixes per-person baseline bias; rest becomes 0
3. smooth        One Euro filter: kills micro-jitter, keeps fast motion crisp
   ▼
4. simplify      RDP keyframe reduction: ~150 frames → ~20 editable keyframes
   ▼
5. build         emit Figma applyManualKeyframeTrack args (degrees-correct)
```

Entry point: [`analyzeToKeyframes`](src/pipeline.ts).

| Module | Responsibility |
|---|---|
| `src/oneEuro.ts` | Adaptive One Euro low-pass smoothing |
| `src/simplify.ts` | Ramer–Douglas–Peucker keyframe reduction (vertical-distance) |
| `src/calibration.ts` | Neutral capture + deviation |
| `src/gapFill.ts` | Graded detection-loss fallback |
| `src/applyTrack.ts` | Map a track → `applyManualKeyframeTrack` args (radians→degrees) |
| `src/pipeline.ts` | Orchestrates the five stages |

## Run it

```bash
npm install
npm run typecheck          # tsc --noEmit, clean
npm run build && node dist-cjs/smoke.js   # see note below
```

The smoke test (`src/smoke.ts`) runs a synthetic 5s/30fps clip with injected
jitter and a detection dropout, and prints the keyframe reduction and the
degrees-correct rotation peak. (For a quick run use a CommonJS build:
`npx tsc --module CommonJS --moduleResolution Node --outDir dist-cjs && node dist-cjs/smoke.js`.)

Expected output: ~150 raw frames reduced to ~20 keyframes per track, and a
rotation peak in the ~10° range (degrees) rather than ~0.15 (radians) — proof
the conversion is applied.

## Wiring into the plugin

`analyzeToKeyframes` returns, per mapping, the exact argument object for
Figma's `node.applyManualKeyframeTrack(field, track)`. In `code.ts`:

```ts
const { tracks } = analyzeToKeyframes(samples, config);
for (const { field, track } of Object.values(tracks)) {
  node.applyManualKeyframeTrack(field, track);
}
```

See [`docs/MOTION_API_FINDINGS.md`](docs/MOTION_API_FINDINGS.md) for the
verified Motion API facts (the API is Beta, shipped 2026-06-23) — most
importantly that `ROTATION` is in **degrees** and timeline positions are in
**seconds**.

## Docs

- [`docs/CRITIQUE_ASSESSMENT.md`](docs/CRITIQUE_ASSESSMENT.md) — assessment of
  the critique and the collapsed worklist.
- [`docs/MOTION_API_FINDINGS.md`](docs/MOTION_API_FINDINGS.md) — verified Motion
  API surface; what was confirmed vs. what to check in-editor.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — v1 / v1.5 / v2, ordered by leverage.

## Status

v1 analysis pipeline implemented and typechecked. Host wiring (calling the
Motion API from `code.ts`, node-id persistence, UI sliders) is the next step —
see the roadmap.
