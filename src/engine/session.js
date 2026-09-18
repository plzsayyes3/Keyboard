export class PracticeSession {
  constructor(items) {
    this.items = items ?? [];
    this.index = 0;
    this.attempts = 0;
    this.correctCount = 0;
    this.errors = [];
  }

  get current() {
    return this.items[this.index] ?? null;
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
    const item = this.current;
    if (!item) return { correct: false, completed: true, expected: '', actual };
    const correct = actual === item.expected;
    this.attempts += 1;
    if (correct) {
      this.correctCount += 1;
      this.index += 1;
    } else {
      this.errors.push({ expected: item.expected, actual });
    }
    return { correct, completed: this.index >= this.items.length, expected: item.expected, actual };
  }
}
