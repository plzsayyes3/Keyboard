import { readFileSync, writeFileSync } from 'node:fs';

const layoutUrl = new URL('../data/layouts/naginata-v18.generated.json', import.meta.url);
const lessonUrl = new URL('../data/lessons/complete.json', import.meta.url);
const layout = JSON.parse(readFileSync(layoutUrl, 'utf8'));
const kanaOutput = /^[ぁ-ゖァ-ヺーゝゞゟ。、・「」『』（）！？…〜]+$/u;
const seen = new Set();
const items = [];

for (const entry of layout.entries ?? []) {
  const value = entry.output?.value;
  if (entry.output?.type !== 'text' || !kanaOutput.test(value ?? '') || seen.has(value)) continue;
  seen.add(value);
  items.push({ text: value, expected: value });
}

const lesson = {
  id: 'complete',
  title: '配列全習',
  source: 'data/reference/naginata-v18.txt',
  sourceHash: layout.sourceHash,
  items
};
writeFileSync(lessonUrl, `${JSON.stringify(lesson, null, 2)}\n`);
console.log(`generated ${items.length} unique kana outputs from ${lesson.source}`);
