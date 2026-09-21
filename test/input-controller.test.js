import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputController } from '../src/engine/input-controller.js';

test('A mode forwards converted text output', () => {
  const outputs = [];
  const controller = createInputController({ mode: 'converted', onOutput: (value) => outputs.push(value) });
  controller.handleBeforeInput({ data: 'し' });
  assert.deepEqual(outputs, ['し']);
});

test('B mode converts pressed physical codes on keyup', () => {
  const outputs = [];
  const engine = { convert: (keys) => ({ text: keys.sort().join(','), keys, kind: 'test' }) };
  const controller = createInputController({ mode: 'site', engine, onOutput: (value) => outputs.push(value) });
  controller.handleKeyDown({ code: 'KeyJ', repeat: false });
  controller.handleKeyDown({ code: 'KeyW', repeat: false });
  controller.handleKeyUp({ code: 'KeyW' });
  controller.handleKeyUp({ code: 'KeyJ' });
  assert.deepEqual(outputs, ['KeyJ,KeyW']);
});

test('B mode emits a three-key chord once and ignores the remaining keyups', () => {
  const outputs = [];
  const held = [];
  const engine = { convert: (keys) => ({ text: keys.join('+'), keys, kind: 'test' }) };
  const controller = createInputController({ mode: 'site', engine, onOutput: (value) => outputs.push(value), onHeldKeys: (keys) => held.push(keys) });
  for (const code of ['KeyJ', 'KeyR', 'KeyI']) controller.handleKeyDown({ code, repeat: false });
  controller.handleKeyUp({ code: 'KeyI' });
  controller.handleKeyUp({ code: 'KeyR' });
  controller.handleKeyUp({ code: 'KeyJ' });
  assert.deepEqual(outputs, ['KeyJ+KeyR+KeyI']);
  assert.deepEqual(controller.pressed, []);
  assert.deepEqual(held.at(-1), []);
});

test('B mode excludes OS modifier keys from physical chords', () => {
  const outputs = [];
  const held = [];
  const engine = { convert: (keys) => ({ text: keys.join('+'), keys, kind: 'test' }) };
  const controller = createInputController({ mode: 'site', engine, onOutput: (value) => outputs.push(value), onHeldKeys: (keys) => held.push(keys) });
  controller.handleKeyDown({ code: 'ShiftLeft', repeat: false });
  controller.handleKeyDown({ code: 'MetaLeft', repeat: false });
  controller.handleKeyDown({ code: 'KeyJ', repeat: false });
  controller.handleKeyUp({ code: 'KeyJ' });
  controller.handleKeyUp({ code: 'ShiftLeft' });
  controller.handleKeyUp({ code: 'MetaLeft' });
  assert.deepEqual(outputs, ['KeyJ']);
  assert.ok(held.every((keys) => !keys.includes('ShiftLeft') && !keys.includes('MetaLeft')));
});
