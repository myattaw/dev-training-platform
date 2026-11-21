// Reference solution. Private: used only to prove the tests are correct.
export class LRUCache {
  // A Map iterates in insertion order, so the first key is the least recently used.
  private readonly entries = new Map<number, number>();

  constructor(private readonly capacity: number) {}

  get(key: number): number {
    const value = this.entries.get(key);
    if (value === undefined) return -1;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  put(key: number, value: number): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
