import { FrameSample, MeasurementKey, Track } from "./types";

// Detection-loss handling.
//
// Naively dropping to neutral whenever the detector misses a frame turns a
// single bad frame in good footage into a detected -> neutral -> detected
// double snap. The fix is a graded fallback:
//
//   leading/trailing gap (no anchor on one side) -> hold the nearest value
//   short interior gap (<= maxHoldFrames)        -> linearly interpolate
//   long interior gap (>  maxHoldFrames)         -> ease to neutral and back
//
// "Ease to neutral" instead of "snap to neutral" so even a genuine long
// dropout fades rather than twitches.

export interface GapFillOptions {
  /** Per-key neutral (rest) value used after a long dropout. */
  neutral: Record<MeasurementKey, number>;
  /** Consecutive misses tolerated before easing toward neutral. Default 6. */
  maxHoldFrames?: number;
  /** Frames spent ramping into/out of neutral on a long gap. Default 4. */
  easeFrames?: number;
}

function isValid(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function fillSeries(
  vs: Array<number | null>,
  neutral: number,
  maxHold: number,
  easeFrames: number,
): number[] {
  const n = vs.length;
  const out: Array<number | null> = vs.slice();

  let i = 0;
  while (i < n) {
    if (out[i] !== null) {
      i++;
      continue;
    }
    // [i, j) is a run of misses. left = last filled value, right = next raw.
    let j = i;
    while (j < n && out[j] === null) j++;
    const left = i > 0 ? out[i - 1] : null;
    const right = j < n ? vs[j] : null;
    const gapLen = j - i;

    if (left === null && right === null) {
      for (let k = i; k < j; k++) out[k] = neutral; // empty track
    } else if (left === null) {
      for (let k = i; k < j; k++) out[k] = right; // leading gap: hold first
    } else if (right === null) {
      for (let k = i; k < j; k++) out[k] = left; // trailing gap: hold last
    } else if (gapLen <= maxHold) {
      for (let k = i; k < j; k++) {
        const f = (k - (i - 1)) / (j - (i - 1));
        out[k] = left + (right - left) * f; // short gap: interpolate
      }
    } else {
      const e = Math.max(1, Math.min(easeFrames, gapLen >> 1));
      for (let k = i; k < j; k++) {
        const fromStart = k - i;
        const fromEnd = j - 1 - k;
        if (fromStart < e) {
          out[k] = left + (neutral - left) * ((fromStart + 1) / (e + 1));
        } else if (fromEnd < e) {
          out[k] = neutral + (right - neutral) * ((e - fromEnd) / (e + 1));
        } else {
          out[k] = neutral;
        }
      }
    }
    i = j;
  }

  return out as number[];
}

/**
 * Split raw frame samples (with possible nulls) into one gap-free Track per
 * measurement key, applying the graded fallback above.
 */
export function gapFill(
  samples: FrameSample[],
  opts: GapFillOptions,
): Record<MeasurementKey, Track> {
  const maxHold = opts.maxHoldFrames ?? 6;
  const easeFrames = opts.easeFrames ?? 4;
  const ts = samples.map((s) => s.t);
  const result: Record<MeasurementKey, Track> = {};

  for (const key of Object.keys(opts.neutral)) {
    const raw: Array<number | null> = samples.map((s) => {
      if (s.values == null) return null;
      const v = s.values[key];
      return isValid(v) ? v : null;
    });
    const filled = fillSeries(raw, opts.neutral[key], maxHold, easeFrames);
    result[key] = filled.map((v, idx) => ({ t: ts[idx], v }));
  }

  return result;
}
