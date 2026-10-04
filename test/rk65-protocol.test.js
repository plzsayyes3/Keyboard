import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildLegacyReports,
  parseFirmwareCode,
  summarizeOverrides,
  summarizeReports,
  formatDiagnosticDetails,
  summarizeFeatureReport,
  summarizeHidCollections,
  buildBeiYingReadRequest,
  isBeiYingReadTarget,
  isBeiYingIdentifyResponse,
  parseBeiYingKeyMatrixResponse,
  buildBeiYingWritePreview,
  verifyBeiYingWrite,
  createBeiYingBackup
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

test("diagnostic details are directly readable without expanding console objects", () => {
  assert.equal(
    formatDiagnosticDetails({report0A: true, featureReportIds: [10]}),
    '{"report0A":true,"featureReportIds":[10]}'
  );
});

test("feature report summary exposes report id, length, and bytes", () => {
  assert.deepEqual(
    summarizeFeatureReport(0x05, Uint8Array.from([0x0a, 0x01, 0xff])),
    {reportId: 0x05, byteLength: 3, hex: "0A 01 FF"}
  );
});

test("HID collection summary exposes feature report item descriptors", () => {
  assert.deepEqual(
    summarizeHidCollections([{
      usagePage: 0xff00,
      usage: 1,
      featureReports: [{
        reportId: 6,
        items: [{
          reportSize: 8,
          reportCount: 8,
          usages: [1, 2],
          logicalMinimum: 0,
          logicalMaximum: 255
        }]
      }]
    }]),
    [{
      usagePage: "0xFF00",
      usage: "0x0001",
      featureReports: [{
        reportId: 6,
        items: [{
          reportSize: 8,
          reportCount: 8,
          usages: [1, 2],
          logicalMinimum: 0,
          logicalMaximum: 255
        }]
      }]
    }]
  );
});

test("BeiYing diagnostic requests match the R65 JP read commands", () => {
  const identify = buildBeiYingReadRequest("identify");
  const keyMatrix = buildBeiYingReadRequest("key-matrix");

  assert.equal(identify.length, 519);
  assert.deepEqual(Array.from(identify.slice(0, 8)), [0x82, 0x01, 0, 0x01, 0, 0x0a, 0, 0]);
  assert.equal(keyMatrix.length, 519);
  assert.deepEqual(Array.from(keyMatrix.slice(0, 8)), [0x83, 0, 0, 0x01, 0, 0xf8, 0x01, 0]);
  assert.equal(identify.every((byte, index) => index < 8 || byte === 0), true);
  assert.equal(keyMatrix.every((byte, index) => index < 8 || byte === 0), true);
  assert.throws(() => buildBeiYingReadRequest("write"), /読み取り要求/);
});

test("BeiYing diagnostic reading requires exact R65 JP and 519-byte report 6", () => {
  const device = {
    opened: true,
    vendorId: 0x258a,
    productId: 0x01f7,
    collections: [{
      usagePage: 0xff00,
      usage: 1,
      featureReports: [{reportId: 6, items: [{reportSize: 8, reportCount: 519}]}]
    }]
  };

  assert.equal(isBeiYingReadTarget(device), true);
  assert.equal(isBeiYingReadTarget({...device, productId: 0x01f8}), false);
  assert.equal(isBeiYingReadTarget({...device, collections: []}), false);
  assert.equal(isBeiYingReadTarget({...device, opened: false}), false);
});

test("BeiYing identify response requires report 6 and command 0x82", () => {
  const response = Uint8Array.from([0x06, 0x82, 0x01, 0, 0x01, 0, 0x0a, 0, 0x03, 0, 0, 0, 0x02, 0x26, 0, 0, 0x10, 0]);
  assert.equal(isBeiYingIdentifyResponse(response), true);
  assert.equal(isBeiYingIdentifyResponse(response.slice(0, 8)), false);
  assert.equal(isBeiYingIdentifyResponse(Uint8Array.from([0x06, 0x83, ...response.slice(2)])), false);
});

function sampleMatrixResponse() {
  const response = new Uint8Array(512);
  response.set([0x06, 0x83, 0, 0, 0x01, 0, 0xf8, 0x01]);
  response[8 + 7 * 4 + 3] = 0x3a; // The real device's number-row slot 7 currently contains F1.
  response[8 + 41 * 4 + 3] = 0x8a; // Henkan.
  response[8 + 91 * 4] = 0x02; // Non-keyboard mapping must survive intact.
  response[8 + 91 * 4 + 3] = 0xe2;
  return response;
}

test("BeiYing matrix parsing accepts only a complete layer-0 504-byte response", () => {
  const response = sampleMatrixResponse();
  assert.equal(parseBeiYingKeyMatrixResponse(response).length, 504);
  assert.throws(() => parseBeiYingKeyMatrixResponse(response.slice(0, 511)), /512/);
  const wrongCommand = response.slice();
  wrongCommand[1] = 0x82;
  assert.throws(() => parseBeiYingKeyMatrixResponse(wrongCommand), /応答/);
  const wrongLayer = response.slice();
  wrongLayer[4] = 2;
  assert.throws(() => parseBeiYingKeyMatrixResponse(wrongLayer), /応答/);
});

test("BeiYing write preview changes only Henkan slot 41 to LANG1 and keeps the captured matrix", () => {
  const original = sampleMatrixResponse();
  const {backup, request, changes} = buildBeiYingWritePreview(original, {41: "0x00009000"});
  assert.equal(request.length, 519);
  assert.deepEqual(Array.from(request.slice(0, 7)), [0x03, 0, 0, 0x01, 0, 0xf8, 0x01]);
  assert.deepEqual(Array.from(request.slice(7 + 41 * 4, 7 + 42 * 4)), [0, 0, 0, 0x90]);
  assert.equal(request[7 + 7 * 4 + 3], 0x3a);
  assert.deepEqual(Array.from(request.slice(7 + 91 * 4, 7 + 92 * 4)), [0x02, 0, 0, 0xe2]);
  assert.deepEqual(Array.from(backup), Array.from(original));
  assert.deepEqual(changes, [{bIndex: 41, before: "0x0000008A", after: "0x00000090"}]);
  const changed = Array.from(request.slice(7, 511)).filter((byte, index) => byte !== original[8 + index]);
  assert.deepEqual(changed, [0x90]);
});

test("BeiYing write preview rejects other slots and non-LANG overrides", () => {
  const response = sampleMatrixResponse();
  assert.throws(() => buildBeiYingWritePreview(response, {7: "0x00009000"}), /変換キー/);
  assert.throws(() => buildBeiYingWritePreview(response, {41: "0x00009000", 7: "0x00009000"}), /1キー/);
  assert.throws(() => buildBeiYingWritePreview(response, {41: "0x00009200"}), /LANG1/);
  const unknownSource = response.slice();
  unknownSource[8 + 41 * 4 + 3] = 0x04;
  assert.throws(() => buildBeiYingWritePreview(unknownSource, {41: "0x00009000"}), /元の値/);
});

test("BeiYing readback verification checks all 504 bytes, not only Henkan", () => {
  const response = sampleMatrixResponse();
  const {request} = buildBeiYingWritePreview(response, {41: "0x00009100"});
  const readback = response.slice();
  readback.set(request.slice(7, 511), 8);
  assert.equal(verifyBeiYingWrite(readback, request), true);
  readback[8 + 7 * 4 + 3] = 0x1e;
  assert.equal(verifyBeiYingWrite(readback, request), false);
});

test("BeiYing backup preserves the full response independently of the live buffer", () => {
  const response = sampleMatrixResponse();
  const backup = createBeiYingBackup(response, "2026-10-04T00:00:00.000Z");
  assert.equal(backup.format, "rk65-beiying-matrix-backup-v1");
  assert.equal(backup.capturedAt, "2026-10-04T00:00:00.000Z");
  assert.deepEqual(backup.responseBytes, Array.from(response));
  response[8 + 41 * 4 + 3] = 0x90;
  assert.equal(backup.responseBytes[8 + 41 * 4 + 3], 0x8a);
  assert.throws(() => createBeiYingBackup(response.slice(0, 20), "x"), /512/);
});
