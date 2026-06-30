import { Track } from "./types";

// Bridge from a cleaned measurement Track to a Figma Motion manual keyframe
// track.
//
// Verified against the Plugin Motion API (Beta, shipped 2026-06-23 in Plugin
// API v1 update 127). The two facts that bite if you get them wrong:
//
//   * Timeline positions are in SECONDS. Our Track.t is already seconds.
//   * ROTATION keyframe values are in DEGREES. atan2() returns RADIANS, so a
//     head-roll track must be converted (×180/π) or it ends up off by ~57×
//     (imperceptible, or a full barrel roll). Set `isRotation: true`.
//
// `applyManualKeyframeTrack` *replaces* the named track, and keyframe values
// are absolute, so re-running on an already-animated layer is idempotent — it
// does not accumulate drift. baseValue is the value outside the keyframed
// range; with calibrated (deviation) input, 0 is the natural rest value.

const RAD_TO_DEG = 180 / Math.PI;

/** Figma KeyframePropertyFieldName values we drive. */
export type PropertyName =
  | "TRANSLATION_X"
  | "TRANSLATION_Y"
  | "ROTATION"
  | "SCALE"
  | "OPACITY";

export interface BuildTrackOptions {
  /** Figma property this track drives. */
  property: PropertyName;
  /**
   * Units per measurement-unit. e.g. a mouthOpen deviation of 0.1 with
   * gain 180 → 18px of translation. Exposed per track as the "exaggeration"
   * slider in the UI.
   */
  gain: number;
  /** Convert radians → degrees (set for ROTATION tracks). */
  isRotation?: boolean;
  /** Base/rest value outside the keyframed range. Default 0 (calibrated). */
  baseValue?: number;
}

/** Shape accepted by node.applyManualKeyframeTrack(field, track). */
export interface ManualKeyframeTrackArgs {
  field: { type: "PROPERTY"; name: PropertyName };
  track: {
    baseValue: { type: "FLOAT"; value: number };
    keyframes: Array<{
      timelinePosition: number; // seconds
      value: { type: "FLOAT"; value: number };
      // easing defaults to LINEAR; keep keyframes editable by hand afterward.
    }>;
  };
}

function mapValue(v: number, opts: BuildTrackOptions): number {
  const scaled = v * opts.gain;
  return opts.isRotation ? scaled * RAD_TO_DEG : scaled;
}

/**
 * Build the exact argument object to pass to
 * `node.applyManualKeyframeTrack(args.field, args.track)` in code.ts.
 *
 * Feed this the already gap-filled, calibrated, smoothed, and simplified
 * track (see pipeline.ts) — one keyframe per surviving point.
 */
export function buildManualKeyframeTrack(
  track: Track,
  opts: BuildTrackOptions,
): ManualKeyframeTrackArgs {
  return {
    field: { type: "PROPERTY", name: opts.property },
    track: {
      baseValue: { type: "FLOAT", value: opts.baseValue ?? 0 },
      keyframes: track.map((p) => ({
        timelinePosition: p.t,
        value: { type: "FLOAT", value: mapValue(p.v, opts) },
      })),
    },
  };
}
