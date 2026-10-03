import {
  RK_VENDOR_ID,
  CONFIG_USAGE_PAGE,
  CONFIG_USAGE,
  formatHex,
  parseFirmwareCode,
  buildLegacyReports,
  reportsToHex,
  summarizeHidDevice
} from "./protocol.js";

const $ = (s) => document.querySelector(s);
const state = {
  profile: null,
  selected: null,
  overrides: {},
  device: null
};

const TARGETS = buildTargets();

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
  state.profile = await fetch("./profiles/r65-jis-01f7.json").then(r => r.json());
  loadLocal();
  renderKeyboard();
  renderTargets();
  updateInspector();
  updateSupport();
  bind();
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

function bind() {
  $("#connect").addEventListener("click", connect);
  $("#targetSearch").addEventListener("input", renderTargets);
  $("#applyRaw").addEventListener("click", applyRaw);
  $("#resetKey").addEventListener("click", resetSelected);
  $("#resetAll").addEventListener("click", resetAll);
  $("#copyDiag").addEventListener("click", copyDiagnostics);
  $("#copyPackets").addEventListener("click", copyPackets);
  $("#exportBtn").addEventListener("click", exportMappings);
  $("#importInput").addEventListener("change", importMappings);
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
    btn.style.left = (l/width*100) + "%";
    btn.style.top = (t/height*100) + "%";
    btn.style.width = ((r-l)/width*100) + "%";
    btn.style.height = ((b-t)/height*100) + "%";
    btn.innerHTML = `<span>${escapeHtml(key.label)}</span><small>${key.id}</small>`;
    btn.title = `${key.label} · bIndex ${key.bIndex} · default ${key.defaultFw}`;
    btn.addEventListener("click", () => {
      state.selected = key;
      renderKeyboard();
      updateInspector();
    });
    box.appendChild(btn);
  }
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
  $("#applyRaw").disabled = !key;
  $("#resetKey").disabled = !key;
  $("#writeState").textContent = "HARDWARE WRITE: LOCKED";
  $("#writeState").title = "実機のPIDと公式Web Appの書き込みプロトコル確認後に解除します";
  renderTargets();
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
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{vendorId: RK_VENDOR_ID, usagePage: CONFIG_USAGE_PAGE, usage: CONFIG_USAGE}]
    });
    if (!devices.length) return;
    const device = devices[0];
    if (!device.opened) await device.open();
    state.device = device;
    const samePid = device.productId === parseInt(state.profile.productId.slice(2), 16);
    $("#device").textContent =
      `${device.productName || "RK Keyboard"} / VID ${formatHex(device.vendorId,4)} / PID ${formatHex(device.productId,4)}` +
      (samePid ? " / 01F7候補一致" : " / 01F7とは別PID");
    $("#device").className = samePid ? "status ok" : "status warn";
    showToast("接続情報を取得しました。書き込みはまだロック中です。");
  } catch (e) {
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
