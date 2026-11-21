/**
 * Values that cross a process boundary (runner container → API) travel as
 * JSON. JSON cannot represent `undefined`, `NaN`, `±Infinity` or BigInt, so
 * those are tagged on the way out and restored on the way in.
 */
export type EncodedValue =
  null | boolean | number | string | EncodedValue[] | { readonly [key: string]: EncodedValue };

const TAG = '$pracstack';

export function encodeValue(value: unknown, depth = 0): EncodedValue {
  if (depth > 50) return { [TAG]: 'too-deep' };
  if (value === undefined) return { [TAG]: 'undefined' };
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { [TAG]: 'NaN' };
    if (value === Infinity) return { [TAG]: 'Infinity' };
    if (value === -Infinity) return { [TAG]: '-Infinity' };
    return value;
  }
  if (typeof value === 'bigint') return { [TAG]: 'bigint', value: value.toString() };
  if (typeof value === 'function') return { [TAG]: 'function' };
  if (typeof value === 'symbol') return { [TAG]: 'symbol' };
  if (Array.isArray(value)) return value.map((v) => encodeValue(v, depth + 1));
  const out: Record<string, EncodedValue> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    out[k] = encodeValue(v, depth + 1);
  return out;
}

export function decodeValue(value: EncodedValue): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  const tag = (value as Record<string, EncodedValue>)[TAG];
  if (typeof tag === 'string') {
    switch (tag) {
      case 'undefined':
        return undefined;
      case 'NaN':
        return NaN;
      case 'Infinity':
        return Infinity;
      case '-Infinity':
        return -Infinity;
      case 'bigint':
        return BigInt(String((value as Record<string, EncodedValue>)['value']));
      default:
        return `[${tag}]`;
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v);
  return out;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

export function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
