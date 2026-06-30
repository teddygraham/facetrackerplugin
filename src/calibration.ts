import { FrameSample, MeasurementKey, Track } from "./types";

// Per-person calibration — the single highest-leverage correctness fix.
//
// Everyone's resting face is different: baseline mouth openness, brow height,
// and eye aperture all vary person to person and clip to clip. If you keyframe
// absolute measurements you bake in that bias and the rig sits "wrong" before
// it ever moves. Instead, capture a neutral and express every measurement as a
// *deviation* from it. After this step a resting face is 0 across the board,
// which also makes `baseValue: 0` the natural rest pose for each Figma track.

function isValid(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Estimate a neutral pose as the per-key median over the chosen frames.
 *
 * Median (not mean) so a few blinks or a stray smile during the resting window
 * don't drag the baseline. Pass `window` to restrict to a user-marked "hold
 * still" segment; omit it to use the whole clip (robust when expressions are
 * roughly balanced around rest).
 */
export function computeNeutral(
  samples: FrameSample[],
  keys: MeasurementKey[],
  window?: { startT: number; endT: number },
): Record<MeasurementKey, number> {
  const inWindow = (s: FrameSample) =>
    !window || (s.t >= window.startT && s.t <= window.endT);

  const neutral: Record<MeasurementKey, number> = {};
  for (const key of keys) {
    const vals: number[] = [];
    for (const s of samples) {
      if (!inWindow(s) || s.values == null) continue;
      const v = s.values[key];
      if (isValid(v)) vals.push(v);
    }
    neutral[key] = vals.length > 0 ? median(vals) : 0;
  }
  return neutral;
}

/** Subtract the neutral baseline so a resting face reads as 0. */
export function toDeviation(track: Track, neutral: number): Track {
  return track.map((p) => ({ t: p.t, v: p.v - neutral }));
}
