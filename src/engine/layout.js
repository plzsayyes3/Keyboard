function sortedKeyId(keys) {
  return [...new Set(keys)].sort().join('+');
}

function orderedKeyId(keys) {
  return [...new Set(keys)].join('+');
}

export function createLayoutIndex(layout) {
  const single = new Map(Object.entries(layout.layers?.single ?? {}));
  const shifted = new Map(Object.entries(layout.layers?.centerShift ?? {}));
  const combos = new Map();
  for (const combo of layout.combos ?? []) {
    combos.set(orderedKeyId(combo.keys), { ...combo, keys: [...combo.keys] });
  }
  for (const combo of layout.combos ?? []) {
    const reverse = [...combo.keys].reverse();
    const reverseId = orderedKeyId(reverse);
    if (!combos.has(reverseId)) combos.set(reverseId, { ...combo, keys: reverse });
  }
  return {
    single,
    shifted,
    combos,
    centerShiftKey: layout.centerShiftKey ?? 'Space',
    physicalKeys: layout.physicalKeys ?? [],
    simultaneousWindowMs: layout.simultaneousWindowMs ?? 140,
    name: layout.name ?? layout.id ?? '配列'
  };
}

export function resolveExpectedKeys(index, text) {
  const target = String(text ?? '');
  const candidates = [];
  for (const [key, value] of index.single) if (value === target) candidates.push([key]);
  for (const [key, value] of index.shifted) if (value === target) candidates.push([index.centerShiftKey, key]);
  for (const combo of index.combos.values()) if (combo.text === target) candidates.push(combo.keys);
  return candidates;
}

export { sortedKeyId };
