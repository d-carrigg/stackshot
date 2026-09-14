import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isVideoFile,
  looksLikeVideoBytes,
  sampleTimes,
  scaledSize,
  VIDEO_MAX_DURATION_S,
  VIDEO_MAX_EDGE,
} from "./videoIngestLimits.ts";

test("isVideoFile matches mime and extension", () => {
  assert.equal(isVideoFile({ type: "video/mp4", name: "clip.bin" }), true);
  assert.equal(isVideoFile({ type: "application/mp4", name: "clip.bin" }), true);
  assert.equal(isVideoFile({ type: "", name: "demo.webm" }), true);
  assert.equal(isVideoFile({ type: "", name: "shot.MOV" }), true);
  assert.equal(isVideoFile({ type: "image/png", name: "x.png" }), false);
  assert.equal(isVideoFile({ type: "text/plain", name: "x.py" }), false);
});

test("looksLikeVideoBytes sniffs mp4 ftyp and webm ebml", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.equal(looksLikeVideoBytes(mp4), true);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  assert.equal(looksLikeVideoBytes(webm), true);
  assert.equal(looksLikeVideoBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
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
