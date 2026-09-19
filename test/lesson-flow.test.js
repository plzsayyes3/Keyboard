import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutIndex, resolveExpectedKeys, tokenizeText } from '../src/engine/layout.js';
import { NaginataEngine } from '../src/engine/naginata-engine.js';
import { PracticeSession } from '../src/engine/session.js';
import { createInputController } from '../src/engine/input-controller.js';
import layout from '../data/layouts/naginata-v18.json' with { type: 'json' };

test('all bundled lessons complete through the real input pipeline', () => {
  const index = createLayoutIndex(layout);
  const engine = new NaginataEngine(index);

  for (const lessonId of ['basic', 'words', 'sentences']) {
    const lesson = JSON.parse(fs.readFileSync(`data/lessons/${lessonId}.json`, 'utf8'));
    const session = new PracticeSession(lesson.items, { tokenize: (text) => tokenizeText(index, text) });
    const controller = createInputController({
      mode: 'site',
      engine,
      onOutput: (value) => session.submit(value)
    });

    for (const item of lesson.items) {
      for (const unit of tokenizeText(index, item.expected)) {
        const candidates = resolveExpectedKeys(index, unit);
        assert.ok(candidates.length, `${lessonId}: ${unit} has no key definition`);
        const keys = candidates[0];
        for (const code of keys) controller.handleKeyDown({ code, repeat: false });
        for (const code of [...keys].reverse()) controller.handleKeyUp({ code });
      }
    }

    assert.equal(session.stats.completed, true, `${lessonId} did not complete`);
    assert.equal(session.stats.errors, 0, `${lessonId} produced errors`);
  }
});
