import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROW_CODES = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'BracketRight'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'Backslash']
];

const SCAN_CODES = new Map([
  [0x10, 'KeyQ'], [0x11, 'KeyW'], [0x12, 'KeyE'], [0x13, 'KeyR'], [0x14, 'KeyT'], [0x15, 'KeyY'],
  [0x16, 'KeyU'], [0x17, 'KeyI'], [0x18, 'KeyO'], [0x19, 'KeyP'], [0x1a, 'BracketLeft'], [0x1b, 'BracketRight'],
  [0x1e, 'KeyA'], [0x1f, 'KeyS'], [0x20, 'KeyD'], [0x21, 'KeyF'], [0x22, 'KeyG'], [0x23, 'KeyH'],
  [0x24, 'KeyJ'], [0x25, 'KeyK'], [0x26, 'KeyL'], [0x27, 'Semicolon'], [0x28, 'Quote'], [0x29, 'BracketRight'],
  [0x2c, 'KeyZ'], [0x2d, 'KeyX'], [0x2e, 'KeyC'], [0x2f, 'KeyV'], [0x30, 'KeyB'], [0x31, 'KeyN'],
  [0x32, 'KeyM'], [0x33, 'Comma'], [0x34, 'Period'], [0x35, 'Slash'], [0x73, 'Backslash']
]);

const ACTIONS = new Map([
  ['←', 'arrowLeft'], ['→', 'arrowRight'], ['↑', 'arrowUp'], ['↓', 'arrowDown'],
  ['BS', 'backspace'], ['Enter', 'enter'], ['Home', 'home'], ['End', 'end'], ['Del', 'delete'],
  ['Esc', 'escape'], ['Space', 'space']
]);

function decodeCp932(buffer) {
  return execFileSync('iconv', ['-f', 'CP932', '-t', 'UTF-8'], { input: buffer, encoding: 'utf8' });
}

function scanToCode(value) {
  const scan = Number.parseInt(value, 16);
  return SCAN_CODES.get(scan) ?? `Scan${value.toUpperCase()}`;
}

function cleanCell(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^\+/, '')
    .trim();
}

function outputForCell(raw) {
  const value = cleanCell(raw);
  if (!value || /^[@\\\[\]{}~`*_=|]+$/.test(value)) return null;
  const braces = [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  if (braces.length === 1 && value.replace(/\{[^{}]+\}/g, '').trim() === '') {
    const action = ACTIONS.get(braces[0]);
    if (action) return { type: 'action', value: action, display: braces[0] };
    if (braces[0].startsWith('vk')) return { type: 'action', value: braces[0], display: braces[0] };
  }
  const text = value.replace(/[{}]/g, '').replace(/\s+/g, '');
  if (!text || /^[+|]+$/.test(text)) return null;
  return { type: 'text', value: text, display: text };
}

function rowCells(line) {
  if (!line.includes('|')) return [];
  return line.split('|').map((cell) => cell.trim());
}

function codeAt(row, column) {
  return ROW_CODES[row]?.[column] ?? null;
}

function aliasesFromSource(source) {
  const aliases = new Map([['S', ['Space']]]);
  for (const match of source.matchAll(/^\{([^}]+)\}\s*\|\s*\+([0-9A-Fa-f]+)/gm)) {
    aliases.set(match[1], [scanToCode(match[2])]);
  }
  return aliases;
}

function resolveHeaderKeys(header, aliases) {
  const keys = [];
  for (const token of header.matchAll(/\{([^}]+)\}|\+([0-9A-Fa-f]+)/g)) {
    const alias = token[1];
    const scan = token[2];
    if (alias) keys.push(...(aliases.get(alias) ?? []));
    if (scan) keys.push(scanToCode(scan));
  }
  return keys;
}

function parseGrid(lines, start) {
  const rows = [];
  let end = start;
  for (; end < lines.length; end += 1) {
    if (lines[end].trim() === ']') break;
    const cells = rowCells(lines[end]);
    if (cells.length) rows.push(cells);
  }
  return { rows, end };
}

function addEntry(entries, keys, output, kind, line) {
  if (!keys.length || !output) return;
  entries.push({ keys, output, kind, source: { line } });
}

function parseMainTable(lines, markerIndex, shifted, aliases, entries) {
  let start = markerIndex;
  while (start < lines.length && !lines[start].includes('[')) start += 1;
  const { rows } = parseGrid(lines, start + 1);
  rows.slice(1).forEach((cells, row) => cells.forEach((cell, column) => {
    const output = outputForCell(cell);
    const code = codeAt(row, column);
    if (!code || !output) return;
    addEntry(entries, shifted ? ['Space', code] : [code], output, shifted ? 'center-shift' : 'single', markerIndex + row + 1);
  }));
}

function parseComboTables(lines, aliases, entries) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes('[') || !line.trim().startsWith('(')) continue;
    const header = line.slice(0, line.indexOf('['));
    const modifierKeys = resolveHeaderKeys(header, aliases);
    if (!modifierKeys.length) continue;
    const { rows, end } = parseGrid(lines, index + 1);
    rows.slice(1).forEach((cells, row) => cells.forEach((cell, column) => {
      const output = outputForCell(cell);
      const code = codeAt(row, column);
      if (!code || !output) return;
      const keys = header.includes('{') && /逆順/.test(lines.slice(Math.max(0, index - 4), index).join(''))
        ? [...modifierKeys, code]
        : [...modifierKeys, code];
      addEntry(entries, keys, output, 'combo', index + 1 + row);
    }));
    index = end;
  }
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const output = `${entry.output.type}:${entry.output.value}`;
    const key = `${entry.keys.join('+')}|${output}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseNaginataDefinition(sourceBuffer) {
  const source = Buffer.isBuffer(sourceBuffer) ? decodeCp932(sourceBuffer) : String(sourceBuffer);
  const lines = source.split(/\r?\n/);
  const aliases = aliasesFromSource(source);
  const entries = [];
  const singleIndex = lines.findIndex((line) => line.includes('/* 単打 */'));
  const shiftedIndex = lines.findIndex((line) => line.includes('/* センターシフト */'));
  if (singleIndex >= 0) parseMainTable(lines, singleIndex, false, aliases, entries);
  if (shiftedIndex >= 0) parseMainTable(lines, shiftedIndex, true, aliases, entries);
  parseComboTables(lines, aliases, entries);
  return {
    schemaVersion: 1,
    layoutVersion: 'v18',
    aliases: Object.fromEntries([...aliases].map(([name, keys]) => [name, keys])),
    entries: dedupe(entries),
    sourceHash: createHash('sha256').update(Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(source)).digest('hex')
  };
}

export function parseNaginataFile(path) {
  return parseNaginataDefinition(readFileSync(path));
}

export { ACTIONS, ROW_CODES, SCAN_CODES };
