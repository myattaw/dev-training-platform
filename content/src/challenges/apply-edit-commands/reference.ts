// Reference solution. Private: used only to prove the tests are correct.
export function applyEdits(commands: string[]): string {
  // Text before the cursor, and text after it.
  let before = '';
  let after = '';
  for (const command of commands) {
    const space = command.indexOf(' ');
    const name = space < 0 ? command : command.slice(0, space);
    const arg = space < 0 ? '' : command.slice(space + 1);
    if (name === 'type' && space >= 0) {
      before += arg;
      continue;
    }
    if (name === 'home') {
      after = before + after;
      before = '';
      continue;
    }
    if (name === 'end') {
      before += after;
      after = '';
      continue;
    }
    if (!/^\d+$/.test(arg)) continue;
    const n = Number(arg);
    if (name === 'left') {
      const k = Math.min(n, before.length);
      after = before.slice(before.length - k) + after;
      before = before.slice(0, before.length - k);
    } else if (name === 'right') {
      const k = Math.min(n, after.length);
      before += after.slice(0, k);
      after = after.slice(k);
    } else if (name === 'backspace') {
      before = before.slice(0, Math.max(0, before.length - n));
    } else if (name === 'delete') {
      after = after.slice(Math.min(n, after.length));
    }
  }
  return before + after;
}
