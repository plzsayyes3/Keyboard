export const RK_VENDOR_ID = 0x258a;
export const CONFIG_USAGE_PAGE = 0x0001;
export const CONFIG_USAGE = 0x0080;

export function formatHex(value, width = 8) {
  const n = Number(value >>> 0);
  return "0x" + n.toString(16).toUpperCase().padStart(width, "0");
}

export function parseFirmwareCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("キーコードが空です");

  const hidMatch = raw.match(/^(?:hid|usage)\s*:\s*(.+)$/i);
  if (hidMatch) {
    const part = hidMatch[1].trim();
    const usage = /^0x/i.test(part) ? Number.parseInt(part.slice(2), 16) : Number.parseInt(part, 10);
    if (!Number.isFinite(usage) || usage < 0 || usage > 0xff) {
      throw new Error("HID Usage は 0x00〜0xFF の範囲で入力してください");
    }
    return (usage << 8) >>> 0;
  }

  const n = /^0x/i.test(raw) ? Number.parseInt(raw.slice(2), 16) : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) {
    throw new Error("0x00000000〜0xFFFFFFFF の範囲で入力してください");
  }
  return n >>> 0;
}

function putFirmwareCode(buffer, offset, value) {
  const n = value >>> 0;
  buffer[offset] = (n >>> 24) & 0xff;
  buffer[offset + 1] = (n >>> 16) & 0xff;
  buffer[offset + 2] = (n >>> 8) & 0xff;
  buffer[offset + 3] = n & 0xff;
}

/**
 * Build the legacy RK 9-report keymap payload without sending it.
 *
 * Protocol shape:
 * - feature report id 0x0A
 * - 9 reports
 * - 65 bytes including report id
 * - key slot = bIndex * 4
 *
 * The observed RK R65 JP uses a different BeiYing report-0x06 protocol.
 * Keep this legacy format separate from its diagnostic read requests.
 */
export function buildLegacyReports(profile, overrides = {}) {
  const REPORTS = 9;
  const SIZE = 65;
  const map = new Uint8Array(REPORTS * SIZE);

  for (const key of profile.keys) {
    const raw = Object.prototype.hasOwnProperty.call(overrides, key.bIndex)
      ? overrides[key.bIndex]
      : key.defaultFw;
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === "number" ? raw : parseFirmwareCode(raw);
    putFirmwareCode(map, key.bIndex * 4, value);
  }

  const reports = [];
  let src = 0;
  for (let i = 0; i < REPORTS; i++) {
    const report = new Uint8Array(SIZE);
    report[0] = 0x0a;
    report[1] = REPORTS;
    report[2] = i + 1;
    if (i === 0) {
      report[3] = 0x01;
      report[4] = 0xf8;
    }
    const start = i === 0 ? 5 : 3;
    for (let p = start; p < SIZE && src < map.length; p++) {
      report[p] = map[src++];
    }
    reports.push(report);
  }
  return reports;
}

export function reportsToHex(reports) {
  return reports.map((r, i) => {
    const body = Array.from(r, b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    return `REPORT ${i + 1}: ${body}`;
  }).join("\n");
}

export function summarizeOverrides(profile, overrides = {}) {
  return Object.entries(overrides)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([rawBIndex, rawValue]) => {
      const bIndex = Number(rawBIndex);
      const key = profile.keys.find(item => item.bIndex === bIndex);
      const value = formatHex(parseFirmwareCode(rawValue));
      return {
        bIndex,
        keyId: key?.id || null,
        label: key?.label || null,
        value,
        language: value === formatHex(0x9000) ? "LANG1" : value === formatHex(0x9100) ? "LANG2" : null
      };
    });
}

export function summarizeReports(reports) {
  return reports.map((report, index) => ({
    index: index + 1,
    reportId: report[0],
    byteLength: report.length,
    header: Array.from(report.slice(0, 5)),
    hex: Array.from(report, byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")
  }));
}

export function formatDiagnosticDetails(details) {
  return JSON.stringify(details);
}

export function summarizeFeatureReport(reportId, data) {
  const bytes = Array.from(data, byte => Number(byte));
  return {
    reportId,
    byteLength: bytes.length,
    hex: bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")
  };
}

export function isBeiYingReadTarget(device) {
  return !!device?.opened && device.vendorId === RK_VENDOR_ID && device.productId === 0x01f7 &&
    (device.collections || []).some(collection =>
      collection.usagePage === 0xff00 && collection.usage === 0x0001 &&
      (collection.featureReports || []).some(report =>
        report.reportId === 0x06 && (report.items || []).some(item =>
          item.reportSize === 8 && item.reportCount === 519
        )
      )
    );
}

export function buildBeiYingReadRequest(kind) {
  const request = new Uint8Array(519);
  if (kind === "identify") {
    request.set([0x82, 0x01, 0, 0x01, 0, 0x0a, 0]);
  } else if (kind === "key-matrix") {
    request.set([0x83, 0, 0, 0x01, 0, 0xf8, 0x01]);
  } else {
    throw new Error("未対応の読み取り要求です");
  }
  return request;
}

export function isBeiYingIdentifyResponse(bytes) {
  return bytes.length >= 18 && bytes[0] === 0x06 && bytes[1] === 0x82;
}

const BEIYING_MATRIX_LENGTH = 504;
const BEIYING_RESPONSE_HEADER = [0x06, 0x83, 0, 0, 0x01, 0, 0xf8, 0x01];

export function parseBeiYingKeyMatrixResponse(bytes) {
  if (bytes?.length !== 512) throw new Error("キー配列応答は512バイト必要です");
  if (!BEIYING_RESPONSE_HEADER.every((byte, index) => bytes[index] === byte)) {
    throw new Error("キー配列応答のヘッダーまたはレイヤーが一致しません");
  }
  return Uint8Array.from(bytes.slice(8));
}

export function buildBeiYingWritePreview(response, overrides) {
  const backup = Uint8Array.from(response);
  const matrix = parseBeiYingKeyMatrixResponse(backup);
  const entries = Object.entries(overrides || {});
  if (entries.length !== 1) throw new Error("今回は1キーの変更だけを許可します");
  const [rawIndex, rawValue] = entries[0];
  if (rawIndex !== "41") throw new Error("今回は変換キー以外の書き込みを許可しません");
  const code = parseFirmwareCode(rawValue);
  if (code !== 0x9000 && code !== 0x9100) throw new Error("LANG1/LANG2以外の値は許可しません");
  const offset = 41 * 4;
  const before = new DataView(matrix.buffer).getUint32(offset);
  if (![0x8a, 0x90, 0x91].includes(before)) throw new Error("変換キーの元の値が想定外です");
  const after = code >>> 8;
  const request = new Uint8Array(519);
  request.set([0x03, 0, 0, 0x01, 0, BEIYING_MATRIX_LENGTH & 0xff, BEIYING_MATRIX_LENGTH >> 8]);
  request.set(matrix, 7);
  new DataView(request.buffer).setUint32(7 + offset, after);
  return {
    backup,
    request,
    changes: [{bIndex: 41, before: formatHex(before), after: formatHex(after)}]
  };
}

export function verifyBeiYingWrite(readback, request) {
  const matrix = parseBeiYingKeyMatrixResponse(readback);
  if (request?.length !== 519 || request[0] !== 0x03) return false;
  return matrix.every((byte, index) => byte === request[7 + index]);
}

export function createBeiYingBackup(response, capturedAt) {
  parseBeiYingKeyMatrixResponse(response);
  return {
    format: "rk65-beiying-matrix-backup-v1",
    capturedAt,
    responseBytes: Array.from(response)
  };
}

function definedFields(value, fields) {
  return Object.fromEntries(fields
    .filter(field => value[field] !== undefined)
    .map(field => [field, value[field]]));
}

export function summarizeHidCollections(collections = []) {
  return collections.map(collection => ({
    usagePage: formatHex(collection.usagePage, 4),
    usage: formatHex(collection.usage, 4),
    featureReports: (collection.featureReports || []).map(report => ({
      reportId: report.reportId,
      items: (report.items || []).map(item => definedFields(item, [
        "reportSize", "reportCount", "usages", "usageMinimum", "usageMaximum",
        "logicalMinimum", "logicalMaximum", "physicalMinimum", "physicalMaximum",
        "unit", "unitExponent", "isAbsolute", "isArray", "isBufferedBytes",
        "isConstant", "isLinear", "isRange", "isRelative", "isVolatile", "hasNull",
        "hasPreferredState", "hasWrap"
      ]))
    }))
  }));
}

export function summarizeHidDevice(device) {
  return {
    productName: device.productName,
    vendorId: formatHex(device.vendorId, 4),
    productId: formatHex(device.productId, 4),
    opened: !!device.opened,
    collections: (device.collections || []).map(c => ({
      usagePage: formatHex(c.usagePage, 4),
      usage: formatHex(c.usage, 4),
      featureReportIds: (c.featureReports || []).map(r => r.reportId)
    }))
  };
}
