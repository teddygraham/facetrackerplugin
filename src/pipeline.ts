import { FrameSample, MeasurementKey } from "./types";
import { gapFill } from "./gapFill";
import { computeNeutral, toDeviation } from "./calibration";
import { smoothTrack, OneEuroOptions } from "./oneEuro";
import { simplifyTrackRelative } from "./simplify";
import {
  buildManualKeyframeTrack,
  ManualKeyframeTrackArgs,
  PropertyName,
} from "./applyTrack";

// The full analysis → keyframe pipeline, in the order that matters:
//
//   1. gap-fill    — turn detection losses into continuous tracks (no snaps)
//   2. calibrate   — express every measurement as deviation from neutral
//   3. smooth      — One Euro filter kills micro-jitter, keeps fast motion
//   4. simplify    — RDP drops redundant keyframes → editable in the timeline
//   5. build       — emit Figma applyManualKeyframeTrack args (deg-correct)
//
// Order is deliberate: gap-fill before smoothing so the filter never sees a
// null; calibrate before smoothing so the baseline (and thus the One Euro
// derivative) is centered; simplify last so it operates on the final curve.

/** One measurement → one Figma property, with its own tuning. */
export interface TrackMapping {
  measurement: MeasurementKey;
  property: PropertyName;
  /** Units per measurement unit (exaggeration). */
  gain: number;
  /** Convert radians→degrees (head-roll / ROTATION). */
  isRotation?: boolean;
  /** Per-track smoothing override. */
  smoothing?: OneEuroOptions;
  /** RDP epsilon as a fraction of the track's range. Default 0.015. */
  simplifyFraction?: number;
}

export interface PipelineConfig {
  mappings: TrackMapping[];
  /** Limit neutral capture to a user-marked "hold still" window. */
  neutralWindow?: { startT: number; endT: number };
  /** Detection-loss tuning. */
  maxHoldFrames?: number;
  easeFrames?: number;
}

export interface PipelineResult {
  /** One ready-to-apply track per mapping, keyed by Figma property name. */
  tracks: Record<string, ManualKeyframeTrackArgs>;
  /** The neutral pose used, for display / re-use / persistence. */
  neutral: Record<MeasurementKey, number>;
  /** Keyframe counts before vs after simplification (for the quality report). */
  reduction: Record<string, { before: number; after: number }>;
}

export function analyzeToKeyframes(
  samples: FrameSample[],
  config: PipelineConfig,
): PipelineResult {
  const keys = config.mappings.map((m) => m.measurement);

  // 2 (compute) — neutral first; gap-fill and calibration both need it.
  const neutral = computeNeutral(samples, keys, config.neutralWindow);

  // 1 — continuous tracks with graded detection-loss fallback.
  const filled = gapFill(samples, {
    neutral,
    maxHoldFrames: config.maxHoldFrames,
    easeFrames: config.easeFrames,
  });

  const tracks: Record<string, ManualKeyframeTrackArgs> = {};
  const reduction: Record<string, { before: number; after: number }> = {};

  for (const m of config.mappings) {
    const raw = filled[m.measurement] ?? [];
    // 2 (apply) — center on neutral.
    const deviation = toDeviation(raw, neutral[m.measurement] ?? 0);
    // 3 — adaptive smoothing.
    const smoothed = smoothTrack(deviation, m.smoothing);
    // 4 — keyframe reduction.
    const simplified = simplifyTrackRelative(smoothed, m.simplifyFraction ?? 0.015);
    // 5 — Figma-ready args (degrees-correct for rotation).
    tracks[m.property] = buildManualKeyframeTrack(simplified, {
      property: m.property,
      gain: m.gain,
      isRotation: m.isRotation,
      baseValue: 0,
    });
    reduction[m.property] = { before: smoothed.length, after: simplified.length };
  }

  return { tracks, neutral, reduction };
}
