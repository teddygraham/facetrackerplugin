import { Track, TrackPoint } from "./types";

// Keyframe reduction via Ramer–Douglas–Peucker, specialized for animation
// tracks.
//
// Standard RDP measures *perpendicular* distance, which mixes the time axis
// and the value axis — meaningless here because their units differ. What we
// actually care about is: "if we dropped this keyframe and let Figma linearly
// interpolate between its neighbours, how far off would the value be?" That is
// the *vertical* (value-only) distance from the chord, evaluated at the
// point's own timestamp. Keeping only points that exceed `epsilon` in value
// units yields a track that reads identically but has a handful of editable
// keyframes instead of one per analyzed frame.

function verticalDistance(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  if (b.t === a.t) return Math.abs(p.v - a.v);
  const f = (p.t - a.t) / (b.t - a.t);
  const lineV = a.v + (b.v - a.v) * f;
  return Math.abs(p.v - lineV);
}

/**
 * Reduce a track to its load-bearing keyframes.
 *
 * @param epsilon max tolerated deviation, in the track's value units. Pick it
 *   relative to the track's range, e.g. 1.5% of (max - min). Larger = fewer,
 *   more editable keyframes; smaller = more faithful to the raw signal.
 */
export function simplifyTrack(track: Track, epsilon: number): Track {
  if (track.length <= 2) return track.slice();

  const keep = new Array<boolean>(track.length).fill(false);
  keep[0] = true;
  keep[track.length - 1] = true;

  // Iterative RDP to avoid blowing the stack on long clips.
  const stack: Array<[number, number]> = [[0, track.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = verticalDistance(track[i], track[start], track[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx !== -1) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  return track.filter((_, i) => keep[i]);
}

/** Convenience: epsilon as a fraction of the track's value range. */
export function simplifyTrackRelative(track: Track, fraction = 0.015): Track {
  if (track.length <= 2) return track.slice();
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of track) {
    if (p.v < lo) lo = p.v;
    if (p.v > hi) hi = p.v;
  }
  const range = hi - lo;
  // Degenerate (flat) track collapses to its endpoints.
  if (range <= 0) return [track[0], track[track.length - 1]];
  return simplifyTrack(track, range * fraction);
}
