import {
  RK_VENDOR_ID,
  CONFIG_USAGE_PAGE,
  CONFIG_USAGE,
  formatHex,
  summarizeHidDevice,
  isBeiYingReadTarget,
  buildBeiYingReadRequest,
  isBeiYingIdentifyResponse,
  parseBeiYingKeyMatrixResponse,
  decodeBeiYingKeyCode,
  formatBeiYingKeycapLabel,
  compareBeiYingMatrixKey
} from "./protocol.js?comparison=1";

const $ = selector => document.querySelector(selector);
const state = {
  profile: null,
  reference: null,
  device: null,
  response: null,
  layer: 0,
  selectedKey: null,
  comparisons: new Map(),
  reading: false
};

function updateControls() {
  const connected = isBeiYingReadTarget(state.device);
  $("#readLayer").disabled = !connected || state.reading;
  $("#readLayout").disabled = !connected || state.reading;
  if (!connected) $("#device").textContent = state.device
    ? `対象外のデバイスです · ${formatHex(state.device.vendorId, 4)}:${formatHex(state.device.productId, 4)} · RK R65 01F7が必要です`
    : "未接続。PC版 Chrome / Edge / Opera から接続してください。";
}

function setReadStatus(message, kind = "") {
  const status = $("#readState");
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

async function connect() {
  if (!("hid" in navigator)) {
    setReadStatus("このブラウザはWebHIDに対応していません。PC版Chrome / Edgeをお使いください。", "warn");
    return;
  }
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{vendorId: RK_VENDOR_ID, usagePage: CONFIG_USAGE_PAGE, usage: CONFIG_USAGE}]
    });
    if (!devices.length) return;
    const device = devices[0];
    if (!device.opened) await device.open();
    state.device = device;
    state.response = null;
    state.comparisons.clear();
    state.selectedKey = null;
    $("#device").textContent = `${device.productName || "RK Keyboard"} · VID ${formatHex(device.vendorId, 4)} / PID ${formatHex(device.productId, 4)}`;
    $("#device").className = isBeiYingReadTarget(device) ? "status ok" : "status warn";
    clearReadView();
    updateControls();
    setReadStatus(isBeiYingReadTarget(device)
      ? "接続しました。通常レイヤーまたはFnレイヤーを選び、読み取ってください。"
      : "接続したデバイスは対象外です。RK R65 (VID 0x258A / PID 0x01F7) が必要です.",
    isBeiYingReadTarget(device) ? "ok" : "warn");
  } catch (error) {
    setReadStatus(`接続失敗: ${error?.message || String(error)}`, "warn");
  }
}

function clearReadView() {
  $("#keyboardWrap").hidden = true;
  $("#comparisonLegend").hidden = true;
  $("#comparisonSummary").hidden = true;
  $("#keyComparison").hidden = true;
  $("#keyboard").replaceChildren();
  $("#selectedName").textContent = "キーを選択";
  $("#selectedMeta").textContent = "読み取り後、キーボード図のキーを選択してください。";
}

async function readLayout() {
  if (!isBeiYingReadTarget(state.device) || state.reading) return;
  state.reading = true;
  state.layer = Number($("#readLayer").value);
  state.response = null;
  state.comparisons.clear();
  state.selectedKey = null;
  clearReadView();
  updateControls();
  setReadStatus("識別情報を読み取り中…");
  let stage = "identify";
  try {
    const identifyRequest = buildBeiYingReadRequest("identify");
    await state.device.sendFeatureReport(0x06, identifyRequest);
    await new Promise(resolve => setTimeout(resolve, 500));
    const identifyView = await state.device.receiveFeatureReport(0x06);
    const identify = new Uint8Array(identifyView.buffer, identifyView.byteOffset, identifyView.byteLength);
    if (!isBeiYingIdentifyResponse(identify)) throw new Error("識別応答が不正です");

    stage = "key-matrix";
    const request = buildBeiYingReadRequest("key-matrix", state.layer);
    await state.device.sendFeatureReport(0x06, request);
    const view = await state.device.receiveFeatureReport(0x06);
    const response = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    parseBeiYingKeyMatrixResponse(response, state.layer);
    state.response = Uint8Array.from(response);
    const referenceLayer = state.reference.layers?.[String(state.layer)];
    for (const key of state.profile.keys.filter(item => !item.hidden)) {
      state.comparisons.set(key.id,
        compareBeiYingMatrixKey(state.response, referenceLayer?.slots, state.layer, key.bIndex));
    }
    const changedKey = state.profile.keys.find(key => !key.hidden &&
      state.comparisons.get(key.id)?.status === "different");
    state.selectedKey = changedKey || state.profile.keys.find(key => !key.hidden) || null;
    renderKeyboard();
    renderInspector();
    renderSummary();
    $("#keyboardWrap").hidden = false;
    $("#comparisonLegend").hidden = false;
    const layerName = state.layer === 1 ? "Fnレイヤー" : "通常レイヤー";
    setReadStatus(`${layerName}の読み出し完了 · 504バイト · 読み取り専用`, "ok");
  } catch (error) {
    setReadStatus(`読み取り失敗 (${stage}): ${error?.message || String(error)}`, "warn");
  } finally {
    state.reading = false;
    updateControls();
  }
}

function renderKeyboard() {
  const container = $("#keyboard");
  container.replaceChildren();
  const {width, height} = state.profile.canvas;
  container.style.aspectRatio = `${width} / ${height}`;
  for (const key of state.profile.keys.filter(item => !item.hidden)) {
    const comparison = state.comparisons.get(key.id);
    const decoded = decodeBeiYingKeyCode(state.response.slice(8 + key.bIndex * 4, 12 + key.bIndex * 4));
    const button = document.createElement("button");
    const [left, top, right, bottom] = key.rect;
    button.type = "button";
    button.className = `key layout-key layout-${comparison.status}`;
    if (decoded.label === "不明なコード" || decoded.label === "未割り当て") button.classList.add("layout-unknown");
    if (state.selectedKey?.id === key.id) button.classList.add("selected");
    button.style.left = `${left / width * 100}%`;
    button.style.top = `${top / height * 100}%`;
    button.style.width = `${(right - left) / width * 100}%`;
    button.style.height = `${(bottom - top) / height * 100}%`;
    const assignment = document.createElement("span");
    assignment.className = "read-label";
    assignment.textContent = formatBeiYingKeycapLabel(decoded.label);
    assignment.setAttribute("aria-label", decoded.label);
    const physical = document.createElement("small");
    physical.className = "physical-position";
    physical.textContent = `${key.label} · ${key.id}`;
    const badge = document.createElement("small");
    badge.className = "layout-state";
    badge.textContent = comparison.status === "match" ? "一致" : comparison.status === "different" ? "差異" : "基準なし";
    button.title = `物理位置 ${key.label} (${key.id}) · 割り当て ${decoded.label} · ${comparison.status}`;
    button.setAttribute("aria-label", `${key.label} (${key.id}): ${decoded.label}、${comparison.status}`);
    button.append(assignment, physical, badge);
    button.addEventListener("click", () => {
      state.selectedKey = key;
      renderKeyboard();
      renderInspector();
    });
    container.append(button);
  }
}

function renderInspector() {
  const key = state.selectedKey;
  const comparison = key && state.comparisons.get(key.id);
  if (!key || !comparison) {
    $("#keyComparison").hidden = true;
    return;
  }
  const live = decodeBeiYingKeyCode(comparison.live);
  $("#selectedName").textContent = key.label;
  $("#selectedMeta").textContent = `${key.id} / slot ${key.bIndex} / ${state.layer === 1 ? "Fnレイヤー" : "通常レイヤー"}`;
  $("#keyComparison").hidden = false;
  const status = $("#keyComparisonStatus");
  status.className = `keyComparisonStatus ${comparison.status}`;
  status.textContent = comparison.status === "match" ? "基準と一致"
    : comparison.status === "different" ? "基準と差異あり"
      : "比較基準なし";
  $("#actualAssignment").textContent = live.label;
  $("#actualRaw").textContent = live.raw;
  const referenceAssignment = $("#referenceAssignment");
  const referenceRaw = $("#referenceRaw");
  if (comparison.reference) {
    const decodedReference = decodeBeiYingKeyCode(comparison.reference);
    referenceAssignment.textContent = decodedReference.label;
    referenceRaw.textContent = decodedReference.raw;
  } else {
    referenceAssignment.textContent = "—";
    referenceRaw.textContent = "基準データなし";
  }
}

function renderSummary() {
  const counts = {match: 0, different: 0, "no-reference": 0};
  for (const result of state.comparisons.values()) counts[result.status]++;
  const summary = $("#comparisonSummary");
  summary.hidden = false;
  summary.innerHTML = `<strong>${state.layer === 1 ? "Fnレイヤー" : "通常レイヤー"}の比較</strong><br>` +
    `<span class="matchCount">一致 ${counts.match}</span> · ` +
    `<span class="differentCount">差異 ${counts.different}</span> · ` +
    `<span class="noReferenceCount">基準なし ${counts["no-reference"]}</span><br>` +
    `<small>基準: ${escapeHtml(state.reference.capturedAt)} · 最後に確認した配列（工場出荷時設定ではありません）</small>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function init() {
  state.profile = await fetch("./profiles/r65-jis-01f7.json").then(response => response.json());
  state.reference = await fetch("./profiles/r65-jis-01f7-reference.json").then(response => response.json());
  const supported = "hid" in navigator;
  $("#support").textContent = supported ? "WebHID対応ブラウザです" : "WebHID非対応です。PC版Chrome / Edgeをお使いください。";
  $("#support").className = supported ? "status ok" : "status warn";
  $("#connect").disabled = !supported;
  $("#connect").addEventListener("click", connect);
  $("#readLayout").addEventListener("click", readLayout);
  $("#readLayer").addEventListener("change", () => {
    if (!state.response || Number($("#readLayer").value) === state.layer) return;
    state.response = null;
    state.comparisons.clear();
    state.selectedKey = null;
    clearReadView();
    setReadStatus("レイヤーを選択しました。新しい層を読み取ってください。");
  });
  updateControls();
}

init().catch(error => setReadStatus(`ページ初期化失敗: ${error?.message || String(error)}`, "warn"));
