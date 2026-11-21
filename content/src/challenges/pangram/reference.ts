// Reference solution. Private: used only to prove the tests are correct.
export function isPangram(sentence: string): boolean {
  return new Set(sentence.toLowerCase().match(/[a-z]/g) ?? []).size === 26;
}
