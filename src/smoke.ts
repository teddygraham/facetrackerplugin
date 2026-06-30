import { FrameSample } from "./types";
import { analyzeToKeyframes } from "./pipeline";

// Minimal runnable example: a 5s clip at 30fps where the mouth opens and the
// head rolls, with injected per-frame jitter and a short detection dropout.
// Demonstrates smoothing, calibration, gap-fill, keyframe reduction, and the
// radians→degrees conversion on the rotation track. Run: `npm run build &&
// node dist/smoke.js`.

const FPS = 30;
const DURATION = 5;
const N = FPS * DURATION;

// Deterministic pseudo-jitter (no Math.random, so output is stable).
const jitter = (i: number, amp: number) =>
  amp * (Math.sin(i * 12.9898) * 43758.5453 % 1);

const samples: FrameSample[] = [];
for (let i = 0; i < N; i++) {
  const t = i / FPS;
  // Resting mouthOpen baseline 0.18 (person-specific), opens to ~0.5 mid-clip.
  const mouthOpen = 0.18 + 0.32 * Math.max(0, Math.sin((t / DURATION) * Math.PI)) + jitter(i, 0.02);
  // Head roll in RADIANS (as atan2 would give), small ±0.15 rad sway.
  const headRoll = 0.15 * Math.sin(t * 2) + jitter(i, 0.01);

  // Drop the face for frames 60–66 to exercise the gap-fill fallback.
  if (i >= 60 && i <= 66) {
    samples.push({ t, values: null });
  } else {
    samples.push({ t, values: { mouthOpen, headRoll } });
  }
}

const result = analyzeToKeyframes(samples, {
  mappings: [
    { measurement: "mouthOpen", property: "TRANSLATION_Y", gain: 60 },
    { measurement: "headRoll", property: "ROTATION", gain: 1, isRotation: true },
  ],
});

console.log("neutral:", result.neutral);
console.log("reduction:", result.reduction);
console.log(
  "mouth keyframes:",
  result.tracks["TRANSLATION_Y"].track.keyframes.length,
  "/ raw frames:",
  N,
);
const rot = result.tracks["ROTATION"].track.keyframes;
const maxDeg = Math.max(...rot.map((k) => Math.abs(k.value.value)));
console.log("rotation peak (degrees):", maxDeg.toFixed(2), "(should be ~8.6, not ~0.15)");
