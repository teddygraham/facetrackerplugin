# Motion API verification (the "verify first" worklist)

Both critiques agreed: before building on any Motion-API claim, verify it,
because these break silently. Here is what was checked against Figma's
developer docs and release notes, what's confirmed, and what still needs a
30-second check inside the editor.

> Sources: Figma Plugin API docs — [figma.motion](https://developers.figma.com/docs/plugins/api/figma-motion/),
> [applyManualKeyframeTrack](https://developers.figma.com/docs/plugins/api/properties/nodes-applymanualkeyframetrack/),
> [Plugin API update 127 (2026-06-23)](https://developers.figma.com/docs/plugins/updates/2026/06/23/version-1-update-127/),
> [Introducing Figma Motion](https://www.figma.com/blog/introducing-figma-motion/).

## Confirmed

| Claim | Verdict | Detail |
|---|---|---|
| Motion plugin API exists, is Beta | ✅ Confirmed | Shipped **2026-06-23** in Plugin API v1, update 127. Read/update of animation styles, timelines, animations, manual keyframe tracks. Marked Beta, "subject to change." |
| `applyManualKeyframeTrack(field, track)` with `baseValue` | ✅ Confirmed | Field is `{ type: 'PROPERTY', name: 'TRANSLATION_X' }`; track is `{ baseValue: { type: 'FLOAT', value }, keyframes: [...] }`. |
| Timeline positions in **seconds** | ✅ Confirmed | `timelinePosition` is in seconds; timeline values are expressed in seconds. |
| **Rotation is in degrees** | ✅ Confirmed | `ROTATION` is a `KeyframePropertyFieldName`; example auto-keyframes 0°→360°. `atan2` returns **radians**, so head-roll must be converted ×180/π — exactly the off-by-57× bug the second critique flagged. Handled in `src/applyTrack.ts`. |
| `baseValue` / regeneration drift | ✅ Mostly resolved | `applyManualKeyframeTrack` *replaces* the named track and keyframe values are **absolute**, so re-running is idempotent — it does not accumulate. baseValue is the value outside the keyframed range. With calibrated input, 0 is the natural rest value. |
| Easing shape (`'LINEAR'` vs `{ type: 'LINEAR' }`) | ✅ Largely resolved | A keyframe's `easing` is `MotionEasing | VariableAlias`. `MotionEasing` uses the **same easing names as prototyping transitions** plus a `HOLD` value. So it is a *named* easing in object form, mirroring the existing prototyping `Easing` type — not a bare enum string passed at top level. Omitting it defaults to linear, which is what we want for editable output. |

## Still verify in-editor (cheap, do before shipping)

1. **Which node owns the timeline.** `setTimelineDuration` needs the *right*
   timeline id. The top-level frame — not necessarily the component you
   selected — may own the timeline. Confirm `node.timelines` / the timeline
   resolution path on a real rig before trusting duration calls.
2. **Exact `MotionEasing` literal** for a per-keyframe non-linear ease, if you
   ever set one (we default to linear, so this is optional for v1).

## Takeaway for the build

The one verified bug that would have shipped is **radians vs degrees on
rotation**. It's already corrected in `applyTrack.ts` (`isRotation: true`).
Everything else either checked out or defaults safely.
