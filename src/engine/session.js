export class PracticeSession {
  constructor(items, { tokenize = (text) => Array.from(String(text ?? '')) } = {}) {
    this.items = items ?? [];
    this.tokenize = tokenize;
    this.units = this.items.map((item) => this.tokenize(item.expected));
    this.index = 0;
    this.unitIndex = 0;
    this.inputUnits = [];
    this.lastActual = '';
    this.attempts = 0;
    this.correctCount = 0;
    this.errors = [];
  }

  get current() {
    return this.items[this.index] ?? null;
  }

  get currentUnit() {
    return this.units[this.index]?.[this.unitIndex] ?? null;
  }

  get currentInput() {
    return this.inputUnits.join('');
  }

  get stats() {
    const accuracy = this.attempts === 0 ? 100 : Math.round((this.correctCount / this.attempts) * 100);
    return {
      total: this.attempts,
      correct: this.correctCount,
      errors: this.errors.length,
      accuracy,
      completed: this.index >= this.items.length
    };
  }

  submit(actual) {
    const tokens = this.tokenize(actual);
    if (!this.current || tokens.length === 0) return { correct: false, completed: this.index >= this.items.length, expected: this.currentUnit ?? '', actual };

    let correct = true;
    let expected = this.currentUnit ?? '';
    for (const token of tokens) {
      this.lastActual = token;
      expected = this.currentUnit ?? '';
      this.attempts += 1;
      if (token !== expected) {
        correct = false;
        this.errors.push({ expected, actual: token });
        break;
      }
      this.correctCount += 1;
      this.inputUnits.push(token);
      this.unitIndex += 1;
      if (this.unitIndex >= this.units[this.index].length) {
        this.index += 1;
        this.unitIndex = 0;
        this.inputUnits = [];
      }
    }
    return { correct, completed: this.index >= this.items.length, expected, actual };
  }
}
