import assert from "node:assert/strict";
import { test } from "node:test";
import { clampZoom, fitZoom, formatZoom, zoomIn, zoomOut, ZOOM_MAX, ZOOM_MIN } from "./editorZoom.ts";

test("clampZoom stays in range", () => {
  assert.equal(clampZoom(0), ZOOM_MIN);
  assert.equal(clampZoom(9), ZOOM_MAX);
  assert.equal(clampZoom(1), 1);
});

test("zoomIn / zoomOut step by 10%", () => {
  assert.equal(zoomIn(1), 1.1);
  assert.equal(zoomOut(1), 0.9);
  assert.equal(zoomOut(ZOOM_MIN), ZOOM_MIN);
  assert.equal(zoomIn(ZOOM_MAX), ZOOM_MAX);
});

test("fitZoom never upscales past 100%", () => {
  assert.equal(fitZoom(400, 200, 800, 600), 1);
});

test("fitZoom shrinks a wide strip to the viewport width", () => {
  const z = fitZoom(2000, 400, 1000, 800, 0);
  assert.equal(z, 0.5);
});

test("fitZoom shrinks a tall stack to the viewport height", () => {
  const z = fitZoom(400, 2000, 800, 500, 0);
  assert.equal(z, 0.25);
});

test("formatZoom is a percent label", () => {
  assert.equal(formatZoom(1), "100%");
  assert.equal(formatZoom(0.72), "72%");
});
