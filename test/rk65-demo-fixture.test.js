import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {buildBeiYingDemoResponse} from "../rk65/demo-fixture.js";
import {compareBeiYingMatrixKey, decodeBeiYingKeyCode, formatBeiYingKeycapLabel, parseBeiYingKeyMatrixResponse} from "../rk65/protocol.js";

const profile = JSON.parse(
  fs.readFileSync(new URL("../rk65/profiles/r65-jis-01f7.json", import.meta.url), "utf8")
);
const reference = JSON.parse(
  fs.readFileSync(new URL("../rk65/profiles/r65-jis-01f7-reference.json", import.meta.url), "utf8")
);

test("Fn offline preview reproduces the saved Backspace assignment at physical J/K37", () => {
  const response = buildBeiYingDemoResponse(reference, 1);
  const key = profile.keys.find(item => item.id === "K37");
  const matrix = parseBeiYingKeyMatrixResponse(response, 1);

  assert.equal(response.length, 512);
  assert.deepEqual(Array.from(response.slice(0, 8)), [0x06, 0x83, 1, 0, 1, 0, 0xf8, 1]);
  assert.deepEqual(Array.from(matrix.slice(key.bIndex * 4, key.bIndex * 4 + 4)), [0, 0, 0, 0x2a]);
  assert.equal(decodeBeiYingKeyCode(matrix.slice(key.bIndex * 4, key.bIndex * 4 + 4)).label, "Backspace");
  assert.equal(formatBeiYingKeycapLabel("Backspace"), "BS");
});

test("Fn offline preview preserves the saved R chord and M/V language assignments", () => {
  const response = buildBeiYingDemoResponse(reference, 1);
  const matrix = parseBeiYingKeyMatrixResponse(response, 1);
  const actualAt = id => {
    const key = profile.keys.find(item => item.id === id);
    return decodeBeiYingKeyCode(matrix.slice(key.bIndex * 4, key.bIndex * 4 + 4)).label;
  };

  assert.equal(actualAt("K19"), "⌘ + Enter");
  assert.equal(actualAt("K47"), "LANG2 / 英数");
  assert.equal(actualAt("K50"), "LANG1 / かな");
});

test("offline previews classify every visible slot against its saved reference", () => {
  const visibleKeys = profile.keys.filter(key => !key.hidden);
  assert.equal(visibleKeys.length, 70);
  for (const layer of [0, 1]) {
    const response = buildBeiYingDemoResponse(reference, layer);
    const slots = reference.layers[String(layer)].slots;
    for (const key of visibleKeys) {
      const expectedStatus = Object.hasOwn(slots, String(key.bIndex)) ? "match" : "no-reference";
      assert.equal(compareBeiYingMatrixKey(response, slots, layer, key.bIndex).status, expectedStatus,
        `${layer === 1 ? "Fn" : "通常"} ${key.id} / slot ${key.bIndex}`);
    }
  }
});

test("offline preview keeps unpopulated reference slots zeroed and rejects invalid layers", () => {
  const response = buildBeiYingDemoResponse(reference, 0);
  assert.deepEqual(Array.from(response.slice(8, 12)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(response.slice(12, 16)), [0, 0, 0, 0x29]);
  assert.throws(() => buildBeiYingDemoResponse(reference, 2), /レイヤー/);
});
