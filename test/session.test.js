import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeSession } from '../src/engine/session.js';

test('tracks correct progress and accuracy', () => {
  const session = new PracticeSession([{ text: 'あ', expected: 'あ' }, { text: 'い', expected: 'い' }]);
  assert.equal(session.current.expected, 'あ');
  assert.equal(session.submit('あ').correct, true);
  assert.equal(session.submit('え').correct, false);
  assert.equal(session.submit('い').correct, true);
  assert.deepEqual(session.stats, { total: 3, correct: 2, errors: 1, accuracy: 67, completed: true });
});

test('records the actual incorrect input', () => {
  const session = new PracticeSession([{ text: 'し', expected: 'し' }]);
  session.submit('す');
  assert.deepEqual(session.errors, [{ expected: 'し', actual: 'す' }]);
});
