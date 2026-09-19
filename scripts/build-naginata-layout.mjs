import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseNaginataFile } from '../src/engine/naginata-definition-parser.js';

const sourcePath = new URL('../data/reference/naginata-v18.txt', import.meta.url);
const outputPath = new URL('../data/layouts/naginata-v18.generated.json', import.meta.url);
const parsed = parseNaginataFile(sourcePath);
const entries = [...parsed.entries,
  { keys: ['KeyH', 'KeyJ'], output: { type: 'action', value: 'imeOn', display: 'IME ON' }, kind: 'control', source: { section: 'IME ON/OFF' } },
  { keys: ['KeyG', 'KeyF'], output: { type: 'action', value: 'imeOff', display: 'IME OFF' }, kind: 'control', source: { section: 'IME ON/OFF' } },
  { keys: ['KeyV', 'KeyM'], output: { type: 'action', value: 'enter', display: 'Enter' }, kind: 'control', source: { section: 'Enter' } }
];

const single = {};
const centerShift = {};
const combos = [];
for (const entry of entries) {
  const value = entry.output.type === 'text' ? entry.output.value : entry.output.display;
  if (entry.kind === 'single' && entry.output.type === 'text') single[entry.keys[0]] = value;
  else if (entry.kind === 'center-shift' && entry.output.type === 'text') centerShift[entry.keys[1]] = value;
  else combos.push({
    keys: entry.keys,
    text: entry.output.type === 'text' ? entry.output.value : '',
    action: entry.output.type === 'action' ? entry.output.value : undefined,
    display: value,
    kind: entry.kind,
    source: entry.source
  });
}

const layout = {
  id: 'naginata-v18-generated',
  name: '薙刀式 v18 トップ版（公式定義生成）',
  version: parsed.layoutVersion,
  generatedFrom: 'data/reference/naginata-v18.txt',
  sourceHash: parsed.sourceHash,
  physicalKeys: [
    'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
    'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon',
    'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'Space'
  ],
  centerShiftKey: 'Space',
  preserveComboOrder: true,
  simultaneousWindowMs: 180,
  aliases: parsed.aliases,
  layers: { single, centerShift },
  combos,
  entries
};

mkdirSync(new URL('../data/layouts/', import.meta.url), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(layout, null, 2)}\n`);
console.log(`generated ${layout.entries.length} entries from ${layout.generatedFrom}`);
