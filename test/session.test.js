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
  assert.equal(session.displayInput, 'す');
});

test('advances through every unit in a word', () => {
  const session = new PracticeSession([{ text: 'ある', expected: 'ある' }]);

  assert.equal(session.currentInput, '');
  assert.equal(session.currentUnit, 'あ');
  assert.equal(session.submit('あ').correct, true);
  assert.equal(session.currentInput, 'あ');
  assert.equal(session.currentUnit, 'る');
  assert.equal(session.submit('る').correct, true);
  assert.equal(session.currentInput, '');
  assert.equal(session.stats.completed, true);
  assert.equal(session.stats.correct, 2);
});

test('treats a multi-character kana combo as one input unit', () => {
  const tokenize = (text) => text === 'しょうじょ' ? ['しょ', 'う', 'じょ'] : ['しょ', 'じょ'].includes(text) ? [text] : Array.from(text);
  const session = new PracticeSession([{ text: 'しょうじょ', expected: 'しょうじょ' }], { tokenize });

  assert.equal(session.currentUnit, 'しょ');
  assert.equal(session.submit('しょ').correct, true);
  assert.equal(session.currentUnit, 'う');
  assert.equal(session.submit('う').correct, true);
  assert.equal(session.submit('じょ').completed, true);
});
