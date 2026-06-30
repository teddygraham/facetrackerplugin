import { Track } from "./types";

// One Euro filter (Casiez, Roussel & Vogel, 2012).
//
// An adaptive low-pass filter: it cuts a lot of jitter when the signal is
// nearly still, and lets the cutoff rise as the signal moves quickly so it
// doesn't lag. This is the right smoother for face tracks because a resting
// face should be rock-steady while a fast head turn should stay responsive.
//
// `minCutoff` controls baseline smoothness (lower = smoother/slower).
// `beta`      controls how aggressively the cutoff opens up with speed
//             (higher = less lag on fast motion, but more jitter passes through).

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  private prev: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.prev === null) {
      this.prev = value;
      return value;
    }
    const out = alpha * value + (1 - alpha) * this.prev;
    this.prev = out;
    return out;
  }
}

export interface OneEuroOptions {
  /** Baseline cutoff frequency in Hz. Default 1.0. */
  minCutoff?: number;
  /** Speed coefficient. Default 0.007 (gentle). */
  beta?: number;
  /** Cutoff for the derivative's own low-pass. Default 1.0. */
  dCutoff?: number;
}

export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private xPrev: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.0;
    this.beta = opts.beta ?? 0.007;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  /** Feed one sample. `dt` is the time since the previous sample, in seconds. */
  filter(value: number, dt: number): number {
    const dValue = this.xPrev === null ? 0 : (value - this.xPrev) / dt;
    const edValue = this.dxFilter.filter(dValue, smoothingAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    const filtered = this.xFilter.filter(value, smoothingAlpha(cutoff, dt));
    this.xPrev = value;
    return filtered;
  }
}

/**
 * Smooth a whole track with a fresh One Euro filter. Uses the real per-point
 * dt so it stays correct even when frame sampling is uneven (e.g. seek jitter).
 */
export function smoothTrack(track: Track, opts: OneEuroOptions = {}): Track {
  if (track.length === 0) return [];
  const filter = new OneEuroFilter(opts);
  const out: Track = [];
  for (let i = 0; i < track.length; i++) {
    const dt = i === 0 ? 1 / 30 : Math.max(1e-4, track[i].t - track[i - 1].t);
    out.push({ t: track[i].t, v: filter.filter(track[i].v, dt) });
  }
  return out;
}
