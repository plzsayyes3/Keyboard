const KEY_FALLBACKS = { KeyQ: '小', KeyT: '←', KeyY: '→', KeyU: 'BS', Space: '空白' };

export function renderApp(root, state) {
  root.innerHTML = `<input id="converted-input" class="converted-capture" aria-label="変換済み入力の受け取り欄" autocomplete="off" autocapitalize="none" spellcheck="false"><header class="hero"><div><p class="eyebrow">NAGINATA PRACTICE</p><h1>薙刀式タイピング練習</h1><p class="subtitle">押すキーを意識しながら、基礎文字から短文まで練習できます。</p></div><div class="source-note">${escapeHtml(state.layout.name)}<br><span>${escapeHtml(state.layout.version ?? '')}</span></div></header><section class="controls panel"><label>配列<select id="layout-select"></select></label><label>入力モード<select id="mode-select"><option value="site">サイト内変換：物理キー</option><option value="converted">変換済み入力：かな出力</option></select></label><label>レッスン<select id="lesson-select"></select></label><button id="restart" class="secondary">最初から</button></section><main class="practice-grid"><section class="panel task-panel"><div class="task-meta"><span id="lesson-label"></span><span id="progress"></span></div><div class="task-text" id="task-text">読み込み中…</div><div class="expected" id="expected"></div><div class="feedback" id="feedback" aria-live="polite">練習を始めると結果が表示されます。</div><div class="stats"><div><strong id="accuracy" class="accuracy-value">100%</strong><span>正確率</span></div><div><strong id="correct">0</strong><span>正解</span></div><div><strong id="mistakes">0</strong><span>誤入力</span></div></div><div class="error-log" id="error-log"></div></section><section class="panel keyboard-panel"><div class="keyboard-title"><span>キーガイド</span><span id="held-label">押下なし</span></div><div class="keyboard" id="keyboard"></div><p class="hint">サイト内変換では、同時押しのキーを押したまま最後のキーを離すと判定します。Space単独は空白、他キーと押すとセンターシフトです。</p></section></main><details class="sources panel"><summary>参考資料・出典</summary><div class="source-list">${sourceRows(state.layout)}</div></details>`;
  populateControls(root, state); renderTask(root, state);
}

export function populateControls(root, state) {
  const layoutSelect = root.querySelector('#layout-select'); for (const layout of state.layouts) layoutSelect.add(new Option(layout.name, layout.id)); layoutSelect.value = state.layout.id;
  const lessonSelect = root.querySelector('#lesson-select'); for (const lesson of state.lessons) lessonSelect.add(new Option(lesson.title, lesson.id)); lessonSelect.value = state.lesson.id; root.querySelector('#mode-select').value = state.mode;
}

export function renderTask(root, state) {
  const current = state.session.current; const stats = state.session.stats;
  const sourceNote = root.querySelector('.source-note');
  if (sourceNote) sourceNote.innerHTML = `${escapeHtml(state.layout.name)}<br><span>${escapeHtml(state.layout.version ?? '')}</span>`;
  root.querySelector('#lesson-label').textContent = state.lesson.title; root.querySelector('#progress').textContent = `${Math.min(state.session.index + 1, state.lesson.items.length)} / ${state.lesson.items.length}`; root.querySelector('#task-text').textContent = current?.text ?? '完了！'; root.querySelector('#expected').innerHTML = current ? `<span>目標：${escapeHtml(current.expected)}</span><span class="typed-line">入力：${escapeHtml(state.session.displayInput || '—')}</span>` : 'おつかれさまでした'; root.querySelector('#accuracy').textContent = `${stats.accuracy}%`; root.querySelector('#correct').textContent = stats.correct; root.querySelector('#mistakes').textContent = stats.errors; root.querySelector('#feedback').textContent = state.feedback; root.querySelector('#feedback').className = `feedback ${state.feedbackKind ?? ''}`;
  root.querySelector('#error-log').innerHTML = state.session.errors.length ? `<span>最近の誤入力：</span> ${state.session.errors.slice(-5).map((e) => `${escapeHtml(e.actual)} → ${escapeHtml(e.expected)}`).join('　')}` : ''; renderKeyboard(root.querySelector('#keyboard'), state); root.querySelector('#held-label').textContent = state.heldKeys.length ? state.heldKeys.join(' + ') : '押下なし';
}

function renderKeyboard(element, state) { const expected = new Set((state.expectedKeys ?? []).flat()); const held = new Set(state.heldKeys); const rows = [['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'], ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon'], ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'], ['Space']]; element.innerHTML = rows.map((row) => `<div class="key-row">${row.map((key) => { const label = keyLabel(key, state.layout); return `<div class="key ${expected.has(key) ? 'expected-key' : ''} ${held.has(key) ? 'held-key' : ''}" aria-label="${escapeHtml(label.join(' / '))}"><span class="key-main">${escapeHtml(label[0])}</span>${label[1] ? `<span class="key-shift">${escapeHtml(label[1])}</span>` : ''}</div>`; }).join('')}</div>`).join(''); }
function keyLabel(key, layout) { if (key === 'Space') return ['空白', 'シフト']; const normal = displayValue(layout.layers?.single?.[key] ?? KEY_FALLBACKS[key] ?? '・'); const shifted = displayValue(layout.layers?.centerShift?.[key] ?? ''); return shifted && shifted !== normal ? [normal, shifted] : [normal]; }
function displayValue(value) { return ({ Backspace: 'BS', Enter: '改行', ArrowLeft: '←', ArrowRight: '→' }[value] ?? value); }
function sourceRows(layout) {
  const rows = layout.id === 'user-current' ? [
    ['ユーザー提供設定', 'BeThirty Orthoの現在配列・QMK設定', 'ユーザー指定'],
    ['薙刀式v18発表記事', '大岡俊彦氏', '標準v18の参照'],
    ['薙刀式v18トップ版マニュアルPDF', '大岡俊彦氏', '標準かな・同時押し・機能定義']
  ] : [
    ['薙刀式v18トップ版マニュアルPDF', '大岡俊彦氏', '公式定義の一次資料', 'https://oookaworks.up.seesaa.net/image/E89699E58880E5BC8FE5Fv18E38388E38383E38397E78988E3839EE3838BE383A5E382A2E383AB.pdf'],
    ['薙刀式v18トップ版、発表', '大岡俊彦氏', '版と変更点', 'https://oookaworks.seesaa.net/article/521080503.html'],
    ['カナ配列 薙刀式（カタナ式ファミリー）', '大岡俊彦氏', '配列の背景', 'https://oookaworks.seesaa.net/article/456099128.html'],
    ['リポジトリ内公式定義', 'data/reference/naginata-v18.txt', `生成元ハッシュ: ${layout.sourceHash ?? '記載なし'}`]
  ];
  return rows.map(([title, author, role, url]) => `<div class="source-row"><span class="source-title">${url ? `<a href="${url}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}</span><span>${escapeHtml(author)} / ${escapeHtml(role)}</span></div>`).join('');
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
