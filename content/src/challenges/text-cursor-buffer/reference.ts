// Reference solution. Private: used only to prove the tests are correct.
export class TextBuffer {
  /** Characters before the cursor, in order. */
  private readonly before: string[] = [];
  /** Characters after the cursor, reversed: the last element is next to the cursor. */
  private readonly after: string[] = [];

  insert(text: string): void {
    for (const ch of text) this.before.push(ch);
  }

  backspace(count: number): number {
    const k = Math.min(count, this.before.length);
    this.before.length -= k;
    return k;
  }

  move(offset: number): number {
    if (offset < 0) {
      for (let i = 0; i < -offset && this.before.length > 0; i++) {
        this.after.push(this.before.pop() as string);
      }
    } else {
      for (let i = 0; i < offset && this.after.length > 0; i++) {
        this.before.push(this.after.pop() as string);
      }
    }
    return this.before.length;
  }

  textAround(radius: number): string {
    const left = this.before.slice(Math.max(0, this.before.length - radius)).join('');
    const right = this.after
      .slice(Math.max(0, this.after.length - radius))
      .reverse()
      .join('');
    return `${left}|${right}`;
  }

  getText(): string {
    return this.before.join('') + [...this.after].reverse().join('');
  }

  getCursor(): number {
    return this.before.length;
  }
}
