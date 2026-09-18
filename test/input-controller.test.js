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
