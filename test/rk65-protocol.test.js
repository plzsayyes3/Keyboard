import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildLegacyReports,
  parseFirmwareCode,
  summarizeOverrides,
  summarizeReports
} from "../rk65/protocol.js";

const profile = JSON.parse(
  fs.readFileSync(new URL("../rk65/profiles/r65-jis-01f7.json", import.meta.url), "utf8")
);

function flattenPayload(reports) {
  const bytes = [];
  reports.forEach((report, index) => {
    const start = index === 0 ? 5 : 3;
    bytes.push(...report.slice(start));
  });
  return Uint8Array.from(bytes);
}

test("macOS LANG1/LANG2 map to RK firmware codes 0x9000/0x9100", () => {
  assert.equal(parseFirmwareCode("hid:0x90"), 0x9000);
  assert.equal(parseFirmwareCode("hid:0x91"), 0x9100);
  assert.equal(parseFirmwareCode("0x00009000"), 0x9000);
  assert.equal(parseFirmwareCode("0x00009100"), 0x9100);
});

test("legacy RK reports encode a LANG1 override at the selected bIndex", () => {
  const bIndex = 17;
  const reports = buildLegacyReports(profile, {
    [bIndex]: "0x00009000"
  });

  assert.equal(reports.length, 9);
  for (const report of reports) {
    assert.equal(report.length, 65);
    assert.equal(report[0], 0x0a);
  }

  const payload = flattenPayload(reports);
  const offset = bIndex * 4;
  assert.deepEqual(
    Array.from(payload.slice(offset, offset + 4)),
    [0x00, 0x00, 0x90, 0x00]
  );
});

test("legacy RK reports encode a LANG2 override at the selected bIndex", () => {
  const bIndex = 17;
  const reports = buildLegacyReports(profile, {
    [bIndex]: "0x00009100"
  });
  const payload = flattenPayload(reports);
  const offset = bIndex * 4;

  assert.deepEqual(
    Array.from(payload.slice(offset, offset + 4)),
    [0x00, 0x00, 0x91, 0x00]
  );
});

test("diagnostic override summary identifies LANG1/LANG2 changes", () => {
  assert.deepEqual(
    summarizeOverrides(profile, {
      17: "0x00009000",
      20: "0x00009100"
    }),
    [
      { bIndex: 17, keyId: "K58", label: "LAlt", value: "0x00009000", language: "LANG1" },
      { bIndex: 20, keyId: "K18", label: "E", value: "0x00009100", language: "LANG2" }
    ]
  );
});

test("diagnostic report summary includes id, length, and hex payload", () => {
  const reports = buildLegacyReports(profile, { 17: "0x00009000" });

  assert.deepEqual(summarizeReports(reports), reports.map((report, index) => ({
    index: index + 1,
    reportId: 0x0a,
    byteLength: 65,
    header: Array.from(report.slice(0, 5)),
    hex: Array.from(report, byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")
  })));
});
