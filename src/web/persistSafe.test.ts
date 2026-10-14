import assert from "node:assert/strict";
import { test } from "node:test";
import { dataUrlToBlob, safeHex, sanitizeArrows } from "./persistSafe.ts";

test("safeHex keeps hex colors and rejects markup", () => {
  assert.equal(safeHex("#a6e3a1", "#000"), "#a6e3a1");
  assert.equal(safeHex("#FFF", "#000"), "#FFF");
  assert.equal(safeHex('#fff" onload="alert(1)', "#000"), "#000");
  assert.equal(safeHex("red", "#000"), "#000");
  assert.equal(safeHex(undefined, "#000"), "#000");
});

test("sanitizeArrows drops bad colors but keeps style", () => {
  const out = sanitizeArrows({
    a: { style: "dashed", color: "#123456" },
    b: { style: "vs", color: "</svg><img src=x>" },
    c: null,
  });
  assert.deepEqual(out, { a: { style: "dashed", color: "#123456" }, b: { style: "vs" } });
  assert.deepEqual(sanitizeArrows(undefined), {});
});

test("dataUrlToBlob decodes base64 and plain payloads", async () => {
  const png = dataUrlToBlob("data:image/png;base64,iVBORw0K");
  assert.equal(png.type, "image/png");
  assert.deepEqual([...new Uint8Array(await png.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const txt = dataUrlToBlob("data:text/plain,hi%20there");
  assert.equal(await txt.text(), "hi there");
  assert.throws(() => dataUrlToBlob("https://example.com/x.png"));
});
