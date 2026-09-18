# 薙刀式タイピング練習サイト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 空のKeyboardリポジトリに、薙刀式v18と差し替え可能なユーザー配列を使った2入力モード対応の練習サイトを作る。

**Architecture:** JSONデータ、DOM非依存の変換・セッションエンジン、ブラウザUIを分離する。通常キーイベントを薙刀式かなへ変換するBモードと、OS/QMK/IMEの出力かなを採点するAモードを共通セッションへ接続する。

**Tech Stack:** HTML/CSS/JavaScript modules, Node.js built-in test runner, JSON

**Spec:** `docs/superpowers/specs/2026-09-18-naginata-practice-design.md`

## Global Constraints

- `KeyboardEvent.code` を物理キー識別の中心にする。
- 配列と課題はJSONに分離する。
- A/B入力モードと標準/ユーザー配列を画面から切り替える。
- 編集モード、IME制御、漢字変換、OS全体の配列変更は実装しない。
- ユーザー配列は未提供のため、標準配列を初期値にした差し替え可能プロファイルとして明示する。

### Task 1: Project scaffold and authoritative data

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `styles.css`
- Create: `data/layouts/naginata-v18.json`
- Create: `data/layouts/user-current.json`
- Create: `data/lessons/basic.json`
- Create: `data/lessons/words.json`
- Create: `data/lessons/sentences.json`
- Create: `README.md`
- Create: `docs/sources.md`

**Interfaces:** JSON layout entries expose `id`, `name`, `version`, `physicalKeys`, `layers`, and `combos`; lesson files expose `id`, `title`, and `items` with `text` and `expected`.

- [x] **Step 1: Add package scripts and empty app shell.**
- [x] **Step 2: Add the official-v18-derived JSON layout and user profile.**
- [x] **Step 3: Add basic, word, and sentence lesson data.**
- [x] **Step 4: Document sources, missing custom layout, and local usage.**

### Task 2: TDD conversion engine

**Files:**
- Create: `src/engine/layout.js`
- Create: `src/engine/naginata-engine.js`
- Create: `test/naginata-engine.test.js`

**Interfaces:** `createLayoutIndex(layout)`, `resolveExpectedKeys(index, text)`, and `NaginataEngine.convert(keys)` return normalized output objects with `text`, `keys`, and `kind`.

- [x] **Step 1: Write tests for single key, center shift, order-independent two-key combo, three-key combo, and unknown combo.**
- [x] **Step 2: Run `npm test` and confirm the new tests fail because engine modules are missing.**
- [x] **Step 3: Implement the smallest layout index and combo engine that satisfy the tests.**
- [x] **Step 4: Run `npm test` and confirm the engine tests pass.**

### Task 3: Session and input controllers

**Files:**
- Create: `src/engine/session.js`
- Create: `src/engine/input-controller.js`
- Create: `test/session.test.js`
- Create: `test/input-controller.test.js`

**Interfaces:** `PracticeSession`, `createInputController({mode, engine, onOutput})`.

- [x] **Step 1: Write tests for correct/incorrect output, progress, accuracy, and A/B normalization.**
- [x] **Step 2: Run the focused tests and confirm failure.**
- [x] **Step 3: Implement session accounting and input normalization.**
- [x] **Step 4: Run all tests and confirm pass.**

### Task 4: Practice UI

**Files:**
- Create: `src/app.js`
- Create: `src/ui.js`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:** `bootPracticeApp(document)` initializes controls, loads JSON, and connects UI to session/input controller.

- [x] **Step 1: Add selectors, status cards, lesson list, keyboard visualization, and feedback regions to HTML.**
- [x] **Step 2: Implement JSON loading, layout/lesson switching, and mode switching.**
- [x] **Step 3: Implement current task, expected keys, held keys, feedback, progress, and accuracy rendering.**
- [x] **Step 4: Add responsive styles for laptop screens and narrow widths.**

### Task 5: Verification and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/sources.md`

- [x] **Step 1: Run the full test suite.**
- [x] **Step 2: Run a static server and inspect the page with a browser.**
- [x] **Step 3: Review key files and compare every requirement against the implementation.**
- [x] **Step 4: Commit the implementation and report changes, usage, sources, and known constraints.**
