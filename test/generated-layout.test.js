import test from 'node:test';
import assert from 'node:assert/strict';
import generated from '../data/layouts/naginata-v18.generated.json' with { type: 'json' };
import { createLayoutIndex, resolveExpectedKeys, tokenizeText } from '../src/engine/layout.js';
import { NaginataEngine } from '../src/engine/naginata-engine.js';
import { PracticeSession } from '../src/engine/session.js';

test('generated layout contains the complete v18 practice primitives', () => {
  const index = createLayoutIndex(generated);
  const engine = new NaginataEngine(index);
  assert.equal(engine.convert(['KeyJ', 'KeyF']).text, 'が');
  assert.equal(engine.convert(['KeyJ', 'KeyR', 'KeyI']).text, 'じょ');
  assert.equal(engine.convert(['KeyV', 'KeyM']).action, 'enter');
  assert.ok(resolveExpectedKeys(index, 'ふぁ').some((keys) => keys.length === 3));
});

test('three-key kana chords accept any physical keydown order when unambiguous', () => {
  const engine = new NaginataEngine(createLayoutIndex(generated));
  const permutations = [
    ['KeyJ', 'KeyR', 'KeyI'], ['KeyJ', 'KeyI', 'KeyR'], ['KeyR', 'KeyJ', 'KeyI'],
    ['KeyR', 'KeyI', 'KeyJ'], ['KeyI', 'KeyJ', 'KeyR'], ['KeyI', 'KeyR', 'KeyJ']
  ];
  for (const keys of permutations) assert.equal(engine.convert(keys).text, 'じょ', keys.join('+'));
});

test('ambiguous ordered definitions require an explicit supported order', () => {
  const engine = new NaginataEngine(createLayoutIndex(generated));
  assert.equal(engine.convert(['KeyJ', 'KeyE', 'KeyK']).text, 'でぃ');
  assert.equal(engine.convert(['KeyE', 'KeyJ', 'KeyK']).kind, 'ambiguous');
});

test('generated layout completes a multi-character word through physical outputs', () => {
  const index = createLayoutIndex(generated);
  const session = new PracticeSession([{ expected: 'しょうじょ' }], { tokenize: (text) => tokenizeText(index, text) });
  for (const keys of [['KeyR', 'KeyI'], ['KeyL'], ['KeyJ', 'KeyR', 'KeyI']]) {
    const output = new NaginataEngine(index).convert(keys).text;
    assert.equal(session.submit(output).correct, true);
  }
  assert.equal(session.stats.completed, true);
});
