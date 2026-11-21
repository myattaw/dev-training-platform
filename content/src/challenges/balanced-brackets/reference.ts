// Reference solution. Private: used only to prove the tests are correct.
const PAIRS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

export function isBalanced(text: string): boolean {
  const stack: string[] = [];
  for (const ch of text) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (ch in PAIRS && stack.pop() !== PAIRS[ch]) return false;
  }
  return stack.length === 0;
}
