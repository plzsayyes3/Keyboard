import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutIndex, resolveExpectedKeys } from '../src/engine/layout.js';
import { NaginataEngine } from '../src/engine/naginata-engine.js';
import naginataLayout from '../data/layouts/naginata-v18.json' with { type: 'json' };

const layout = {
  layers: {
    single: { KeyJ: 'あ', KeyW: 'き' },
    centerShift: { KeyJ: 'の' }
  },
  combos: [
    { keys: ['KeyJ', 'KeyW'], text: 'が', kind: 'dakuten' },
    { keys: ['KeyW', 'KeyI', 'KeyJ'], text: 'じょ', kind: 'youon-dakuten' }
  ],
  centerShiftKey: 'Space',
  simultaneousWindowMs: 140
};

test('converts a single physical key', () => {
  const engine = new NaginataEngine(createLayoutIndex(layout));
  assert.deepEqual(engine.convert(['KeyJ']), { text: 'あ', keys: ['KeyJ'], kind: 'single' });
});

test('converts a center-shift key', () => {
  const engine = new NaginataEngine(createLayoutIndex(layout));
  assert.equal(engine.convert(['Space', 'KeyJ']).text, 'の');
});

test('accepts a two-key combo regardless of order', () => {
  const engine = new NaginataEngine(createLayoutIndex(layout));
  assert.equal(engine.convert(['KeyW', 'KeyJ']).text, 'が');
  assert.equal(engine.convert(['KeyJ', 'KeyW']).text, 'が');
});

test('converts a three-key combo', () => {
  const engine = new NaginataEngine(createLayoutIndex(layout));
  assert.equal(engine.convert(['KeyJ', 'KeyI', 'KeyW']).text, 'じょ');
});

test('reports unknown physical combinations', () => {
  const engine = new NaginataEngine(createLayoutIndex(layout));
  assert.equal(engine.convert(['KeyQ']).text, '');
  assert.equal(engine.convert(['KeyQ']).kind, 'unknown');
});

test('uses the official physical keys for しょ', () => {
  const index = createLayoutIndex(naginataLayout);
  const engine = new NaginataEngine(index);

  assert.deepEqual(resolveExpectedKeys(index, 'しょ'), [['KeyR', 'KeyI'], ['KeyI', 'KeyR']]);
  assert.equal(engine.convert(['KeyR', 'KeyI']).text, 'しょ');
  assert.notEqual(engine.convert(['KeyW', 'KeyI']).text, 'しょ');
});

test('uses the base kana key plus the やゆよ key for clean youon', () => {
  const engine = new NaginataEngine(createLayoutIndex(naginataLayout));
  assert.equal(engine.convert(['KeyR', 'KeyH']).text, 'しゃ');
  assert.equal(engine.convert(['KeyR', 'KeyP']).text, 'しゅ');
  assert.equal(engine.convert(['KeyW', 'KeyI']).text, 'きょ');
  assert.equal(engine.convert(['KeyG', 'KeyI']).text, 'ちょ');
});

test('preserves official combo order when the same keys have two meanings', () => {
  const engine = new NaginataEngine(createLayoutIndex(naginataLayout));
  assert.equal(engine.convert(['KeyF', 'KeyU']).text, 'が');
  assert.equal(engine.convert(['KeyU', 'KeyF']).text, 'が');
  assert.equal(engine.convert(['KeyR', 'KeyU']).text, 'じ');
  assert.equal(engine.convert(['KeyU', 'KeyR']).text, 'ざ');
});
