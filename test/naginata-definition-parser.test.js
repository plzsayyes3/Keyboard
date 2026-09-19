import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNaginataDefinition } from '../src/engine/naginata-definition-parser.js';

const source = readFileSync(new URL('../data/reference/naginata-v18.txt', import.meta.url));

test('parses the official v18 main and simultaneous sections', () => {
  const result = parseNaginataDefinition(source);
  assert.equal(result.layoutVersion, 'v18');
  assert.ok(result.entries.length > 300);
  assert.deepEqual(result.entries.find((entry) => entry.output.value === 'き').keys, ['KeyW']);
  assert.ok(result.entries.some((entry) => entry.output.value === 'が' && entry.keys.join('+') === 'KeyJ+KeyF'));
  assert.ok(result.entries.some((entry) => entry.output.value === 'じょ' && entry.keys.join('+') === 'KeyJ+KeyR+KeyI'));
  assert.ok(result.entries.some((entry) => entry.output.value === 'ふぁ' && entry.keys.length === 3));
});

test('keeps official order variants as distinct entries', () => {
  const result = parseNaginataDefinition(source);
  const sho = result.entries.filter((entry) => entry.output.value === 'しょ').map((entry) => entry.keys.join('+'));
  assert.ok(sho.includes('KeyR+KeyI'));
  assert.ok(sho.includes('KeyI+KeyR'));
});
