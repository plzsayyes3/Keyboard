import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutIndex } from '../src/engine/layout.js';
import { NaginataEngine } from '../src/engine/naginata-engine.js';

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
