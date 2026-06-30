# Assessment of the second critique

> "What do you think of this critique?"

Short version: it's the stronger of the two on implementation rigor and
long-term vision, and weaker on discipline. Its real value is that it stops
treating the plugin as "face detection in Figma" and starts treating it as
**retargeting a facial performance onto a Figma rig** — that reframe is the
thing worth adopting wholesale, because it tells you what the next features
are (an authoring layer between tracking and keyframes) instead of just listing
more detectors.

## What it gets right (weight these heavily)

- **Verify the Motion API before building.** The single best instinct in the
  critique. Easing shape, `baseValue` semantics, rotation units, and timeline
  ownership are exactly the things that fail silently. I went and checked them
  — see [`MOTION_API_FINDINGS.md`](./MOTION_API_FINDINGS.md). It was right to
  worry about **rotation units**: `atan2` is radians, `ROTATION` keyframes are
  degrees, so head-roll ships off by ~57× unless converted. That's a real bug,
  now fixed in code.
- **Both critiques independently converge on the same top two wins.** That
  convergence is a strong signal, so these are the build, not the roadmap:
  1. **Per-person calibration** — express measurements as deviation from a
     captured neutral. Makes the output *correct*, not just plausible.
  2. **Smoothing + keyframe simplification** — One Euro filter then RDP. Turns
     dense, jittery, un-editable output into a clean curve a designer can
     hand-tune. The critique's nuance that *for Figma, editable beats
     mathematically accurate* is correct and worth designing around
     (Accurate / Balanced / Editable presets).
- **The graded detection-loss fallback** (hold short gaps → interpolate →
  ease to neutral on long gaps) is strictly better than a "hold last value"
  one-liner. Adopted in `gapFill.ts`.
- **Store node IDs at analyze time, re-resolve at generate.** The correct
  robustness pattern; don't trust the live selection at generate time.
- **MediaPipe Face Landmarker (52 blendshapes) as the v2 path** is the right
  long-term call and the real unlock for smile/viseme work — but it is v2.

## Where to push back

- **It writes checks the scope can't cash.** Expression-layer crossfades,
  puppeting templates, preset motion styles, audio/viseme mode, live camera,
  JSON import/export, rig validator, quality report, multi-layer recipes — all
  reasonable, but presented flat, as if comparably weighted. They are not. Build
  top-to-bottom and you'll spend three weekends on a rig validator before the
  animation looks good. This is a 2-year roadmap dressed as a code review.
- **Treat its confident facts as claims.** A long reasoning pass that cites
  exact dates and signatures still needs checking. (They mostly held up here —
  but that's *because* they were checked, not because they were asserted
  confidently.)
- **Don't rip out the working CPU backend.** The WASM-over-CPU advice is right
  in principle, but it's argued from first principles, not from your specific
  sandbox failure. The `getContext('webgl')` patch presumably exists because
  something actually failed. Keep CPU as a guaranteed fallback; add WASM as the
  *preferred attempt* behind feature detection. Don't remove the thing that
  works because a critique called it inelegant.

## The collapsed worklist (what this repo implements)

1. **Verify first** (could be silently broken now): rotation units ✅, easing
   shape ✅, `baseValue` ✅, timeline ownership ⏳ (in-editor check). See
   `MOTION_API_FINDINGS.md`.
2. **The two quality wins both critiques agree on**: calibration
   (`calibration.ts`), smoothing + simplification (`oneEuro.ts`, `simplify.ts`).
3. **One robustness fix**: store node IDs at analyze time, re-resolve at
   generate (documented in `ROADMAP.md`; UI/host work).

Everything else — MediaPipe, expression layers, templates, viseme mode — is
real but it's roadmap, not this build. See [`ROADMAP.md`](./ROADMAP.md).

## Net

A better critique than the first on rigor and vision, weaker on prioritization.
Take its reframe, take the two convergent wins, take the four verify-first
items (done), and explicitly defer the feature firehose. That's what this repo
encodes.
