import { type ChallengeSource, operationTests } from '@pracstack/content-model';
import type { EditHistory } from './reference';

export const source: ChallengeSource = {
  challenge: {
    id: 'undo-redo-history',
    version: 1,
    title: 'Undo and Redo History',
    summary: 'Record edits to a document so they can be undone and redone.',
    category: 'data-structures',
    difficulty: 'medium',
    tags: ['undo-redo', 'stacks', 'text-editing', 'design'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Editors let you undo your last edits and redo them again. Build the history behind those two buttons for a document that is edited at its end.',
      },
      { kind: 'heading', text: 'Your task' },
      { kind: 'paragraph', text: 'Implement the class `EditHistory`:' },
      {
        kind: 'list',
        items: [
          '`new EditHistory()` starts with an empty document and no history.',
          '`type(text)` adds `text` to the end of the document.',
          '`erase(count)` removes up to `count` characters from the end of the document.',
          '`undo()` reverts the most recent edit that has not been undone and returns `true`, or returns `false` when there is nothing to undo.',
          '`redo()` re-applies the most recently undone edit and returns `true`, or returns `false` when there is nothing to redo.',
          '`getText()` returns the document.',
        ],
      },
      { kind: 'paragraph', text: 'Two rules make the history predictable:' },
      {
        kind: 'list',
        items: [
          'A new edit (`type` or `erase`) clears everything that could be redone.',
          'An edit that changes nothing, such as typing an empty string or erasing from an empty document, is not recorded and does not clear the redo history.',
        ],
      },
      {
        kind: 'code',
        code: 'const history = new EditHistory();\nhistory.type("hello");\nhistory.type(" world");\nhistory.undo();     // true\nhistory.getText();  // "hello"\nhistory.redo();     // true\nhistory.getText();  // "hello world"\nhistory.redo();     // false',
      },
      { kind: 'heading', text: 'Going further' },
      {
        kind: 'paragraph',
        text: 'Store each edit with what it needs to be reversed (for `erase`, the characters it removed), in one stack for undo and one for redo.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'EditHistory',
        starterCode: `export class EditHistory {
  type(text: string): void {
    throw new Error('Not implemented');
  }

  erase(count: number): void {
    throw new Error('Not implemented');
  }

  undo(): boolean {
    throw new Error('Not implemented');
  }

  redo(): boolean {
    throw new Error('Not implemented');
  }

  getText(): string {
    throw new Error('Not implemented');
  }
}
`,
      },
      java: {
        entryPoint: 'EditHistory',
        starterCode: `class EditHistory {
    EditHistory() {
        // TODO: set up your storage
    }

    void type(String text) {
        throw new UnsupportedOperationException("Not implemented");
    }

    void erase(int count) {
        throw new UnsupportedOperationException("Not implemented");
    }

    boolean undo() {
        throw new UnsupportedOperationException("Not implemented");
    }

    boolean redo() {
        throw new UnsupportedOperationException("Not implemented");
    }

    String getText() {
        throw new UnsupportedOperationException("Not implemented");
    }
}
`,
      },
      csharp: {
        entryPoint: 'EditHistory',
        starterCode: `public class EditHistory
{
    public EditHistory()
    {
        // TODO: set up your storage
    }

    /// <summary>Adds <paramref name="text"/> to the end of the document.</summary>
    public void Type(string text)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Removes up to <paramref name="count"/> characters from the end of the document.</summary>
    public void Erase(int count)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Reverts the most recent edit; returns false when there is nothing to undo.</summary>
    public bool Undo()
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Re-applies the most recently undone edit; returns false when there is nothing to redo.</summary>
    public bool Redo()
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Returns the document.</summary>
    public string GetText()
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: operationTests<typeof EditHistory>([
      {
        description: 'undoes the last edit',
        constructorArgs: [],
        steps: [
          { call: 'type', args: ['hello'] },
          { call: 'type', args: [' world'] },
          { call: 'getText', args: [], expected: 'hello world' },
          { call: 'undo', args: [], expected: true },
          { call: 'getText', args: [], expected: 'hello' },
        ],
      },
      {
        description: 'redoes an undone edit',
        constructorArgs: [],
        steps: [
          { call: 'type', args: ['abc'] },
          { call: 'undo', args: [], expected: true },
          { call: 'getText', args: [], expected: '' },
          { call: 'redo', args: [], expected: true },
          { call: 'getText', args: [], expected: 'abc' },
          { call: 'redo', args: [], expected: false },
        ],
      },
      {
        description: 'undoing an erase restores the characters',
        constructorArgs: [],
        steps: [
          { call: 'type', args: ['abcdef'] },
          { call: 'erase', args: [2] },
          { call: 'getText', args: [], expected: 'abcd' },
          { call: 'undo', args: [], expected: true },
          { call: 'getText', args: [], expected: 'abcdef' },
        ],
      },
      {
        description: 'a new edit clears the redo history',
        constructorArgs: [],
        steps: [
          { call: 'type', args: ['a'] },
          { call: 'type', args: ['b'] },
          { call: 'undo', args: [], expected: true },
          { call: 'type', args: ['c'] },
          { call: 'redo', args: [], expected: false },
          { call: 'getText', args: [], expected: 'ac' },
        ],
      },
      {
        description: 'nothing to undo',
        constructorArgs: [],
        steps: [
          { call: 'undo', args: [], expected: false },
          { call: 'getText', args: [], expected: '' },
        ],
      },
    ]),
  },
  hiddenTests: operationTests<typeof EditHistory>([
    {
      description: 'erasing more than the document',
      constructorArgs: [],
      steps: [
        { call: 'type', args: ['ab'] },
        { call: 'erase', args: [5] },
        { call: 'getText', args: [], expected: '' },
        { call: 'undo', args: [], expected: true },
        { call: 'getText', args: [], expected: 'ab' },
      ],
    },
    {
      description: 'an erase that changes nothing keeps the redo history',
      constructorArgs: [],
      steps: [
        { call: 'type', args: ['x'] },
        { call: 'undo', args: [], expected: true },
        { call: 'erase', args: [3] },
        { call: 'redo', args: [], expected: true },
        { call: 'getText', args: [], expected: 'x' },
      ],
    },
    {
      description: 'typing an empty string is not recorded',
      constructorArgs: [],
      steps: [
        { call: 'type', args: ['a'] },
        { call: 'type', args: [''] },
        { call: 'undo', args: [], expected: true },
        { call: 'getText', args: [], expected: '' },
        { call: 'undo', args: [], expected: false },
      ],
    },
    {
      description: 'several undos and redos',
      constructorArgs: [],
      steps: [
        { call: 'type', args: ['a'] },
        { call: 'type', args: ['b'] },
        { call: 'type', args: ['c'] },
        { call: 'undo', args: [], expected: true },
        { call: 'undo', args: [], expected: true },
        { call: 'getText', args: [], expected: 'a' },
        { call: 'redo', args: [], expected: true },
        { call: 'getText', args: [], expected: 'ab' },
        { call: 'undo', args: [], expected: true },
        { call: 'undo', args: [], expected: true },
        { call: 'getText', args: [], expected: '' },
        { call: 'undo', args: [], expected: false },
      ],
    },
    {
      description: 'erasing zero characters is not recorded',
      constructorArgs: [],
      steps: [
        { call: 'type', args: ['abc'] },
        { call: 'erase', args: [0] },
        { call: 'undo', args: [], expected: true },
        { call: 'getText', args: [], expected: '' },
      ],
    },
  ]),
};
