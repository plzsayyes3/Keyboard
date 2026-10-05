import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const editorHtml = fs.readFileSync(new URL("../rk65/index.html", import.meta.url), "utf8");
const currentLayoutHtml = fs.readFileSync(new URL("../rk65/current-layout.html", import.meta.url), "utf8");

test("editor keeps the keymap as the primary workspace and groups diagnostics in a closed disclosure", () => {
  assert.match(editorHtml, /<section class="card keymap-card">[\s\S]*?<div class="keyboardWrap">[\s\S]*?id="keyboard"/);
  const diagnostics = editorHtml.match(/<details class="secondaryPanel">([\s\S]*?)<\/details>/)?.[1];
  assert.ok(diagnostics, "diagnostic tools should start collapsed in a native details disclosure");
  for (const id of ["toggleTest", "readLayer", "readDiagnostic", "downloadMatrixBackup", "previewBeiYingWrite"]) {
    assert.ok(diagnostics.includes(`id="${id}"`), `${id} should remain available inside diagnostics`);
  }
  assert.ok(!diagnostics.includes("open"), "diagnostics should not expand by default");
});

test("editor and read-only view share the same map and selected-key workspace structure", () => {
  for (const [name, html] of [["editor", editorHtml], ["read-only", currentLayoutHtml]]) {
    assert.match(html, /class="grid keymapLayout"/, `${name} should use the keymap-first grid`);
    assert.match(html, /class="card keymap-card"/, `${name} should use the primary map panel`);
    assert.match(html, /class="card inspector-card"/, `${name} should keep details beside the map`);
    assert.match(html, /class="keymapHeader"/, `${name} should expose the map toolbar`);
  }
  assert.match(fs.readFileSync(new URL("../rk65/app.js", import.meta.url), "utf8"), /btn\.innerHTML = readCode\s*\?\s*`<span class="read-label">\$\{escapeHtml\(readCode\.label\)\}<\/span><small class="physical-position">\$\{escapeHtml\(key\.label\)\} · \$\{key\.id\}<\/small>`\s*:\s*`<span>\$\{escapeHtml\(key\.label\)\}<\/span><small>\$\{key\.id\}<\/small>`/,
    "after a device read, the assigned keycode should be primary and the physical key identity secondary");
});
