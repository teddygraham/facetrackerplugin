// Shared types for the facetrackplugin analysis pipeline.
//
// The pipeline turns a noisy, possibly-gappy stream of per-frame face
// measurements into a small set of clean, editable Figma Motion keyframe
// tracks. Stages (see pipeline.ts):
//
//   raw samples -> gap-fill -> calibrate -> smooth -> simplify -> keyframes

/** Name of a measurement we extract per frame, e.g. "mouthOpen", "headRoll". */
export type MeasurementKey = string;

/** A single analyzed video frame. */
export interface FrameSample {
  /** Seconds from the start of the clip. Figma Motion timelines are in seconds. */
  t: number;
  /**
   * Measurement values for this frame, or `null` when the detector lost the
   * face entirely. A per-key `NaN`/`undefined` is also treated as a miss.
   */
  values: Record<MeasurementKey, number> | null;
}

/** A point on a single measurement's track. */
export interface TrackPoint {
  /** Seconds from start of clip. */
  t: number;
  v: number;
}

/** A continuous, gap-free series of points for one measurement. */
export type Track = TrackPoint[];
