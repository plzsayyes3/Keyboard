import { createLayoutIndex, resolveExpectedKeys, tokenizeText } from './engine/layout.js';
import { mergeLayout } from './engine/layout-loader.js';
import { NaginataEngine } from './engine/naginata-engine.js';
import { PracticeSession } from './engine/session.js';
import { createInputController } from './engine/input-controller.js';
import { renderApp, renderTask } from './ui.js?v=20260919-logic4';

const root = document.querySelector('#app'); const layoutPaths = ['data/layouts/naginata-v18.json?v=20260919-logic4', 'data/layouts/user-current.json?v=20260919-logic4']; const lessonPaths = ['data/lessons/basic.json', 'data/lessons/words.json', 'data/lessons/sentences.json'];
async function loadJson(path) { const response = await fetch(path); if (!response.ok) throw new Error(`読み込み失敗: ${path}`); return response.json(); }

async function boot() {
  const [rawLayouts, lessons] = await Promise.all([Promise.all(layoutPaths.map(loadJson)), Promise.all(lessonPaths.map(loadJson))]); const base = rawLayouts[0]; const layouts = rawLayouts.map((layout) => layout.inherits ? mergeLayout(base, layout) : layout);
  const state = { layouts, layout: layouts[0], lessons, lesson: lessons[0], mode: 'site', session: null, feedback: '練習を始めると結果が表示されます。', feedbackKind: '', heldKeys: [], expectedKeys: [] }; state.session = createSession(state); state.expectedKeys = expectedKeysFor(state); renderApp(root, state); wireControls(state); attachInput(state);
}
function wireControls(state) {
  root.querySelector('#layout-select').addEventListener('change', (event) => { state.layout = state.layouts.find((layout) => layout.id === event.target.value); resetSession(state, '配列を切り替えました。'); attachInput(state); });
  root.querySelector('#lesson-select').addEventListener('change', (event) => { state.lesson = state.lessons.find((lesson) => lesson.id === event.target.value); resetSession(state, 'レッスンを切り替えました。'); });
  root.querySelector('#mode-select').addEventListener('change', (event) => { state.mode = event.target.value; state.feedback = state.mode === 'site' ? '物理キーを押してください。' : '変換済みかなを入力してください。'; attachInput(state); renderTask(root, state); });
  root.querySelector('#restart').addEventListener('click', () => resetSession(state, '最初から始めます。'));
}
function createSession(state) { const index = createLayoutIndex(state.layout); return new PracticeSession(state.lesson.items, { tokenize: (text) => tokenizeText(index, text) }); }
function expectedKeysFor(state) { return resolveExpectedKeys(createLayoutIndex(state.layout), state.session.currentUnit ?? ''); }
function resetSession(state, message) { state.session = createSession(state); state.feedback = message; state.feedbackKind = ''; state.heldKeys = []; state.expectedKeys = expectedKeysFor(state); renderTask(root, state); }
function attachInput(state) {
  if (state.controller) { window.removeEventListener('keydown', state.controller.handleKeyDown); window.removeEventListener('keyup', state.controller.handleKeyUp); window.removeEventListener('beforeinput', state.controller.handleBeforeInput); }
  const engine = new NaginataEngine(createLayoutIndex(state.layout)); state.controller = createInputController({ mode: state.mode, engine, onHeldKeys: (keys) => { state.heldKeys = keys; renderTask(root, state); }, onOutput: (value) => { const result = state.session.submit(value); state.feedback = result.correct ? `○ ${value}　正解` : `× ${value || '未定義'}　正しくは ${result.expected}`; state.feedbackKind = result.correct ? 'success' : 'error'; state.expectedKeys = result.completed ? [] : expectedKeysFor(state); renderTask(root, state); } });
  window.addEventListener('keydown', state.controller.handleKeyDown); window.addEventListener('keyup', state.controller.handleKeyUp); window.addEventListener('beforeinput', state.controller.handleBeforeInput);
}
boot().catch((error) => { root.innerHTML = `<section class="panel fatal"><h1>読み込みできませんでした</h1><p>${error.message}</p><p>ローカルサーバー経由で開いてください。</p></section>`; });
export { boot };
