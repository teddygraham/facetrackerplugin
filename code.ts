// Plugin sandbox entry point (runs in Figma's main thread, has `figma.*`).
//
// Flow: the UI panel does MediaPipe face detection on a video and posts the
// per-frame FrameSample[] (plus a tuning config) here; we run the analysis
// pipeline and write Motion keyframe tracks onto a *resolved* target node via
// applyManualKeyframeTrack. A synthetic "demo performance" path is kept so the
// plugin still does something visible end-to-end without a video.
//
// Targeting (Task 3): we don't blindly trust the live selection at generate
// time. The user can "lock" a target; we persist its node id on the document
// root, re-resolve it by id at generate, and verify it still exists and still
// has the Motion API. The per-node tuning config is persisted on the node
// itself via setPluginData so re-opening the plugin restores it.

import { analyzeToKeyframes, PipelineConfig } from "./src/pipeline";
import { FrameSample } from "./src/types";

// pluginData keys. The locked target id lives on the document root so it
// survives selection changes; the tuning config lives on the target node so it
// travels with that layer / component instance.
const LOCK_KEY = "facetrack:lockedTargetId";
const CONFIG_KEY = "facetrack:config";

figma.showUI(__html__, { width: 360, height: 620, themeColors: true });

const DEMO_CONFIG: PipelineConfig = {
  mappings: [
    { measurement: "mouthOpen", property: "TRANSLATION_Y", gain: 60 },
    { measurement: "headRoll", property: "ROTATION", gain: 1, isRotation: true },
  ],
};

/** Deterministic synthetic performance (mirrors src/smoke.ts). */
function demoSamples(): FrameSample[] {
  const FPS = 30;
  const DURATION = 5;
  const N = FPS * DURATION;
  const jitter = (i: number, amp: number) =>
    amp * (((Math.sin(i * 12.9898) * 43758.5453) % 1) || 0);

  const samples: FrameSample[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    const mouthOpen =
      0.18 + 0.32 * Math.max(0, Math.sin((t / DURATION) * Math.PI)) + jitter(i, 0.02);
    const headRoll = 0.15 * Math.sin(t * 2) + jitter(i, 0.01); // radians, as atan2 gives
    // Simulate a brief detection dropout to exercise the gap-fill fallback.
    if (i >= 60 && i <= 66) samples.push({ t, values: null });
    else samples.push({ t, values: { mouthOpen, headRoll } });
  }
  return samples;
}

type MotionNode = SceneNode & {
  applyManualKeyframeTrack: (field: unknown, track: unknown) => void;
};

function hasMotionApi(node: BaseNode): node is MotionNode {
  return typeof (node as { applyManualKeyframeTrack?: unknown }).applyManualKeyframeTrack === "function";
}

/** A locked target that no longer resolves is reported, not silently kept. */
function resolveLockedTarget(): MotionNode | "missing" | null {
  const lockedId = figma.root.getPluginData(LOCK_KEY);
  if (!lockedId) return null;
  const node = figma.getNodeById(lockedId);
  if (!node || node.removed) return "missing";
  if (node.type === "DOCUMENT" || node.type === "PAGE" || !hasMotionApi(node)) return "missing";
  return node;
}

/**
 * Decide which node to drive. A valid locked target always wins over the live
 * selection so the user isn't at the mercy of what happens to be clicked. If
 * the locked target has been deleted we clear the lock and fall back to the
 * selection rather than failing outright.
 */
function resolveTarget(): { node: MotionNode } | { error: string } {
  const locked = resolveLockedTarget();
  if (locked === "missing") {
    figma.root.setPluginData(LOCK_KEY, "");
    figma.notify("Locked FaceTrack target was deleted — falling back to selection.");
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
      error:
        "This node / Figma build has no Motion API (applyManualKeyframeTrack). Update the desktop app and select a frame with a timeline.",
    };
  }
  return { node };
}

function describeTarget(): { lockedName: string | null; savedConfig: PipelineConfig | null } {
  const locked = resolveLockedTarget();
  if (locked && locked !== "missing") {
    let savedConfig: PipelineConfig | null = null;
    const raw = locked.getPluginData(CONFIG_KEY);
    if (raw) {
      try {
        savedConfig = JSON.parse(raw) as PipelineConfig;
      } catch {
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

function applyToTarget(samples: FrameSample[], config: PipelineConfig) {
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

  // Persist the tuning config on the node and re-lock onto it so the next
  // generate re-resolves the same node by id rather than the live selection.
  node.setPluginData(CONFIG_KEY, JSON.stringify(config));
  figma.root.setPluginData(LOCK_KEY, node.id);

  figma.notify(`Applied ${applied} Motion track(s) to "${node.name}".`);
  figma.ui.postMessage({ type: "done", node: node.name, reduction, neutral });
  postTargetState();
}

type UiMessage =
  | { type: "generate-demo"; config?: PipelineConfig }
  | { type: "apply-samples"; samples?: FrameSample[]; config?: PipelineConfig }
  | { type: "lock-target" }
  | { type: "unlock-target" }
  | { type: "request-state" }
  | { type: "close" };

figma.ui.onmessage = (msg: UiMessage) => {
  switch (msg.type) {
    case "generate-demo":
      applyToTarget(demoSamples(), msg.config ?? DEMO_CONFIG);
      break;
    case "apply-samples":
      // Real path: UI-side face detection posts FrameSample[] here.
      if (msg.samples) applyToTarget(msg.samples, msg.config ?? DEMO_CONFIG);
      break;
    case "lock-target": {
      const sel = figma.currentPage.selection;
      if (sel.length === 0 || !hasMotionApi(sel[0])) {
        figma.ui.postMessage({
          type: "error",
          message: "Select a layer with a Motion timeline to lock as the target.",
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

// Tell the UI the current locked-target state as soon as it's ready.
postTargetState();
