import { createLayoutIndex, resolveExpectedKeys, tokenizeText } from './engine/layout.js';
import { mergeLayout } from './engine/layout-loader.js';
import { NaginataEngine } from './engine/naginata-engine.js';
import { PracticeSession } from './engine/session.js';
import { createInputController } from './engine/input-controller.js';
import { renderApp, renderTask } from './ui.js?v=20261011-complete1';

const root = document.querySelector('#app'); const layoutPaths = ['data/layouts/naginata-v18.generated.json?v=20261011-complete1', 'data/layouts/user-current.json?v=20261011-complete1']; const lessonPaths = ['data/lessons/basic.json?v=20261011-complete1', 'data/lessons/words.json?v=20261011-complete1', 'data/lessons/sentences.json?v=20261011-complete1', 'data/lessons/complete.json?v=20261011-complete1'];
async function loadJson(path) { const response = await fetch(path); if (!response.ok) throw new Error(`読み込み失敗: ${path}`); return response.json(); }

async function boot() {
  const [rawLayouts, lessons] = await Promise.all([Promise.all(layoutPaths.map(loadJson)), Promise.all(lessonPaths.map(loadJson))]); const base = rawLayouts[0]; const layouts = rawLayouts.map((layout) => layout.inherits ? mergeLayout(base, layout) : layout);
  const state = { layouts, layout: layouts[0], lessons, lesson: lessons[0], mode: 'site', session: null, feedback: '練習を始めると結果が表示されます。', feedbackKind: '', heldKeys: [], expectedKeys: [] }; state.session = createSession(state); state.expectedKeys = expectedKeysFor(state); renderApp(root, state); wireControls(state); attachInput(state);
}
function wireControls(state) {
  root.querySelector('#layout-select').addEventListener('change', (event) => { state.layout = state.layouts.find((layout) => layout.id === event.target.value); resetSession(state, '配列を切り替えました。'); attachInput(state); });
  root.querySelector('#lesson-select').addEventListener('change', (event) => { state.lesson = state.lessons.find((lesson) => lesson.id === event.target.value); resetSession(state, 'レッスンを切り替えました。'); });
  root.querySelector('#mode-select').addEventListener('change', (event) => { state.mode = event.target.value; state.feedback = state.mode === 'site' ? '物理キーを押してください。' : '変換済みかなを入力してください。'; renderTask(root, state); attachInput(state); });
  root.querySelector('#restart').addEventListener('click', () => resetSession(state, '最初から始めます。'));
}
function createSession(state) { const index = createLayoutIndex(state.layout); return new PracticeSession(state.lesson.items, { tokenize: (text) => tokenizeText(index, text) }); }
function expectedKeysFor(state) { return resolveExpectedKeys(createLayoutIndex(state.layout), state.session.currentUnit ?? ''); }
function resetSession(state, message) { state.controller?.clear(); state.session = createSession(state); state.feedback = message; state.feedbackKind = ''; state.heldKeys = []; state.expectedKeys = expectedKeysFor(state); renderTask(root, state); if (state.mode === 'converted') root.querySelector('#converted-input')?.focus({ preventScroll: true }); }
function attachInput(state) {
  if (state.controller) {
    state.controller.clear();
    for (const [target, type, handler] of state.inputBindings ?? []) target.removeEventListener(type, handler);
  }
  const engine = new NaginataEngine(createLayoutIndex(state.layout));
  state.controller = createInputController({
    mode: state.mode,
    engine,
    onHeldKeys: (keys) => { state.heldKeys = keys; renderTask(root, state); },
    onOutput: (value, conversion) => {
      if (conversion?.kind === 'unknown' || conversion?.kind === 'ambiguous') {
        state.feedback = conversion.kind === 'ambiguous' ? 'このキー集合は複数の定義に一致します。押す順序を確認してください。' : `未登録のキー組み合わせ：${conversion.keys.join(' + ')}`;
        state.feedbackKind = 'error';
        renderTask(root, state);
        return;
      }
      if (conversion?.action) {
        state.feedback = `機能キー：${conversion.display ?? conversion.action}`;
        state.feedbackKind = '';
        renderTask(root, state);
        return;
      }
      const result = state.session.submit(value);
      state.feedback = result.correct ? `○ ${value}　正解` : `× ${value || '未定義'}　正しくは ${result.expected}`;
      state.feedbackKind = result.correct ? 'success' : 'error';
      state.expectedKeys = result.completed ? [] : expectedKeysFor(state);
      renderTask(root, state);
    }
  });
  const controller = state.controller;
  const onWindowBlur = () => controller.clear();
  const onWindowFocus = () => {
    if (state.mode !== 'converted') return;
    const active = document.activeElement;
    if (active === document.body || active === root) root.querySelector('#converted-input')?.focus({ preventScroll: true });
  };
  const onVisibilityChange = () => { if (document.hidden) controller.clear(); };
  const onPointerDown = (event) => {
    if (state.mode !== 'converted' || event.target.closest?.('button, select, input, textarea, a, summary')) return;
    requestAnimationFrame(() => root.querySelector('#converted-input')?.focus({ preventScroll: true }));
  };
  state.inputBindings = [
    [window, 'keydown', controller.handleKeyDown],
    [window, 'keyup', controller.handleKeyUp],
    [window, 'beforeinput', controller.handleBeforeInput],
    [window, 'input', controller.handleInput],
    [window, 'blur', onWindowBlur],
    [window, 'focus', onWindowFocus],
    [document, 'visibilitychange', onVisibilityChange],
    [root, 'pointerdown', onPointerDown]
  ];
  for (const [target, type, handler] of state.inputBindings) target.addEventListener(type, handler);
  if (state.mode === 'converted') root.querySelector('#converted-input')?.focus({ preventScroll: true });
}
boot().catch((error) => { root.innerHTML = `<section class="panel fatal"><h1>読み込みできませんでした</h1><p>${error.message}</p><p>ローカルサーバー経由で開いてください。</p></section>`; });
export { boot };
