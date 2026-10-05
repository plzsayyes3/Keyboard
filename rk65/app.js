import {
  RK_VENDOR_ID,
  CONFIG_USAGE_PAGE,
  CONFIG_USAGE,
  formatHex,
  parseFirmwareCode,
  buildLegacyReports,
  reportsToHex,
  summarizeHidDevice,
  summarizeOverrides,
  summarizeReports,
  formatDiagnosticDetails,
  summarizeFeatureReport,
  summarizeHidCollections,
  isBeiYingReadTarget,
  buildBeiYingReadRequest,
  isBeiYingIdentifyResponse,
  parseBeiYingKeyMatrixResponse,
  decodeBeiYingKeyCode,
  buildBeiYingWritePreview,
  createBeiYingBackup
} from "./protocol.js?diagnostics=read-visual-1";

const $ = (s) => document.querySelector(s);
const state = {
  profile: null,
  selected: null,
  overrides: {},
  device: null,
  readingDiagnostic: false,
  matrixResponse: null,
  matrixLayer: 0,
  backupDownloaded: false,
  previewSignature: null,
  testMode: false,
  testIndex: 0,
  testedKeys: {},
  pressedCodes: new Set(),
  testEvents: [],
  unmatchedEvents: [],
  waitingForRelease: false,
  fnReportCapture: null,
  fnBrowserEvents: []
};

const TARGETS = buildTargets();

function diag(level, event, details = {}) {
  const method = typeof console?.[level] === "function" ? console[level] : console.log;
  method.call(console, `[RK65] ${event} ${formatDiagnosticDetails(details)}`);
}

function updateReadUI() {
  const button = $("#readDiagnostic");
  const layerSelect = $("#readLayer");
  button.disabled = state.readingDiagnostic || !isBeiYingReadTarget(state.device);
  layerSelect.disabled = state.readingDiagnostic || !isBeiYingReadTarget(state.device);
  if (!state.readingDiagnostic && !isBeiYingReadTarget(state.device)) {
    $("#readState").textContent = "対象のRK R65 JPを接続すると診断できます。";
  }
}

function updatePreviewUI() {
  const available = !!state.matrixResponse && isBeiYingReadTarget(state.device);
  const previewAvailable = available && state.matrixLayer === 0;
  $("#downloadMatrixBackup").disabled = !available;
  $("#previewBeiYingWrite").disabled = !previewAvailable || !state.backupDownloaded;
  const signature = JSON.stringify(state.overrides);
  if (!available || state.previewSignature !== signature) {
    state.previewSignature = null;
    $("#previewState").textContent = !available
      ? "実機から配列を読み取ると、バックアップと事前確認ができます。"
      : state.matrixLayer === 1
        ? "Fnレイヤーの読み出し・バックアップ専用です。書き込み事前確認は通常レイヤーでのみ利用できます。"
        : state.backupDownloaded
        ? "元の配列のバックアップを保存したら、変更内容を事前確認してください。"
        : "先に元の配列をファイルへ保存してください。";
  }
}

function downloadMatrixBackup() {
  if (!state.matrixResponse || !isBeiYingReadTarget(state.device)) return;
  const backup = createBeiYingBackup(state.matrixResponse, new Date().toISOString(), state.matrixLayer);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rk65-layer${state.matrixLayer}-matrix-backup.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.backupDownloaded = true;
  diag("info", "matrix-backup-downloaded", {byteLength: backup.responseBytes.length, layer: state.matrixLayer});
  updatePreviewUI();
}

function previewBeiYingWrite() {
  if (!state.matrixResponse || state.matrixLayer !== 0 || !state.backupDownloaded || !isBeiYingReadTarget(state.device)) return;
  try {
    const preview = buildBeiYingWritePreview(state.matrixResponse, state.overrides);
    const {before, after} = preview.changes[0];
    const original = parseBeiYingKeyMatrixResponse(preview.backup);
    const changedBytes = original.filter((byte, index) => byte !== preview.request[7 + index]).length;
    state.previewSignature = JSON.stringify(state.overrides);
    $("#previewState").textContent = `変換キー（slot 41）: ${before} → ${after}。504バイト中${504 - changedBytes}バイトは元の実機配列と同一です。書き込みはまだロック中です。`;
    diag("info", "beiying-write-preview", {
      reportId: 6,
      command: "0x03",
      requestByteLength: preview.request.length,
      changes: preview.changes,
      hardwareWriteEnabled: false
    });
  } catch (e) {
    state.previewSignature = null;
    $("#previewState").textContent = "事前確認不可: " + e.message;
    diag("warn", "beiying-write-preview-rejected", {message: e.message});
  }
}

async function readDiagnostic() {
  if (!isBeiYingReadTarget(state.device) || state.readingDiagnostic) return;
  const device = state.device;
  state.readingDiagnostic = true;
  state.matrixLayer = Number($("#readLayer").value);
  state.matrixResponse = null;
  state.backupDownloaded = false;
  state.previewSignature = null;
  renderKeyboard();
  $("#matrixViewState").hidden = true;
  updateInspector();
  updatePreviewUI();
  updateReadUI();
  const status = $("#readState");
  status.textContent = "識別情報を読み取り中…";
  let stage = "identify";
  try {
    const identifyRequest = buildBeiYingReadRequest("identify");
    diag("info", "read-request", {stage, reportId: 6, command: "0x82", byteLength: identifyRequest.length});
    await device.sendFeatureReport(6, identifyRequest);
    await new Promise(resolve => setTimeout(resolve, 500));
    const identifyData = await device.receiveFeatureReport(6);
    const identifyBytes = new Uint8Array(identifyData.buffer, identifyData.byteOffset, identifyData.byteLength);
    diag("info", "read-response", {stage, reportId: 6, byteLength: identifyData.byteLength, nonZeroBytes: identifyBytes.filter(byte => byte !== 0).length});
    if (!isBeiYingIdentifyResponse(identifyBytes)) throw new Error(`識別応答が不正です (${identifyData.byteLength} bytes)`);

    stage = "key-matrix";
    status.textContent = "現在のキー配列を読み取り中…";
    const layer = state.matrixLayer;
    const matrixRequest = buildBeiYingReadRequest("key-matrix", layer);
    diag("info", "read-request", {stage, reportId: 6, command: "0x83", byteLength: matrixRequest.length, layer, table: 0, board: 0});
    await device.sendFeatureReport(6, matrixRequest);
    const matrixData = await device.receiveFeatureReport(6);
    const matrixBytes = new Uint8Array(matrixData.buffer, matrixData.byteOffset, matrixData.byteLength);
    diag("info", "read-response", {stage, ...summarizeFeatureReport(6, matrixBytes)});
    parseBeiYingKeyMatrixResponse(matrixBytes, layer);
    state.matrixResponse = Uint8Array.from(matrixBytes);
    state.matrixLayer = layer;
    state.backupDownloaded = false;
    state.previewSignature = null;
    updatePreviewUI();
    status.textContent = `${layer === 1 ? "Fnレイヤー" : "通常レイヤー"}を読み出しました。キーボード図に値を表示中 · ${matrixData.byteLength} bytes`;
    diag("info", "read-complete", {byteLength: matrixData.byteLength, layer});
    renderKeyboard();
    updateInspector();
    $("#matrixViewState").hidden = false;
    $("#matrixViewState").textContent = `${layer === 1 ? "Fnレイヤー" : "通常レイヤー"}の実機読み出し値を表示中。キー図には解釈名、キーを選択するとslotと生コードを表示します。`;
  } catch (e) {
    status.textContent = "診断読取失敗 · " + (e?.message || String(e));
    diag("error", "read-failure", {stage, message: e?.message || String(e)});
  } finally {
    state.readingDiagnostic = false;
    updateReadUI();
  }
}

function hidFw(usage) { return (usage & 0xff) << 8; }
function buildTargets() {
  const out = [];
  const add = (label, fw, group="基本") => out.push({label, fw, group});
  add("無効 / No key", 0x00000000, "基本");
  add("Esc", hidFw(0x29)); add("Tab", hidFw(0x2b)); add("Enter", hidFw(0x28));
  add("Backspace", hidFw(0x2a)); add("Space", hidFw(0x2c)); add("Delete", hidFw(0x4c));
  add("Insert", hidFw(0x49)); add("Home", hidFw(0x4a)); add("End", hidFw(0x4d));
  add("Page Up", hidFw(0x4b)); add("Page Down", hidFw(0x4e));
  add("←", hidFw(0x50)); add("↓", hidFw(0x51)); add("↑", hidFw(0x52)); add("→", hidFw(0x4f));

  for (let i=0;i<26;i++) add(String.fromCharCode(65+i), hidFw(0x04+i), "英字");
  for (let i=1;i<=9;i++) add(String(i), hidFw(0x1d+i), "数字");
  add("0", hidFw(0x27), "数字");
  for (let i=1;i<=12;i++) add("F"+i, hidFw(0x39+i), "Fキー");

  add("Left Ctrl", 0x010000, "修飾");
  add("Left Shift", 0x020000, "修飾");
  add("Left Alt", 0x040000, "修飾");
  add("Left Win / Cmd", 0x080000, "修飾");
  add("Right Ctrl", 0x100000, "修飾");
  add("Right Shift", 0x200000, "修飾");
  add("Right Alt", 0x400000, "修飾");
  add("Right Win / Cmd", 0x800000, "修飾");
  add("Fn", 0x0000b000, "RK");
  add("かな / LANG1 (macOS)", hidFw(0x90), "Mac");
  add("英数 / LANG2 (macOS)", hidFw(0x91), "Mac");

  add("- / _", hidFw(0x2d), "記号");
  add("= / +", hidFw(0x2e), "記号");
  add("[ / {", hidFw(0x2f), "記号");
  add("] / }", hidFw(0x30), "記号");
  add("\\ / |", hidFw(0x31), "記号");
  add("; / :", hidFw(0x33), "記号");
  add("' / \"", hidFw(0x34), "記号");
  add("` / ~", hidFw(0x35), "記号");
  add(", / <", hidFw(0x36), "記号");
  add(". / >", hidFw(0x37), "記号");
  add("/ / ?", hidFw(0x38), "記号");

  add("JIS \\ / _ (INT1)", hidFw(0x87), "JIS");
  add("かな / Katakana-Hiragana (INT2)", hidFw(0x88), "JIS");
  add("¥ / | (INT3)", hidFw(0x89), "JIS");
  add("変換 / Henkan (INT4)", hidFw(0x8a), "JIS");
  add("無変換 / Muhenkan (INT5)", hidFw(0x8b), "JIS");
  add("JIS Katakana (LANG3)", hidFw(0x92), "JIS");
  add("JIS Hiragana (LANG4)", hidFw(0x93), "JIS");
  add("全角/半角 (LANG5)", hidFw(0x94), "JIS");

  add("Mute", 0x010000e2, "メディア");
  add("Volume -", 0x010000ea, "メディア");
  add("Volume +", 0x010000e9, "メディア");
  add("Play / Pause", 0x010000cd, "メディア");
  add("Previous Track", 0x010000b6, "メディア");
  add("Next Track", 0x010000b5, "メディア");
  return out;
}

async function init() {
  diag("info", "diagnostics-ready", {version: "read-visual-1"});
  state.profile = await fetch("./profiles/r65-jis-01f7.json").then(r => r.json());
  loadLocal();
  loadTestState();
  renderKeyboard();
  renderTargets();
  updateInspector();
  updateSupport();
  bind();
  updateFnReportUI();
  updateReadUI();
  updatePreviewUI();
}

function storageKey() {
  return "rk65_mapper_" + state.profile.id;
}
function loadLocal() {
  try {
    state.overrides = JSON.parse(localStorage.getItem(storageKey()) || "{}");
  } catch {
    state.overrides = {};
  }
}
function saveLocal() {
  localStorage.setItem(storageKey(), JSON.stringify(state.overrides));
  $("#saved").textContent = "ブラウザ保存済み";
  setTimeout(() => $("#saved").textContent = "", 1200);
}

function testStorageKey() {
  return "rk65_keytest_v2_" + state.profile.id;
}

function loadTestState() {
  try {
    const saved = JSON.parse(localStorage.getItem(testStorageKey()) || "{}");
    state.testedKeys = saved.testedKeys && typeof saved.testedKeys === "object" ? saved.testedKeys : {};
    state.testEvents = Array.isArray(saved.testEvents) ? saved.testEvents.slice(-200) : [];
    state.unmatchedEvents = Array.isArray(saved.unmatchedEvents) ? saved.unmatchedEvents.slice(-50) : [];
    state.fnReportCapture = saved.fnReportCapture && typeof saved.fnReportCapture === "object"
      ? {...saved.fnReportCapture, active: false, status: saved.fnReportCapture.active ? "interrupted" : saved.fnReportCapture.status}
      : null;
    state.fnBrowserEvents = Array.isArray(saved.fnBrowserEvents) ? saved.fnBrowserEvents.slice(-20) : [];
  } catch {
    state.testedKeys = {};
    state.testEvents = [];
    state.unmatchedEvents = [];
  }
}

function saveTestState() {
  localStorage.setItem(testStorageKey(), JSON.stringify({
    testedKeys: state.testedKeys,
    testEvents: state.testEvents.slice(-200),
    unmatchedEvents: state.unmatchedEvents.slice(-50),
    fnReportCapture: state.fnReportCapture,
    fnBrowserEvents: state.fnBrowserEvents.slice(-20)
  }));
}

function bind() {
  $("#connect").addEventListener("click", connect);
  $("#targetSearch").addEventListener("input", renderTargets);
  $("#applyRaw").addEventListener("click", applyRaw);
  $("#resetKey").addEventListener("click", resetSelected);
  $("#resetAll").addEventListener("click", resetAll);
  $("#copyDiag").addEventListener("click", copyDiagnostics);
  $("#readDiagnostic").addEventListener("click", readDiagnostic);
  $("#readLayer").addEventListener("change", () => {
    if (state.matrixResponse && Number($("#readLayer").value) !== state.matrixLayer) {
      state.matrixResponse = null;
      state.backupDownloaded = false;
      $("#matrixViewState").hidden = true;
      $("#readState").textContent = `${Number($("#readLayer").value) === 1 ? "Fnレイヤー" : "通常レイヤー"}を選択中です。キー配列を読み出してください。`;
      renderKeyboard();
      updateInspector();
      updatePreviewUI();
    }
  });
  $("#downloadMatrixBackup").addEventListener("click", downloadMatrixBackup);
  $("#previewBeiYingWrite").addEventListener("click", previewBeiYingWrite);
  $("#copyPackets").addEventListener("click", copyPackets);
  $("#exportBtn").addEventListener("click", exportMappings);
  $("#importInput").addEventListener("change", importMappings);
  $("#toggleTest").addEventListener("click", toggleTestMode);
  $("#prevTest").addEventListener("click", previousTestKey);
  $("#noEventTest").addEventListener("click", recordNoEvent);
  $("#resetTest").addEventListener("click", resetTest);
  $("#copyTest").addEventListener("click", copyTestResults);
  $("#toggleFnReport").addEventListener("click", toggleFnReportCapture);
  $("#writeAck").addEventListener("change", updateWriteUI);
  $("#writeHardware").addEventListener("click", writeHardware);
  window.addEventListener("keydown", captureFnKeyboardEvent, true);
  window.addEventListener("keydown", handleTestKeyDown, true);
  window.addEventListener("keyup", handleTestKeyUp, true);
  window.addEventListener("blur", () => {
    if (!state.testMode) return;
    state.pressedCodes.clear();
    renderKeyboard();
  });
}

function updateSupport() {
  const supported = "hid" in navigator;
  $("#support").textContent = supported
    ? "WebHID対応ブラウザです"
    : "この端末/ブラウザはWebHID非対応です。編集はできますが、実機接続はPC版Chrome/Edge/Operaで行います。";
  $("#support").className = supported ? "status ok" : "status warn";
  $("#connect").disabled = !supported;
}

function renderKeyboard() {
  const box = $("#keyboard");
  box.innerHTML = "";
  const {width, height} = state.profile.canvas;
  box.style.aspectRatio = width + " / " + height;

  for (const key of state.profile.keys.filter(k => !k.hidden)) {
    const [l,t,r,b] = key.rect;
    const btn = document.createElement("button");
    btn.className = "key";
    if (String(state.selected?.id) === key.id) btn.classList.add("selected");
    if (Object.prototype.hasOwnProperty.call(state.overrides, key.bIndex)) btn.classList.add("changed");
    const expectedCode = expectedEventCode(key);
    const testResult = state.testedKeys[key.id];
    const guideKey = currentGuideKey();
    if (state.testMode) btn.classList.add("testing");
    if (testResult?.status === "match") btn.classList.add("tested-match");
    if (testResult?.status === "mismatch") btn.classList.add("tested-mismatch");
    if (testResult?.status === "no-event") btn.classList.add("tested-no-event");
    if (guideKey?.id === key.id) btn.classList.add("guide-current");
    if (key.id === "K61") btn.classList.add("browser-excluded");
    btn.style.left = (l/width*100) + "%";
    btn.style.top = (t/height*100) + "%";
    btn.style.width = ((r-l)/width*100) + "%";
    btn.style.height = ((b-t)/height*100) + "%";
    let readCode = null;
    if (state.matrixResponse && key.bIndex * 4 + 4 <= 504) {
      readCode = decodeBeiYingKeyCode(state.matrixResponse.slice(8 + key.bIndex * 4, 12 + key.bIndex * 4));
      btn.classList.add("read-mapped");
      if (readCode.label === "不明なコード") btn.classList.add("read-unknown");
    }
    btn.innerHTML = readCode
      ? `<span class="read-label">${escapeHtml(readCode.label)}</span><small class="physical-position">${escapeHtml(key.label)} · ${key.id}</small>`
      : `<span>${escapeHtml(key.label)}</span><small>${key.id}</small>`;
    btn.title = `${key.label} · bIndex ${key.bIndex} · default ${key.defaultFw}` +
      (readCode ? ` · 実機: ${readCode.label} · raw ${readCode.raw}` : "") +
      (expectedCode ? ` · event.code ${expectedCode}` : "");
    btn.addEventListener("click", () => {
      if (state.testMode) return;
      state.selected = key;
      renderKeyboard();
      updateInspector();
    });
    box.appendChild(btn);
  }
}


const HID_USAGE_TO_EVENT_CODE = {
  0x28:"Enter", 0x29:"Escape", 0x2a:"Backspace", 0x2b:"Tab", 0x2c:"Space",
  0x2d:"Minus", 0x2e:"Equal", 0x2f:"BracketLeft", 0x30:"BracketRight",
  0x31:"Backslash", 0x32:"IntlHash", 0x33:"Semicolon", 0x34:"Quote",
  0x35:"Backquote", 0x36:"Comma", 0x37:"Period", 0x38:"Slash", 0x39:"CapsLock",
  0x46:"PrintScreen", 0x47:"ScrollLock", 0x48:"Pause", 0x49:"Insert",
  0x4a:"Home", 0x4b:"PageUp", 0x4c:"Delete", 0x4d:"End", 0x4e:"PageDown",
  0x4f:"ArrowRight", 0x50:"ArrowLeft", 0x51:"ArrowDown", 0x52:"ArrowUp",
  0x87:"IntlRo", 0x88:"KanaMode", 0x89:"IntlYen", 0x8a:"Convert", 0x8b:"NonConvert"
};

for (let i = 0; i < 26; i++) HID_USAGE_TO_EVENT_CODE[0x04 + i] = "Key" + String.fromCharCode(65 + i);
for (let i = 1; i <= 9; i++) HID_USAGE_TO_EVENT_CODE[0x1d + i] = "Digit" + i;
HID_USAGE_TO_EVENT_CODE[0x27] = "Digit0";
for (let i = 1; i <= 12; i++) HID_USAGE_TO_EVENT_CODE[0x39 + i] = "F" + i;

const SPECIAL_EVENT_CODES_BY_KEY_ID = {
  K43:"ShiftLeft",
  K54:"ShiftRight",
  K56:"ControlLeft",
  K57:"MetaLeft",
  K58:"AltLeft",
  K60:"AltRight"
};

function expectedEventCode(key) {
  if (!key || key.id === "K61") return null;
  if (SPECIAL_EVENT_CODES_BY_KEY_ID[key.id]) return SPECIAL_EVENT_CODES_BY_KEY_ID[key.id];

  const fw = parseFirmwareCode(key.defaultFw);
  if ((fw & 0xff) === 0 && fw <= 0xffff) {
    const usage = (fw >>> 8) & 0xff;
    return HID_USAGE_TO_EVENT_CODE[usage] || null;
  }

  if (key.id === "K71") return "AudioVolumeMute";
  return null;
}

function testableKeys() {
  return state.profile.keys.filter(key => !key.hidden && key.id !== "K61");
}

function currentGuideKey() {
  if (!state.profile) return null;
  const keys = testableKeys();
  if (!keys.length) return null;
  return keys[Math.max(0, Math.min(state.testIndex, keys.length - 1))] || null;
}

function firstIncompleteIndex() {
  const keys = testableKeys();
  const idx = keys.findIndex(key => !state.testedKeys[key.id]);
  return idx >= 0 ? idx : 0;
}

function setTestIndex(index) {
  const keys = testableKeys();
  if (!keys.length) {
    state.testIndex = 0;
    return;
  }
  state.testIndex = Math.max(0, Math.min(index, keys.length - 1));
  state.waitingForRelease = false;
  state.pressedCodes.clear();
  renderKeyboard();
  updateTestUI();
}

function toggleTestMode() {
  state.testMode = !state.testMode;
  state.pressedCodes.clear();
  state.waitingForRelease = false;
  document.body.classList.toggle("key-test-mode", state.testMode);

  if (state.testMode) {
    state.testIndex = firstIncompleteIndex();
    showToast("ガイド式キー検査を開始しました");
    window.focus();
  } else {
    showToast("キー検査を終了しました");
  }

  renderKeyboard();
  updateTestUI();
}

function handleTestKeyDown(event) {
  if (!state.testMode) return;
  if (state.fnReportCapture?.active) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.repeat || state.waitingForRelease) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const physical = currentGuideKey();
  if (!physical) return;

  const expected = expectedEventCode(physical);
  const observedCode = event.code || "(no code)";
  const status = expected && observedCode === expected ? "match" : "mismatch";

  const record = {
    at: new Date().toISOString(),
    physicalKeyId: physical.id,
    physicalLabel: physical.label,
    bIndex: physical.bIndex,
    expected: {
      eventCode: expected,
      defaultFw: physical.defaultFw,
      vk: physical.vk
    },
    observed: {
      code: observedCode,
      key: event.key,
      keyCode: event.keyCode,
      which: event.which,
      location: event.location,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    },
    status
  };

  state.testedKeys[physical.id] = record;
  state.testEvents.push(record);
  state.testEvents = state.testEvents.slice(-250);
  state.pressedCodes.add(observedCode);
  state.waitingForRelease = true;
  saveTestState();

  $("#lastEvent").textContent =
    `物理: ${physical.label} (${physical.id}) / 期待: ${expected || "未定義"} / 実測: ${observedCode} / key=${event.key} / ${status === "match" ? "一致" : "不一致"}`;
  $("#unmatchedEvent").hidden = status === "match";
  if (status !== "match") {
    $("#unmatchedEvent").textContent =
      `不一致を記録: ${physical.label} は現在 ${observedCode} を送信しています。既存リマップやMacモードの影響でも正常に記録できます。`;
  }

  renderKeyboard();
  updateTestUI();
}

function captureFnKeyboardEvent(event) {
  if (!state.fnReportCapture?.active || state.fnBrowserEvents.length >= 20) return;
  state.fnBrowserEvents.push({
    at: new Date().toISOString(),
    code: event.code || "",
    key: event.key || "",
    keyCode: event.keyCode,
    location: event.location
  });
  state.fnReportCapture.keyboardEventObserved = true;
  saveTestState();
  updateFnReportUI();
}

function handleFnInputReport(event) {
  if (!state.fnReportCapture?.active) return;
  const bytes = Array.from(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
  state.fnReportCapture.reports.push({
    at: new Date().toISOString(),
    reportId: event.reportId,
    dataHex: bytes.map(value => value.toString(16).padStart(2, "0")).join(" ").toUpperCase(),
    byteLength: bytes.length
  });
  state.fnReportCapture.reports = state.fnReportCapture.reports.slice(-20);
  saveTestState();
  updateFnReportUI();
}

function toggleFnReportCapture() {
  if (state.fnReportCapture?.active) {
    state.device?.removeEventListener("inputreport", handleFnInputReport);
    state.fnReportCapture.active = false;
    state.fnReportCapture.finishedAt = new Date().toISOString();
    state.fnReportCapture.status = state.fnReportCapture.reports.length
      ? "input-report-seen"
      : state.fnBrowserEvents.length
        ? "keyboard-event-seen"
        : "no-report";
  } else {
    if (!state.device?.opened) {
      showToast("先にRK65を接続してください", true);
      return;
    }
    state.fnBrowserEvents = [];
    state.fnReportCapture = {
      startedAt: new Date().toISOString(),
      active: true,
      status: "listening",
      reports: [],
      keyboardEventObserved: false,
      inputReportInterfaces: (state.device.collections || []).reduce((total, collection) =>
        total + (collection.inputReports || []).length, 0)
    };
    state.device.addEventListener("inputreport", handleFnInputReport);
  }
  saveTestState();
  updateFnReportUI();
}

function updateFnReportUI() {
  const button = $("#toggleFnReport");
  const status = $("#fnReportStatus");
  if (!button || !status) return;
  const capture = state.fnReportCapture;
  button.disabled = !capture?.active && !state.device?.opened;
  button.textContent = capture?.active ? "Fn入力レポート読取を終了" : "Fnの入力レポート読取を開始";
  if (capture?.active) {
    status.textContent = `Fnを単独で押してください · 入力レポート ${capture.reports.length}件 / KeyboardEvent ${state.fnBrowserEvents.length}件`;
  } else if (capture?.status === "input-report-seen") {
    status.textContent = `読取完了 · 入力レポート ${capture.reports.length}件 / KeyboardEvent ${state.fnBrowserEvents.length}件。Fnを押した間に届いたデータを保存しました。`;
  } else if (capture?.status === "keyboard-event-seen") {
    status.textContent = `KeyboardEvent ${state.fnBrowserEvents.length}件を保存しました。入力レポートは届いていません。`;
  } else if (capture?.status === "no-report") {
    status.textContent = "読取中にイベントは届きませんでした。Fnが独立レポートを送らない可能性があります。";
  } else if (capture?.status === "interrupted") {
    status.textContent = "前回のFn読取はページ再読み込みで中断しました。結果はJSONに保持されています。";
  } else if (!state.device?.opened) {
    status.textContent = "RK65接続後、Fnを単独で押して入力レポートを確認できます。";
  }
}

function handleTestKeyUp(event) {
  if (!state.testMode) return;
  event.preventDefault();
  event.stopPropagation();
  state.pressedCodes.delete(event.code);

  if (state.waitingForRelease) {
    state.waitingForRelease = false;
    const keys = testableKeys();
    if (state.testIndex < keys.length - 1) {
      state.testIndex += 1;
    }
  }

  renderKeyboard();
  updateTestUI();
}

function previousTestKey() {
  if (!state.testMode) {
    showToast("先に検査を開始してください", true);
    return;
  }
  setTestIndex(state.testIndex - 1);
}

function recordNoEvent() {
  if (!state.testMode) {
    showToast("先に検査を開始してください", true);
    return;
  }

  const physical = currentGuideKey();
  if (!physical) return;

  const record = {
    at: new Date().toISOString(),
    physicalKeyId: physical.id,
    physicalLabel: physical.label,
    bIndex: physical.bIndex,
    expected: {
      eventCode: expectedEventCode(physical),
      defaultFw: physical.defaultFw,
      vk: physical.vk
    },
    observed: null,
    status: "no-event"
  };

  state.testedKeys[physical.id] = record;
  state.testEvents.push(record);
  state.testEvents = state.testEvents.slice(-250);
  saveTestState();

  $("#lastEvent").textContent =
    `物理: ${physical.label} (${physical.id}) / 反応なしとして記録`;
  $("#unmatchedEvent").hidden = false;
  $("#unmatchedEvent").textContent =
    `KeyboardEventが来ないキーとして保存しました。MacのJISキーなどではこの結果自体が重要です。`;

  const keys = testableKeys();
  if (state.testIndex < keys.length - 1) state.testIndex += 1;
  renderKeyboard();
  updateTestUI();
}

function resetTest() {
  state.testedKeys = {};
  state.testEvents = [];
  state.unmatchedEvents = [];
  state.pressedCodes.clear();
  state.waitingForRelease = false;
  state.testIndex = 0;
  if (state.fnReportCapture?.active) state.device?.removeEventListener("inputreport", handleFnInputReport);
  state.fnReportCapture = null;
  state.fnBrowserEvents = [];
  saveTestState();
  $("#lastEvent").textContent = "検査を開始すると、指定した物理キーに次のKeyboardEventを紐づけます。";
  $("#unmatchedEvent").hidden = true;
  renderKeyboard();
  updateTestUI();
  updateFnReportUI();
  showToast("キー検査結果をリセットしました");
}

function updateTestUI() {
  if (!state.profile) return;

  const targets = testableKeys();
  const records = targets.map(k => state.testedKeys[k.id]).filter(Boolean);
  const tested = records.length;
  const matches = records.filter(r => r.status === "match").length;
  const mismatches = records.filter(r => r.status === "mismatch").length;
  const noEvents = records.filter(r => r.status === "no-event").length;
  const total = targets.length;
  const remain = Math.max(0, total - tested);
  const percent = total ? Math.round((tested / total) * 100) : 0;
  const guide = currentGuideKey();

  $("#testCount").textContent = tested;
  $("#testTotal").textContent = total;
  $("#testRemaining").textContent = remain;
  $("#testMatch").textContent = matches;
  $("#testMismatch").textContent = mismatches;
  $("#testNoEvent").textContent = noEvents;
  $("#testProgressBar").style.width = percent + "%";

  $("#testSummary").textContent = state.testMode
    ? `検査中 · ${tested}/${total} (${percent}%)`
    : `検査モードOFF · 前回 ${tested}/${total}`;

  $("#toggleTest").textContent = state.testMode ? "検査を終了" : "検査を開始";
  $("#toggleTest").classList.toggle("activeTest", state.testMode);
  $("#prevTest").disabled = !state.testMode || state.testIndex <= 0;
  $("#noEventTest").disabled = !state.testMode;

  if (state.testMode && guide) {
    $("#guideKeyLabel").textContent = guide.label;
    $("#guideKeyMeta").textContent =
      `${guide.id} / bIndex ${guide.bIndex} / 期待 ${expectedEventCode(guide) || "未定義"} / default ${guide.defaultFw}`;
  } else {
    $("#guideKeyLabel").textContent = "—";
    $("#guideKeyMeta").textContent = "検査開始後、ここに押す物理キーを表示します。";
  }
}

async function copyTestResults() {
  const targets = testableKeys();
  const result = {
    format: "rk65-jis-guided-key-test-v2",
    profile: state.profile.id,
    generatedAt: new Date().toISOString(),
    method: "guided-physical-key-capture",
    results: [ ...targets.map(key => {
      const record = state.testedKeys[key.id] || null;
      return {
        physicalKeyId: key.id,
        physicalLabel: key.label,
        bIndex: key.bIndex,
        expected: {
          eventCode: expectedEventCode(key),
          defaultFw: key.defaultFw,
          vk: key.vk
        },
        observed: record?.observed ?? null,
        status: record?.status ?? "untested",
        recordedAt: record?.at ?? null
      };
    }), {
      physicalKeyId: "K61",
      physicalLabel: "Fn",
      expected: { firmwareCode: "0x0000B000", eventCode: "Fn (platform-dependent)" },
      observed: {
        inputReports: state.fnReportCapture?.reports || [],
        keyboardEvents: state.fnBrowserEvents
      },
      status: state.fnReportCapture?.status || (state.fnBrowserEvents.length ? "keyboard-event-seen" : "not-tested"),
      reason: "WebHID inputreport と KeyboardEvent の読み取り結果"
    }],
    recentEvents: state.testEvents.slice(-150)
  };

  await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  showToast("ガイド式キー検査結果をコピーしました");
}


function currentCode(key) {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(state.overrides, key.bIndex)
    ? state.overrides[key.bIndex]
    : key.defaultFw;
}

function updateInspector() {
  const key = state.selected;
  $("#selectedName").textContent = key ? key.label : "キーを選択";
  $("#selectedMeta").textContent = key
    ? `${key.id} / bIndex ${key.bIndex} / VK ${key.vk}`
    : "キーボード上のキーを押してください";
  $("#defaultCode").textContent = key ? key.defaultFw : "—";
  $("#currentCode").textContent = key ? formatHex(parseFirmwareCode(currentCode(key))) : "—";
  $("#rawCode").value = key ? formatHex(parseFirmwareCode(currentCode(key))) : "";
  const readAssignment = $("#readAssignment");
  const hasReadAssignment = !!(key && state.matrixResponse && key.bIndex * 4 + 4 <= 504);
  readAssignment.hidden = !hasReadAssignment;
  if (hasReadAssignment) {
    const decoded = decodeBeiYingKeyCode(state.matrixResponse.slice(8 + key.bIndex * 4, 12 + key.bIndex * 4));
    $("#readAssignmentLayer").textContent = state.matrixLayer === 1 ? "Fnレイヤー" : "通常レイヤー";
    $("#readAssignmentName").textContent = decoded.label;
    $("#readAssignmentRaw").textContent = `slot ${key.bIndex} · ${decoded.raw}`;
  }
  $("#applyRaw").disabled = !key;
  $("#resetKey").disabled = !key;
  updateWriteUI();
  renderTargets();
  updateTestUI();
}

function exactTargetDeviceStatus() {
  const device = state.device;
  if (!device?.opened) {
    diag("debug", "target-check", {ok: false, reason: "RK65未接続"});
    return {ok:false, reason:"RK65未接続"};
  }

  const expectedVid = parseInt(state.profile.vendorId.slice(2), 16);
  const expectedPid = parseInt(state.profile.productId.slice(2), 16);
  if (device.vendorId !== expectedVid || device.productId !== expectedPid) {
    diag("warn", "target-check", {
      ok: false,
      reason: "VID/PID mismatch",
      actual: {vendorId: formatHex(device.vendorId, 4), productId: formatHex(device.productId, 4)},
      expected: {vendorId: formatHex(expectedVid, 4), productId: formatHex(expectedPid, 4)}
    });
    return {ok:false, reason:`対象外 VID ${formatHex(device.vendorId,4)} / PID ${formatHex(device.productId,4)}`};
  }

  const configCollection = (device.collections || []).find(collection =>
    collection.usagePage === CONFIG_USAGE_PAGE && collection.usage === CONFIG_USAGE
  );
  if (!configCollection) {
    diag("warn", "target-check", {ok: false, reason: "RK設定用HID interface未検出"});
    return {ok:false, reason:"RK設定用HID interface未検出"};
  }

  const hasReport0A = (configCollection.featureReports || []).some(report => report.reportId === 0x0a);
  diag("debug", "feature-report-detection", {
    collection: {
      usagePage: formatHex(configCollection.usagePage, 4),
      usage: formatHex(configCollection.usage, 4)
    },
    featureReports: (configCollection.featureReports || []).map(report => ({reportId: report.reportId, byteLength: report.byteLength ?? null})),
    report0A: hasReport0A
  });
  if (!hasReport0A) return {ok:false, reason:"Feature Report 0x0A未検出"};

  return {ok:true, reason:"258A:01F7 / report 0x0A確認"};
}

function nonMacWriteOverrides() {
  const allowed = new Set([hidFw(0x90), hidFw(0x91)]);
  return Object.entries(state.overrides).filter(([, value]) => {
    try {
      return !allowed.has(parseFirmwareCode(value));
    } catch {
      return true;
    }
  });
}

function updateWriteUI() {
  const button = $("#writeHardware");
  const stateBox = $("#writeState");
  const ack = !!$("#writeAck")?.checked;
  const target = exactTargetDeviceStatus();
  const changed = Object.keys(state.overrides).length;
  const nonMac = nonMacWriteOverrides();

  if (!button || !stateBox) return;

  if (isBeiYingReadTarget(state.device)) {
    button.disabled = true;
    stateBox.textContent = "HARDWARE WRITE: LOCKED · BeiYing 0x06書き込みは実機未検証";
    stateBox.className = "locked";
    stateBox.title = "バックアップと変更前確認のみ利用できます";
    updatePreviewUI();
    return;
  }

  button.disabled = !(target.ok && ack && changed > 0 && nonMac.length === 0);

  if (!target.ok) {
    stateBox.textContent = "HARDWARE WRITE: LOCKED · " + target.reason;
    stateBox.className = "locked";
  } else if (!changed) {
    stateBox.textContent = "HARDWARE WRITE: READY · 変更なし";
    stateBox.className = "locked";
  } else if (nonMac.length) {
    stateBox.textContent = `HARDWARE WRITE: LOCKED · LANG1/LANG2以外の変更 ${nonMac.length}件`;
    stateBox.className = "locked";
  } else if (!ack) {
    stateBox.textContent = `HARDWARE WRITE: READY · ${changed}キー変更 · 安全確認待ち`;
    stateBox.className = "locked";
  } else {
    stateBox.textContent = `HARDWARE WRITE: READY · ${changed}キー変更`;
    stateBox.className = "status ok";
  }
  stateBox.title = target.reason;
  updatePreviewUI();
}

async function writeHardware() {
  diag("info", "write-request", {overrides: summarizeOverrides(state.profile, state.overrides)});
  if (isBeiYingReadTarget(state.device)) {
    showToast("BeiYing方式の実機書き込みはまだロック中です", true);
    return;
  }
  const target = exactTargetDeviceStatus();
  if (!target.ok) {
    showToast("書き込み不可: " + target.reason, true);
    updateWriteUI();
    return;
  }
  if (!$("#writeAck").checked) {
    showToast("全キーマップ上書きの確認が必要です", true);
    return;
  }

  const changed = Object.keys(state.overrides).length;
  if (!changed) {
    showToast("書き込む変更がありません", true);
    return;
  }

  const nonMac = nonMacWriteOverrides();
  if (nonMac.length) {
    showToast("今回はLANG1/LANG2以外の本体書き込みを禁止しています", true);
    updateWriteUI();
    return;
  }

  const accepted = window.confirm(
    `RK-R65へ${changed}キー分の変更を含む全キーマップを送信します。\n\n` +
    "RK firmwareの仕様上、1キー変更でも全キーマップを書き込みます。\n" +
    "このブラウザに記録されていない既存リマップは初期配列へ戻る可能性があります。\n\n" +
    "続行しますか？"
  );
  if (!accepted) return;

  const button = $("#writeHardware");
  button.disabled = true;
  button.textContent = "書き込み中…";

  try {
    const reports = buildLegacyReports(state.profile, state.overrides);
    diag("info", "write-preflight", {
      overrideCount: changed,
      overrides: summarizeOverrides(state.profile, state.overrides),
      reports: summarizeReports(reports)
    });
    for (const [index, report] of reports.entries()) {
      const reportId = report[0];
      diag("debug", "sendFeatureReport", {
        index: index + 1,
        total: reports.length,
        reportId,
        byteLength: report.length,
        hex: Array.from(report, byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")
      });
      await state.device.sendFeatureReport(reportId, report.slice(1));
    }
    diag("info", "write-success", {reportsSent: reports.length, overrideCount: changed});
    $("#writeState").textContent = `WRITE COMPLETE · ${changed}キー変更を送信`;
    $("#writeState").className = "status ok";
    showToast("RK-R65本体へキーマップを書き込みました");
  } catch (e) {
    diag("error", "write-failure", {message: e?.message || String(e), error: e});
    $("#writeState").textContent = "WRITE FAILED";
    $("#writeState").className = "status warn";
    showToast("書き込み失敗: " + (e?.message || String(e)), true);
  } finally {
    button.textContent = "かな / 英数の変更を本体へ書き込む";
    updateWriteUI();
  }
}

function renderTargets() {
  const list = $("#targets");
  if (!list) return;
  const q = ($("#targetSearch")?.value || "").trim().toLowerCase();
  const items = TARGETS.filter(x =>
    !q || x.label.toLowerCase().includes(q) || formatHex(x.fw).toLowerCase().includes(q)
  );
  list.innerHTML = "";
  for (const item of items) {
    const b = document.createElement("button");
    b.className = "target";
    b.disabled = !state.selected;
    b.innerHTML = `<span>${escapeHtml(item.label)}</span><code>${formatHex(item.fw)}</code>`;
    b.addEventListener("click", () => applyCode(item.fw));
    list.appendChild(b);
  }
}

function applyCode(code) {
  if (!state.selected) return;
  if (code === hidFw(0x90) || code === hidFw(0x91)) {
    diag("info", "language-selection", {
      keyId: state.selected.id,
      bIndex: state.selected.bIndex,
      language: code === hidFw(0x90) ? "LANG1" : "LANG2",
      firmwareCode: formatHex(code)
    });
  }
  const defaultValue = parseFirmwareCode(state.selected.defaultFw);
  if ((code >>> 0) === defaultValue) delete state.overrides[state.selected.bIndex];
  else state.overrides[state.selected.bIndex] = formatHex(code >>> 0);
  saveLocal();
  renderKeyboard();
  updateInspector();
}

function applyRaw() {
  if (!state.selected) return;
  try {
    applyCode(parseFirmwareCode($("#rawCode").value));
    showToast("ローカルのキーマップに反映しました");
  } catch (e) {
    showToast(e.message, true);
  }
}
function resetSelected() {
  if (!state.selected) return;
  delete state.overrides[state.selected.bIndex];
  saveLocal();
  renderKeyboard();
  updateInspector();
}
function resetAll() {
  state.overrides = {};
  saveLocal();
  renderKeyboard();
  updateInspector();
  showToast("変更をすべて初期化しました");
}

async function connect() {
  diag("info", "connect-start", {filters: [{vendorId: formatHex(RK_VENDOR_ID, 4), usagePage: formatHex(CONFIG_USAGE_PAGE, 4), usage: formatHex(CONFIG_USAGE, 4)}]});
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{vendorId: RK_VENDOR_ID, usagePage: CONFIG_USAGE_PAGE, usage: CONFIG_USAGE}]
    });
    if (!devices.length) return;
    const device = devices[0];
    diag("info", "device-selected", summarizeHidDevice(device));
    if (!device.opened) await device.open();
    state.device = device;
    state.matrixResponse = null;
    state.matrixLayer = Number($("#readLayer").value);
    state.backupDownloaded = false;
    state.previewSignature = null;
    renderKeyboard();
    $("#matrixViewState").hidden = true;
    updateInspector();
    $("#readState").textContent = "接続しました。読み取るレイヤーを選択してください。";
    diag("info", "device-opened", summarizeHidDevice(device));
    diag("info", "hid-collections", summarizeHidCollections(device.collections));
    const samePid = device.productId === parseInt(state.profile.productId.slice(2), 16);
    $("#device").textContent =
      `${device.productName || "RK Keyboard"} / VID ${formatHex(device.vendorId,4)} / PID ${formatHex(device.productId,4)}` +
      (samePid ? " / 01F7候補一致" : " / 01F7とは別PID");
    $("#device").className = samePid ? "status ok" : "status warn";
    updateFnReportUI();
    updateWriteUI();
    updateReadUI();
    updatePreviewUI();
    diag("info", "connect-success", {
      samePid,
      vendorId: formatHex(device.vendorId, 4),
      productId: formatHex(device.productId, 4),
      lang1: formatHex(0x9000),
      lang2: formatHex(0x9100),
      target: exactTargetDeviceStatus()
    });
    showToast(samePid ? "RK-R65 01F7を接続しました" : "接続しましたが01F7とは別PIDです", !samePid);
  } catch (e) {
    diag("error", "connect-failure", {message: e?.message || String(e), error: e});
    showToast(e?.message || String(e), true);
  }
}

async function copyDiagnostics() {
  const info = {
    mapperProfile: state.profile.id,
    expectedPid: state.profile.productId,
    device: state.device ? summarizeHidDevice(state.device) : null,
    overrides: state.overrides,
    userAgent: navigator.userAgent
  };
  await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
  showToast("診断情報をコピーしました");
}

async function copyPackets() {
  const reports = buildLegacyReports(state.profile, state.overrides);
  await navigator.clipboard.writeText(reportsToHex(reports));
  showToast("9レポートのプレビューをコピーしました");
}

function exportMappings() {
  const payload = {
    format: "rk65-jis-mapper-profile-v1",
    profile: state.profile.id,
    createdAt: new Date().toISOString(),
    overrides: state.overrides
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rk65-jis-keymap.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importMappings(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.overrides || typeof data.overrides !== "object") throw new Error("overrides がありません");
    for (const value of Object.values(data.overrides)) parseFirmwareCode(value);
    state.overrides = data.overrides;
    saveLocal();
    renderKeyboard();
    updateInspector();
    showToast("キーマップを読み込みました");
  } catch (e) {
    showToast("読み込み失敗: " + e.message, true);
  } finally {
    event.target.value = "";
  }
}

function showToast(message, error=false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = "toast show" + (error ? " error" : "");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.className = "toast", 2600);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

init().catch(e => {
  $("#fatal").textContent = e?.stack || String(e);
  $("#fatal").hidden = false;
});
