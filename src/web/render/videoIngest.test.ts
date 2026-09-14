import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isVideoFile,
  sampleTimes,
  scaledSize,
  VIDEO_MAX_DURATION_S,
  VIDEO_MAX_EDGE,
} from "./videoIngestLimits.ts";

test("isVideoFile matches mime and extension", () => {
  assert.equal(isVideoFile({ type: "video/mp4", name: "clip.bin" }), true);
  assert.equal(isVideoFile({ type: "", name: "demo.webm" }), true);
  assert.equal(isVideoFile({ type: "", name: "shot.MOV" }), true);
  assert.equal(isVideoFile({ type: "image/png", name: "x.png" }), false);
  assert.equal(isVideoFile({ type: "text/plain", name: "x.py" }), false);
});

test("sampleTimes caps duration and stays below the end", () => {
  const times = sampleTimes(60);
  assert.ok(times.length > 1);
  assert.ok(times[0] === 0);
  assert.ok((times[times.length - 1] ?? 0) < VIDEO_MAX_DURATION_S);
});

test("sampleTimes of a short clip is dense but bounded", () => {
  const times = sampleTimes(1);
  assert.ok(times.length >= 8);
  assert.ok(times.length <= 16);
});

test("scaledSize even-pixels and caps the long edge", () => {
  const a = scaledSize(1920, 1080);
  assert.equal(a.w % 2, 0);
  assert.equal(a.h % 2, 0);
  assert.ok(Math.max(a.w, a.h) <= VIDEO_MAX_EDGE);
  const b = scaledSize(320, 240);
  assert.equal(b.w, 320);
  assert.equal(b.h, 240);
});
