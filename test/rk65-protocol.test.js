import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildLegacyReports, parseFirmwareCode } from "../rk65/protocol.js";

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
