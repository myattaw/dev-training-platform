import { expect, type Page } from '@playwright/test';

export const PANGRAM_SOLUTION = `export function isPangram(sentence: string): boolean {
  return new Set(sentence.toLowerCase().match(/[a-z]/g) ?? []).size === 26;
}
`;

export const LRU_SOLUTION = `export class LRUCache {
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
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}
`;

/** Waits until Monaco is loaded and styled. */
export async function waitForEditor(page: Page): Promise<void> {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  // Monaco's stylesheet makes the editor root `position: relative`; unstyled it is `static`.
  await expect(editor).toHaveCSS('position', 'relative');
}

/**
 * Replaces the editor contents by pasting. Typing would trigger Monaco's
 * auto-closing brackets and auto-indent and corrupt the code.
 * Requires the clipboard permissions granted in playwright.config.ts.
 */
export async function replaceCode(page: Page, code: string): Promise<void> {
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}
