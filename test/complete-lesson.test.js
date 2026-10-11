import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import generated from '../data/layouts/naginata-v18.generated.json' with { type: 'json' };
import userLayout from '../data/layouts/user-current.json' with { type: 'json' };
import { createLayoutIndex, resolveExpectedKeys, tokenizeText } from '../src/engine/layout.js';
import { mergeLayout } from '../src/engine/layout-loader.js';
import { NaginataEngine } from '../src/engine/naginata-engine.js';
import { PracticeSession } from '../src/engine/session.js';
import { createInputController } from '../src/engine/input-controller.js';

const lessonPath = new URL('../data/lessons/complete.json', import.meta.url);
const kanaOutput = /^[ぁ-ゖァ-ヺーゝゞゟ。、・「」『』（）！？…〜]+$/u;

test('complete lesson covers every kana output in the PDF-derived layout exactly once', () => {
  assert.ok(fs.existsSync(lessonPath), 'complete lesson is missing');
  const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
  const expected = [...new Set(generated.entries
    .filter((entry) => entry.output.type === 'text' && kanaOutput.test(entry.output.value))
    .map((entry) => entry.output.value))];
  const actual = lesson.items.map((item) => item.expected);

  assert.deepEqual(actual, expected);
  assert.ok(actual.includes('ヴぉ'));
  assert.ok(actual.includes('ユカ'));
});

test('complete lesson can be finished through actual physical-key conversions', () => {
  assert.ok(fs.existsSync(lessonPath), 'complete lesson is missing');
  const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
  const index = createLayoutIndex(generated);
  const engine = new NaginataEngine(index);
  const session = new PracticeSession(lesson.items, { tokenize: (text) => tokenizeText(index, text) });
  const controller = createInputController({ mode: 'site', engine, onOutput: (value) => session.submit(value) });

  for (const item of lesson.items) {
    for (const unit of tokenizeText(index, item.expected)) {
      const keys = resolveExpectedKeys(index, unit).find((candidate) => engine.convert(candidate).text === unit);
      assert.ok(keys, `no working physical-key sequence for ${unit}`);
      for (const code of keys) controller.handleKeyDown({ code, repeat: false });
      for (const code of [...keys].reverse()) controller.handleKeyUp({ code });
    }
  }

  assert.equal(session.stats.completed, true);
  assert.equal(session.stats.errors, 0);
  assert.equal(session.stats.total, session.stats.correct);
});

test('complete lesson also finishes with the user layout inherited from v18', () => {
  const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
  const index = createLayoutIndex(mergeLayout(generated, userLayout));
  const engine = new NaginataEngine(index);
  const session = new PracticeSession(lesson.items, { tokenize: (text) => tokenizeText(index, text) });
  const controller = createInputController({ mode: 'site', engine, onOutput: (value) => session.submit(value) });

  for (const item of lesson.items) {
    for (const unit of tokenizeText(index, item.expected)) {
      const keys = resolveExpectedKeys(index, unit).find((candidate) => engine.convert(candidate).text === unit);
      assert.ok(keys, `no working physical-key sequence for ${unit}`);
      for (const code of keys) controller.handleKeyDown({ code, repeat: false });
      for (const code of [...keys].reverse()) controller.handleKeyUp({ code });
    }
  }

  assert.equal(session.stats.completed, true);
  assert.equal(session.stats.errors, 0);
});
