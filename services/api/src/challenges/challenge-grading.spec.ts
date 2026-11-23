import { readFileSync } from 'node:fs';
import type { SubmissionResponse } from '@pracstack/api-contracts';
import { CHALLENGES } from '@pracstack/content';
import { DockerCodeRunner } from '@pracstack/code-runner';
import {
  LANGUAGE_LABELS,
  type LanguageId,
  splitChallenge,
  supportedLanguages,
} from '@pracstack/content-model';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContentSource } from '../content/content-source';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { testApi } from '../testing/fixtures';

/*
 * End-to-end grading through the real runner containers. Proves that every
 * reference solution (TypeScript, Java and C#) passes all visible and hidden
 * tests, and that starter code does not. Needs Docker and the runner images
 * (`npm run runners:build`); set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const runner = new DockerCodeRunner({ maxConcurrent: 3 });

beforeAll(async () => {
  if (skip) return;
  const status = await runner.check();
  if (!status.ok) throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
}, 60_000);

const content = createContentSource(
  'test',
  [],
  {},
  CHALLENGES.map((entry) => {
    const { challenge, grading } = splitChallenge(entry.source);
    return { challenge, grading };
  }),
);
const api = testApi({
  content,
  codeRunner: runner,
  codeRateLimiter: new SlidingWindowRateLimiter(1000, 60_000),
});

const typescriptReference = (id: string): string =>
  readFileSync(
    new URL(`../../../../content/src/challenges/${id}/reference.ts`, import.meta.url),
    'utf8',
  );

const submit = async (id: string, language: LanguageId, code: string) => {
  const res = await api.call('POST', `/api/challenges/${id}/submissions`, { language, code });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as SubmissionResponse;
};

describe.skipIf(skip)('grading real challenges in containers', { timeout: 120_000 }, () => {
  for (const entry of CHALLENGES) {
    const { id, languages } = entry.source.challenge;

    const references: Partial<Record<LanguageId, string>> = {
      ...(entry.reference ? { typescript: typescriptReference(id) } : {}),
      ...(entry.javaReference ? { java: entry.javaReference } : {}),
      ...(entry.csharpReference ? { csharp: entry.csharpReference } : {}),
    };
    for (const [language, code] of Object.entries(references) as [LanguageId, string][]) {
      it(`${id}: the ${LANGUAGE_LABELS[language]} reference is accepted`, async () => {
        const res = await submit(id, language, code);
        expect(res.submission, JSON.stringify(res.detail)).toMatchObject({ status: 'accepted' });
        expect(res.submission.hiddenPassed).toBe(res.submission.hiddenTotal);
      });
    }

    it(`${id}: every offered language has a reference`, () => {
      expect(Object.keys(references).sort()).toEqual(
        supportedLanguages(entry.source.challenge).sort(),
      );
    });

    it(`${id}: starter code compiles in every language but is not accepted`, async () => {
      for (const language of supportedLanguages(entry.source.challenge)) {
        const starter = languages[language]?.starterCode ?? '';
        const res = await submit(id, language, starter);
        expect(res.submission.status, `${language}: ${JSON.stringify(res.detail)}`).toBe('failed');
      }
    });
  }
});

/*
 * Common mistakes, written in C#. Each compiles and runs, so the tests (not the
 * compiler) must catch it: a grader that accepted any of these would be too lenient.
 */
const INCORRECT_CSHARP: readonly { id: string; mistake: string; code: string }[] = [
  {
    id: 'pangram',
    mistake: 'a case-sensitive pangram check',
    code: `public static class Solution
{
    public static bool IsPangram(string sentence) =>
        sentence.Where(c => c >= 'a' && c <= 'z').Distinct().Count() == 26;
}
`,
  },
  {
    id: 'balanced-brackets',
    mistake: 'only counting brackets, ignoring their order',
    code: `public static class Solution
{
    public static bool IsBalanced(string text) =>
        text.Count(c => c == '(') == text.Count(c => c == ')')
        && text.Count(c => c == '[') == text.Count(c => c == ']')
        && text.Count(c => c == '{') == text.Count(c => c == '}');
}
`,
  },
  {
    id: 'merge-intervals',
    mistake: 'merging without sorting first',
    code: `public static class Solution
{
    public static int[][] Merge(int[][] intervals)
    {
        var merged = new List<int[]>();
        foreach (var interval in intervals)
        {
            if (merged.Count > 0 && interval[0] <= merged[^1][1])
                merged[^1][1] = Math.Max(merged[^1][1], interval[1]);
            else
                merged.Add([interval[0], interval[1]]);
        }
        return merged.ToArray();
    }
}
`,
  },
  {
    id: 'lru-cache',
    mistake: 'an LRU cache that never evicts',
    code: `public class LRUCache
{
    private readonly Dictionary<int, int> _entries = new();

    public LRUCache(int capacity) { }

    public int Get(int key) => _entries.TryGetValue(key, out var value) ? value : -1;

    public void Put(int key, int value) => _entries[key] = value;
}
`,
  },
];

describe.skipIf(skip)('rejecting incorrect C# solutions', { timeout: 120_000 }, () => {
  for (const { id, mistake, code } of INCORRECT_CSHARP) {
    it(`${id}: ${mistake} is not accepted`, async () => {
      const res = await submit(id, 'csharp', code);
      expect(res.submission.status, JSON.stringify(res.detail)).toBe('failed');
    });
  }
});

/*
 * Employee API: realistic one-line bugs in an otherwise correct solution. The HTTP
 * integration tests must catch each of them.
 */
const employeeReference = CHALLENGES.find((c) => c.source.challenge.id === 'employee-api')
  ?.csharpReference as string;
const EMPLOYEE_API_BUGS: readonly { mistake: string; from: string; to: string }[] = [
  {
    mistake: 'reusing ids after a delete (Count + 1)',
    from: 'new Employee(++_lastId,',
    to: 'new Employee(_byId.Count + 1,',
  },
  {
    mistake: 'a case-sensitive duplicate check',
    from: 'request.Email?.Trim().ToLowerInvariant()',
    to: 'request.Email?.Trim()',
  },
  {
    mistake: '200 OK instead of 201 Created',
    from: 'Results.Created($"/employees/{created.Id}", created)',
    to: 'Results.Ok(created)',
  },
  { mistake: 'no upper bound on pageSize', from: 'size is < 1 or > 50', to: 'size < 1' },
  {
    mistake: 'returning 200 with null for a missing employee',
    from: 'store.Find(id) is { } employee ? Results.Ok(employee) : Results.NotFound()',
    to: 'Results.Ok(store.Find(id))',
  },
];

describe.skipIf(skip)('rejecting buggy Employee APIs', { timeout: 120_000 }, () => {
  for (const { mistake, from, to } of EMPLOYEE_API_BUGS) {
    it(`${mistake} is not accepted`, async () => {
      expect(employeeReference).toContain(from);
      const res = await submit('employee-api', 'csharp', employeeReference.replace(from, to));
      expect(res.submission.status, JSON.stringify(res.detail)).toBe('failed');
    });
  }
});

/*
 * Enterprise challenges: realistic one-line bugs injected into the C# reference.
 * Each must still compile, and the hidden tests must reject it.
 */
const csharpReferenceOf = (id: string): string =>
  CHALLENGES.find((c) => c.source.challenge.id === id)?.csharpReference as string;

const ENTERPRISE_BUGS: Readonly<
  Record<string, readonly { mistake: string; from: string; to: string }[]>
> = {
  'transaction-batch': [
    {
      mistake: 'totalling money as double',
      from: 'totals[key] = totals.GetValueOrDefault(key) + record.Amount;',
      to: 'totals[key] = (decimal)((double)totals.GetValueOrDefault(key) + (double)record.Amount);',
    },
    {
      mistake: 'not detecting duplicates',
      from: 'if (error is null && !seenIds.Add(record.Id)) error = "duplicate-id";',
      to: 'if (error is null) seenIds.Add(record.Id);',
    },
    {
      mistake: 'case-sensitive duplicate ids',
      from: 'new HashSet<string>(StringComparer.OrdinalIgnoreCase)',
      to: 'new HashSet<string>(StringComparer.Ordinal)',
    },
    {
      mistake: 'accepting a zero amount',
      from: 'if (amount <= 0) return "non-positive-amount";',
      to: 'if (amount < 0) return "non-positive-amount";',
    },
    {
      mistake: 'checking decimal places on the parsed value (12.300 accepted)',
      from: 'if (point >= 0 && amountText.Length - point - 1 > 2) return "too-many-decimals";',
      to: 'if (decimal.Round(amount, 2) != amount) return "too-many-decimals";',
    },
    {
      mistake: 'line numbers that skip blank lines',
      from: 'if (string.IsNullOrWhiteSpace(lines[i])) continue;',
      to: 'if (string.IsNullOrWhiteSpace(lines[i])) { lines = lines.Where((_, j) => j != i).ToArray(); i--; continue; }',
    },
    {
      mistake: 'an invalid line claiming its id',
      from: 'var error = Validate(lines[i], out var record);',
      to: "var error = Validate(lines[i], out var record); if (error is not null) seenIds.Add(lines[i].Split(',')[0].Trim());",
    },
  ],
  'secure-customer-api': [
    {
      mistake: 'endpoints that do not require authentication',
      from: 'app.MapGroup("/customers").RequireAuthorization();',
      to: 'app.MapGroup("/customers");',
    },
    {
      mistake: 'no ownership check on reads (broken object-level authorization)',
      from: 'store.Find(id) is { } c && CanRead(user, c)',
      to: 'store.Find(id) is { } c',
    },
    {
      mistake: 'returning the entity instead of the DTO',
      from: '? Results.Ok(CustomerDto.From(c))',
      to: '? Results.Ok(c)',
    },
    {
      mistake: 'listing every customer to every user',
      from: 'store.All().Where(c => CanRead(user, c))',
      to: 'store.All()',
    },
    {
      mistake: 'letting support change records',
      from: 'if (!IsOwner(user, customer)) return Results.Forbid();',
      to: '',
    },
    {
      mistake: '403 instead of 404 for another user’s record',
      from: 'if (customer is null || !CanRead(user, customer)) return Results.NotFound();',
      to: 'if (customer is null) return Results.NotFound(); if (!CanRead(user, customer)) return Results.Forbid();',
    },
    {
      mistake: 'echoing the exception message in the 400',
      from: `            catch (ArgumentException)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["email"] = ["Enter an email address such as name@example.com."],
                });
            }`,
      to: `            catch (ArgumentException ex)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["email"] = [ex.Message],
                });
            }`,
    },
    {
      mistake: 'validating before checking access',
      from: `            var customer = store.Find(id);
            if (customer is null || !CanRead(user, customer)) return Results.NotFound();`,
      to: `            try { store.UpdateEmail(-1, request.Email); } catch (ArgumentException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Invalid email."] }); } catch (KeyNotFoundException) { }
            var customer = store.Find(id);
            if (customer is null || !CanRead(user, customer)) return Results.NotFound();`,
    },
  ],
  'legacy-invoice-refactor': [
    {
      mistake: 'rounding half-cents away from zero',
      from: 'Math.Round(total, 2)',
      to: 'Math.Round(total, 2, MidpointRounding.AwayFromZero)',
    },
    {
      mistake: 'a discount threshold of 100 or more',
      from: 'private const decimal DiscountThreshold = 100m;',
      to: 'private const decimal DiscountThreshold = 99.99m;',
    },
    {
      mistake: 'bulk discount only above 10',
      from: 'Quantity >= BulkQuantity',
      to: 'Quantity > BulkQuantity',
    },
    {
      mistake: 'free shipping decided on the subtotal before the discount',
      from: 'discounted >= FreeShippingFrom',
      to: 'subtotal >= FreeShippingFrom',
    },
    {
      mistake: 'case-insensitive country codes',
      from: 'private static readonly Dictionary<string, decimal> VatRates = new()',
      to: 'private static readonly Dictionary<string, decimal> VatRates = new(StringComparer.OrdinalIgnoreCase)',
    },
    {
      mistake: 'a lenient quantity parser',
      from: 'int.TryParse(fields[1], NumberStyles.None,',
      to: 'int.TryParse(fields[1].Trim(), NumberStyles.Integer,',
    },
    {
      mistake: 'not fixing INV-4521 (the discount still carries over)',
      from: `    private decimal DiscountRate(decimal subtotal) => CustomerType switch
    {
        "STAFF" => 0.30m,
        "GOLD" when subtotal > DiscountThreshold => 0.10m,
        "SILVER" when subtotal > DiscountThreshold => 0.05m,
        _ => 0m,
    };`,
      to: `    private static decimal _carried;
    private decimal DiscountRate(decimal subtotal) => _carried = CustomerType switch
    {
        "STAFF" => 0.30m,
        "GOLD" when subtotal > DiscountThreshold => 0.10m,
        "SILVER" when subtotal > DiscountThreshold => 0.05m,
        _ => _carried,
    };`,
    },
  ],
};

describe.skipIf(skip)('rejecting buggy enterprise solutions', { timeout: 120_000 }, () => {
  for (const [id, bugs] of Object.entries(ENTERPRISE_BUGS)) {
    for (const { mistake, from, to } of bugs) {
      it(`${id}: ${mistake} is not accepted`, async () => {
        const reference = csharpReferenceOf(id);
        expect(reference).toContain(from);
        const res = await submit(id, 'csharp', reference.replace(from, to));
        expect(res.submission.status, JSON.stringify(res.detail)).toBe('failed');
      });
    }
  }
});
