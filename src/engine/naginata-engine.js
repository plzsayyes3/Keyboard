import { sortedKeyId } from './layout.js';

export class NaginataEngine {
  constructor(index) {
    this.index = index;
  }

  convert(keys) {
    const normalized = [...new Set(keys)].filter(Boolean);
    if (normalized.length === 0) return { text: '', keys: [], kind: 'empty' };

    if (normalized.length === 1 && normalized[0] === 'Space') {
      return { text: ' ', keys: normalized, kind: 'space' };
    }

    const withoutShift = normalized.filter((key) => key !== this.index.centerShiftKey);
    if (normalized.includes(this.index.centerShiftKey) && withoutShift.length === 1) {
      const text = this.index.shifted.get(withoutShift[0]);
      if (text) return { text, keys: [...normalized].sort(), kind: 'center-shift' };
    }

    const combo = this.index.combos.get(sortedKeyId(normalized));
    if (combo) return { text: combo.text, keys: [...combo.keys], kind: combo.kind ?? 'combo' };

    if (normalized.length === 1) {
      const text = this.index.single.get(normalized[0]);
      if (text) return { text, keys: normalized, kind: 'single' };
    }

    return { text: '', keys: [...normalized].sort(), kind: 'unknown' };
  }
}
