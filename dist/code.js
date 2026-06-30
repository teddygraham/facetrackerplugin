"use strict";
(() => {
  // src/gapFill.ts
  function isValid(n) {
    return typeof n === "number" && Number.isFinite(n);
  }
  function fillSeries(vs, neutral, maxHold, easeFrames) {
    const n = vs.length;
    const out = vs.slice();
    let i = 0;
    while (i < n) {
      if (out[i] !== null) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && out[j] === null) j++;
      const left = i > 0 ? out[i - 1] : null;
      const right = j < n ? vs[j] : null;
      const gapLen = j - i;
      if (left === null && right === null) {
        for (let k = i; k < j; k++) out[k] = neutral;
      } else if (left === null) {
        for (let k = i; k < j; k++) out[k] = right;
      } else if (right === null) {
        for (let k = i; k < j; k++) out[k] = left;
      } else if (gapLen <= maxHold) {
        for (let k = i; k < j; k++) {
          const f = (k - (i - 1)) / (j - (i - 1));
          out[k] = left + (right - left) * f;
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
    return out;
  }
  function gapFill(samples, opts) {
    var _a, _b;
    const maxHold = (_a = opts.maxHoldFrames) != null ? _a : 6;
    const easeFrames = (_b = opts.easeFrames) != null ? _b : 4;
    const ts = samples.map((s) => s.t);
    const result = {};
    for (const key of Object.keys(opts.neutral)) {
      const raw = samples.map((s) => {
        if (s.values == null) return null;
        const v = s.values[key];
        return isValid(v) ? v : null;
      });
      const filled = fillSeries(raw, opts.neutral[key], maxHold, easeFrames);
      result[key] = filled.map((v, idx) => ({ t: ts[idx], v }));
    }
    return result;
  }

  // src/calibration.ts
  function isValid2(n) {
    return typeof n === "number" && Number.isFinite(n);
  }
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  function computeNeutral(samples, keys, window) {
    const inWindow = (s) => !window || s.t >= window.startT && s.t <= window.endT;
    const neutral = {};
    for (const key of keys) {
      const vals = [];
      for (const s of samples) {
        if (!inWindow(s) || s.values == null) continue;
        const v = s.values[key];
        if (isValid2(v)) vals.push(v);
      }
      neutral[key] = vals.length > 0 ? median(vals) : 0;
    }
    return neutral;
  }
  function toDeviation(track, neutral) {
    return track.map((p) => ({ t: p.t, v: p.v - neutral }));
  }

  // src/oneEuro.ts
  function smoothingAlpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  var LowPass = class {
    constructor() {
      this.prev = null;
    }
    filter(value, alpha) {
      if (this.prev === null) {
        this.prev = value;
        return value;
      }
      const out = alpha * value + (1 - alpha) * this.prev;
      this.prev = out;
      return out;
    }
  };
  var OneEuroFilter = class {
    constructor(opts = {}) {
      this.xFilter = new LowPass();
      this.dxFilter = new LowPass();
      this.xPrev = null;
      var _a, _b, _c;
      this.minCutoff = (_a = opts.minCutoff) != null ? _a : 1;
      this.beta = (_b = opts.beta) != null ? _b : 7e-3;
      this.dCutoff = (_c = opts.dCutoff) != null ? _c : 1;
    }
    /** Feed one sample. `dt` is the time since the previous sample, in seconds. */
    filter(value, dt) {
      const dValue = this.xPrev === null ? 0 : (value - this.xPrev) / dt;
      const edValue = this.dxFilter.filter(dValue, smoothingAlpha(this.dCutoff, dt));
      const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
      const filtered = this.xFilter.filter(value, smoothingAlpha(cutoff, dt));
      this.xPrev = value;
      return filtered;
    }
  };
  function smoothTrack(track, opts = {}) {
    if (track.length === 0) return [];
    const filter = new OneEuroFilter(opts);
    const out = [];
    for (let i = 0; i < track.length; i++) {
      const dt = i === 0 ? 1 / 30 : Math.max(1e-4, track[i].t - track[i - 1].t);
      out.push({ t: track[i].t, v: filter.filter(track[i].v, dt) });
    }
    return out;
  }

  // src/simplify.ts
  function verticalDistance(p, a, b) {
    if (b.t === a.t) return Math.abs(p.v - a.v);
    const f = (p.t - a.t) / (b.t - a.t);
    const lineV = a.v + (b.v - a.v) * f;
    return Math.abs(p.v - lineV);
  }
  function simplifyTrack(track, epsilon) {
    if (track.length <= 2) return track.slice();
    const keep = new Array(track.length).fill(false);
    keep[0] = true;
    keep[track.length - 1] = true;
    const stack = [[0, track.length - 1]];
    while (stack.length > 0) {
      const [start, end] = stack.pop();
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
  function simplifyTrackRelative(track, fraction = 0.015) {
    if (track.length <= 2) return track.slice();
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of track) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    const range = hi - lo;
    if (range <= 0) return [track[0], track[track.length - 1]];
    return simplifyTrack(track, range * fraction);
  }

  // src/applyTrack.ts
  var RAD_TO_DEG = 180 / Math.PI;
  function mapValue(v, opts) {
    const scaled = v * opts.gain;
    return opts.isRotation ? scaled * RAD_TO_DEG : scaled;
  }
  function buildManualKeyframeTrack(track, opts) {
    var _a;
    return {
      field: { type: "PROPERTY", name: opts.property },
      track: {
        baseValue: { type: "FLOAT", value: (_a = opts.baseValue) != null ? _a : 0 },
        keyframes: track.map((p) => ({
          timelinePosition: p.t,
          value: { type: "FLOAT", value: mapValue(p.v, opts) }
        }))
      }
    };
  }

  // src/pipeline.ts
  function analyzeToKeyframes(samples, config) {
    var _a, _b, _c;
    const keys = config.mappings.map((m) => m.measurement);
    const neutral = computeNeutral(samples, keys, config.neutralWindow);
    const filled = gapFill(samples, {
      neutral,
      maxHoldFrames: config.maxHoldFrames,
      easeFrames: config.easeFrames
    });
    const tracks = {};
    const reduction = {};
    for (const m of config.mappings) {
      const raw = (_a = filled[m.measurement]) != null ? _a : [];
      const deviation = toDeviation(raw, (_b = neutral[m.measurement]) != null ? _b : 0);
      const smoothed = smoothTrack(deviation, m.smoothing);
      const simplified = simplifyTrackRelative(smoothed, (_c = m.simplifyFraction) != null ? _c : 0.015);
      tracks[m.property] = buildManualKeyframeTrack(simplified, {
        property: m.property,
        gain: m.gain,
        isRotation: m.isRotation,
        baseValue: 0
      });
      reduction[m.property] = { before: smoothed.length, after: simplified.length };
    }
    return { tracks, neutral, reduction };
  }

  // code.ts
  var LOCK_KEY = "facetrack:lockedTargetId";
  var CONFIG_KEY = "facetrack:config";
  figma.showUI(__html__, { width: 360, height: 620, themeColors: true });
  var DEMO_CONFIG = {
    mappings: [
      { measurement: "mouthOpen", property: "TRANSLATION_Y", gain: 60 },
      { measurement: "headRoll", property: "ROTATION", gain: 1, isRotation: true }
    ]
  };
  function demoSamples() {
    const FPS = 30;
    const DURATION = 5;
    const N = FPS * DURATION;
    const jitter = (i, amp) => amp * (Math.sin(i * 12.9898) * 43758.5453 % 1 || 0);
    const samples = [];
    for (let i = 0; i < N; i++) {
      const t = i / FPS;
      const mouthOpen = 0.18 + 0.32 * Math.max(0, Math.sin(t / DURATION * Math.PI)) + jitter(i, 0.02);
      const headRoll = 0.15 * Math.sin(t * 2) + jitter(i, 0.01);
      if (i >= 60 && i <= 66) samples.push({ t, values: null });
      else samples.push({ t, values: { mouthOpen, headRoll } });
    }
    return samples;
  }
  function hasMotionApi(node) {
    return typeof node.applyManualKeyframeTrack === "function";
  }
  function resolveLockedTarget() {
    const lockedId = figma.root.getPluginData(LOCK_KEY);
    if (!lockedId) return null;
    const node = figma.getNodeById(lockedId);
    if (!node || node.removed) return "missing";
    if (node.type === "DOCUMENT" || node.type === "PAGE" || !hasMotionApi(node)) return "missing";
    return node;
  }
  function resolveTarget() {
    const locked = resolveLockedTarget();
    if (locked === "missing") {
      figma.root.setPluginData(LOCK_KEY, "");
      figma.notify("Locked FaceTrack target was deleted \u2014 falling back to selection.");
    } else if (locked) {
      return { node: locked };
    }
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      return { error: "Select a layer to drive first (or lock a target)." };
    }
    const node = selection[0];
    if (!hasMotionApi(node)) {
      return {
        error: "This node / Figma build has no Motion API (applyManualKeyframeTrack). Update the desktop app and select a frame with a timeline."
      };
    }
    return { node };
  }
  function describeTarget() {
    const locked = resolveLockedTarget();
    if (locked && locked !== "missing") {
      let savedConfig = null;
      const raw = locked.getPluginData(CONFIG_KEY);
      if (raw) {
        try {
          savedConfig = JSON.parse(raw);
        } catch (e) {
          savedConfig = null;
        }
      }
      return { lockedName: locked.name, savedConfig };
    }
    return { lockedName: null, savedConfig: null };
  }
  function postTargetState() {
    const { lockedName, savedConfig } = describeTarget();
    figma.ui.postMessage({ type: "target-state", lockedName, savedConfig });
  }
  function applyToTarget(samples, config) {
    const resolved = resolveTarget();
    if ("error" in resolved) {
      figma.ui.postMessage({ type: "error", message: resolved.error });
      return;
    }
    const node = resolved.node;
    const { tracks, reduction, neutral } = analyzeToKeyframes(samples, config);
    let applied = 0;
    for (const key of Object.keys(tracks)) {
      const { field, track } = tracks[key];
      node.applyManualKeyframeTrack(field, track);
      applied++;
    }
    node.setPluginData(CONFIG_KEY, JSON.stringify(config));
    figma.root.setPluginData(LOCK_KEY, node.id);
    figma.notify(`Applied ${applied} Motion track(s) to "${node.name}".`);
    figma.ui.postMessage({ type: "done", node: node.name, reduction, neutral });
    postTargetState();
  }
  figma.ui.onmessage = (msg) => {
    var _a, _b;
    switch (msg.type) {
      case "generate-demo":
        applyToTarget(demoSamples(), (_a = msg.config) != null ? _a : DEMO_CONFIG);
        break;
      case "apply-samples":
        if (msg.samples) applyToTarget(msg.samples, (_b = msg.config) != null ? _b : DEMO_CONFIG);
        break;
      case "lock-target": {
        const sel = figma.currentPage.selection;
        if (sel.length === 0 || !hasMotionApi(sel[0])) {
          figma.ui.postMessage({
            type: "error",
            message: "Select a layer with a Motion timeline to lock as the target."
          });
          break;
        }
        figma.root.setPluginData(LOCK_KEY, sel[0].id);
        figma.notify(`Locked FaceTrack target: "${sel[0].name}".`);
        postTargetState();
        break;
      }
      case "unlock-target":
        figma.root.setPluginData(LOCK_KEY, "");
        postTargetState();
        break;
      case "request-state":
        postTargetState();
        break;
      case "close":
        figma.closePlugin();
        break;
    }
  };
  postTargetState();
})();
