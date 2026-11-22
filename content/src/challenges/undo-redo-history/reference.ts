// Reference solution. Private: used only to prove the tests are correct.
interface Edit {
  readonly kind: 'type' | 'erase';
  readonly text: string;
}

export class EditHistory {
  private text = '';
  private readonly done: Edit[] = [];
  private readonly undone: Edit[] = [];

  type(text: string): void {
    if (text === '') return;
    this.apply({ kind: 'type', text });
    this.done.push({ kind: 'type', text });
    this.undone.length = 0;
  }

  erase(count: number): void {
    const removed = this.text.slice(Math.max(0, this.text.length - count));
    if (removed === '') return;
    this.apply({ kind: 'erase', text: removed });
    this.done.push({ kind: 'erase', text: removed });
    this.undone.length = 0;
  }

  undo(): boolean {
    const edit = this.done.pop();
    if (!edit) return false;
    this.apply({ kind: edit.kind === 'type' ? 'erase' : 'type', text: edit.text });
    this.undone.push(edit);
    return true;
  }

  redo(): boolean {
    const edit = this.undone.pop();
    if (!edit) return false;
    this.apply(edit);
    this.done.push(edit);
    return true;
  }

  getText(): string {
    return this.text;
  }

  private apply(edit: Edit): void {
    this.text =
      edit.kind === 'type'
        ? this.text + edit.text
        : this.text.slice(0, this.text.length - edit.text.length);
  }
}
