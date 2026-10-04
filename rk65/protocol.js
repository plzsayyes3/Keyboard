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
 * This is intentionally preview-only until the user's RK65 protocol
 * is verified against the official web configurator.
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
