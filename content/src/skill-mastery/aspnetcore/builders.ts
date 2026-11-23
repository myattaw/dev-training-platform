import type { CodeSnippet, QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, seededShuffle, type FamilyQuestion } from '../family';
import { cs, text } from '../helpers';

/**
 * ASP.NET Core question builders.
 *
 * Code shown as `csharp` is compiled, and run where it is a program, by the real
 * C# runner (.NET 10 with the ASP.NET Core shared framework; see
 * content/src/checks/csharp-snippets.ts). Programs built with `web()` host a real
 * ASP.NET Core app on loopback inside the runner's sandbox and send it real HTTP
 * requests, so status codes, headers, bodies and middleware traces are checked.
 *
 * EF Core, xUnit, WebApplicationFactory and the JWT bearer handler are NuGet
 * packages the runner does not have: such code is shown with `plain()` and the
 * question is reviewed reasoning, not machine-checked.
 */

const BASE_USINGS = [
  'Microsoft.AspNetCore.Builder',
  'Microsoft.AspNetCore.Hosting',
  'Microsoft.AspNetCore.Http',
  'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Logging',
];

export interface WebProgram {
  /** Extra `using` namespaces. */
  readonly usings?: readonly string[];
  /** `WebApplication.CreateBuilder` (full features, e.g. controllers) instead of the slim builder. */
  readonly full?: boolean;
  /** Run in the Development environment (the default is Production). */
  readonly development?: boolean;
  /** Service registrations, before `builder.Build()`. */
  readonly services?: string;
  /** Middleware and endpoints, after `builder.Build()`. */
  readonly app: string;
  /** Requests sent with `http` (base address set) once the app has started. */
  readonly client: string;
  /** Type declarations after the program. */
  readonly types?: string;
}

/** A complete program that starts a real app on 127.0.0.1:5080, sends requests, and stops. */
export function web(p: WebProgram): string {
  const usings = [...BASE_USINGS, ...(p.usings ?? [])].map((u) => `using ${u};`).join('\n');
  const create = p.full ? 'CreateBuilder' : 'CreateSlimBuilder';
  const options = p.development
    ? 'new WebApplicationOptions { EnvironmentName = "Development" }'
    : '';
  return [
    usings,
    '',
    `var builder = WebApplication.${create}(${options});`,
    'builder.Logging.ClearProviders();',
    'builder.WebHost.UseUrls("http://127.0.0.1:5080");',
    ...(p.services ? [p.services.trim()] : []),
    'var app = builder.Build();',
    p.app.trim(),
    '',
    'await app.StartAsync();',
    'using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:5080") };',
    p.client.trim(),
    'await app.StopAsync();',
    ...(p.types ? ['', p.types.trim()] : []),
    '',
  ].join('\n');
}

const WEB_PROMPT =
  'This C# program starts a real ASP.NET Core app on the loopback address and sends it HTTP requests. What does it print?';

export interface OutputVariant {
  readonly key: string;
  readonly code: string;
  readonly output: string;
  readonly why: string;
  /** Overrides the default prompt. */
  readonly prompt?: string;
}

/** Predict the output of a C# program; checked by running it. `web` selects the HTTP prompt. */
export const outputFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hints: readonly string[],
  variants: readonly OutputVariant[],
  kind: 'web' | 'program' = 'web',
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'predict-output',
    prompt: text(v.prompt ?? (kind === 'web' ? WEB_PROMPT : 'What does this C# program print?')),
    code: cs(v.code),
    answer: { output: v.output },
    hints: [...hints],
    explanation: text(v.why),
  }));

export interface ChoiceVariant {
  readonly key: string;
  readonly question: string;
  /** Optional artifact: C# (compiled and run), or plain text, JSON, YAML. */
  readonly code?: CodeSnippet;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/** Single-answer multiple choice; options shuffled with a stable seed. */
export const choiceFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ChoiceVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...(v.code ? { code: v.code } : {}),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));

export interface MultiVariant {
  readonly key: string;
  readonly question: string;
  readonly code?: CodeSnippet;
  readonly right: readonly string[];
  readonly wrong: readonly string[];
  readonly why: string;
}

/** "Select all that apply": every option is unambiguously right or wrong. */
export const multiFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly MultiVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const order = seededShuffle(
      [...v.right.map((t) => ({ t, ok: true })), ...v.wrong.map((t) => ({ t, ok: false }))],
      `${id}-${v.key}`,
    );
    const options = order.map((o, i) => ({ id: ids[i] ?? `o${i}`, text: o.t }));
    return {
      difficulty,
      format: 'multiple-choice',
      prompt: text(v.question, 'Select all that apply.'),
      ...(v.code ? { code: v.code } : {}),
      options,
      selection: 'multiple',
      answer: { correct: options.filter((_, i) => order[i]?.ok).map((o) => o.id) },
      hints: [hint],
      explanation: text(v.why),
    };
  });
