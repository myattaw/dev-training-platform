import { type ActivityRef, activityKey } from './roles';
import {
  isCovered,
  TERM_CATEGORIES,
  type TaxonomyTerm,
  type TermCategory,
  termNames,
} from './taxonomy';

/*
 * Job description analyzer: deterministic, explainable keyword matching
 * against the taxonomy. No AI and no network: it is a pure function, run in
 * the learner's browser, so a pasted job posting never leaves the device.
 *
 * Rules (each covered by a test in job-analysis.spec.ts):
 * - Names match on token boundaries: "Java" never matches inside
 *   "JavaScript", ".NET" never inside "ASP.NET" or "ADO.NET", "SQL" never
 *   inside "T-SQL" or "MySQL", "C#" never matches "C" or "C++".
 * - The longest match wins where matches overlap: "SQL Server" is one match
 *   (SQL Server), not also a generic "SQL"; "Azure DevOps" is not also
 *   "Azure". A term is still reported if it is mentioned separately elsewhere.
 * - Confidence: high for the canonical name or an unambiguous alias, medium
 *   for an abbreviation or historical name, low for an ambiguous alias
 *   (only counted when its required context is in the same sentence).
 * - Evidence: the sentence or line of each match, trimmed to 160 characters.
 */

/** Longer postings are cut here, with a notice. */
export const MAX_ANALYSIS_CHARS = 20_000;
export const MAX_EVIDENCE_CHARS = 160;
/** Evidence snippets kept per term. */
const MAX_EVIDENCE_PER_TERM = 3;

export type MatchConfidence = 'high' | 'medium' | 'low';

export const CONFIDENCE_LABELS: Readonly<Record<MatchConfidence, string>> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const CONFIDENCE_RANK: Readonly<Record<MatchConfidence, number>> = { high: 3, medium: 2, low: 1 };

export interface TermEvidence {
  /** The sentence or line, trimmed (with … where it was shortened). */
  readonly text: string;
  /** The exact text that matched, as written in the posting. */
  readonly matched: string;
  readonly confidence: MatchConfidence;
}

export interface DetectedTerm {
  readonly term: TaxonomyTerm;
  /** The best confidence over all mentions. */
  readonly confidence: MatchConfidence;
  readonly mentions: number;
  readonly evidence: readonly TermEvidence[];
  /** PracStack has practice for it. */
  readonly covered: boolean;
  /** Position of the first mention (for ordering). */
  readonly firstIndex: number;
}

/** "5+ years of C#": shown as information only; PracStack cannot satisfy it. */
export interface ExperienceRequirement {
  readonly text: string;
  readonly minYears: number;
  readonly maxYears?: number;
  /** Terms mentioned in the same sentence. */
  readonly termIds: readonly string[];
}

export interface JobAnalysis {
  /** Nothing (or only whitespace) was entered. */
  readonly empty: boolean;
  /** The input was longer than {@link MAX_ANALYSIS_CHARS}; only the start was analyzed. */
  readonly truncated: boolean;
  readonly inputLength: number;
  /** Category display order, then order of first mention. */
  readonly terms: readonly DetectedTerm[];
  readonly experience: readonly ExperienceRequirement[];
}

interface Matcher {
  readonly term: TaxonomyTerm;
  readonly regex: RegExp;
  readonly confidence: MatchConfidence;
  /** Required context for ambiguous aliases. */
  readonly context?: RegExp;
}

interface Candidate {
  readonly matcher: Matcher;
  readonly start: number;
  readonly end: number;
}

interface Segment {
  readonly start: number;
  readonly end: number;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** No letter, digit or joining character before: blocks "ASP.NET" → ".NET", "T-SQL" → "SQL". */
const BEFORE = '(?<![\\p{L}\\p{N}_#+.\\-])';
/** No letter, digit, "#" or "+" after, and no ".word": blocks "C#" in "C#x", "ADO" in "ADO.NET". */
const AFTER = '(?![\\p{L}\\p{N}_#+])(?!\\.[\\p{L}\\p{N}])';

function nameRegex(name: string, matchCase: boolean): RegExp {
  const body = name.trim().split(/\s+/).map(escapeRegex).join('\\s+');
  return new RegExp(`${BEFORE}${body}${AFTER}`, matchCase ? 'gu' : 'giu');
}

const matcherCache = new WeakMap<readonly TaxonomyTerm[], readonly Matcher[]>();

function matchersFor(taxonomy: readonly TaxonomyTerm[]): readonly Matcher[] {
  const cached = matcherCache.get(taxonomy);
  if (cached) return cached;
  const matchers: Matcher[] = [];
  for (const term of taxonomy) {
    const exact = new Set(term.matchCase ?? []);
    const context = term.ambiguity?.context?.length
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${term.ambiguity.context.map((c) => c.trim().split(/\s+/).map(escapeRegex).join('\\s+')).join('|')})`,
          'iu',
        )
      : undefined;
    for (const { name, confidence } of termNames(term)) {
      matchers.push({
        term,
        regex: nameRegex(name, exact.has(name)),
        confidence,
        ...(confidence === 'low' && context ? { context } : {}),
      });
    }
  }
  matcherCache.set(taxonomy, matchers);
  return matchers;
}

/** Lines, then sentences within lines (a full stop, "!", "?" or ";" followed by a space). */
function segmentsOf(text: string): Segment[] {
  const segments: Segment[] = [];
  const boundary = /\r?\n|[.!?;](?=\s)/g;
  let start = 0;
  for (const m of text.matchAll(boundary)) {
    const end = m[0] === '\n' || m[0] === '\r\n' ? m.index : m.index + 1;
    if (end > start) segments.push({ start, end });
    start = m.index + m[0].length;
  }
  if (start < text.length) segments.push({ start, end: text.length });
  return segments;
}

function segmentAt(segments: readonly Segment[], index: number): Segment {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((segments[mid]?.start ?? 0) <= index) lo = mid;
    else hi = mid - 1;
  }
  return segments[lo] ?? { start: 0, end: 0 };
}

const BULLET = /^(?:[-*•·–—>]+|\d{1,2}[.)])\s+/;

/** The segment as evidence: whitespace collapsed, bullets removed, at most 160 characters around the match. */
function evidenceText(
  text: string,
  segment: Segment,
  matchStart: number,
  matchEnd: number,
): string {
  const raw = text.slice(segment.start, segment.end);
  const clean = (s: string) => s.replace(/\s+/g, ' ');
  const whole = clean(raw).trim().replace(BULLET, '');
  if (whole.length <= MAX_EVIDENCE_CHARS) return whole;
  // Keep the match visible: a window around it, marked with ellipses.
  const room = MAX_EVIDENCE_CHARS - 2;
  const matchLength = matchEnd - matchStart;
  let from = Math.max(segment.start, matchStart - Math.floor((room - matchLength) / 2));
  const to = Math.min(segment.end, from + room);
  from = Math.max(segment.start, to - room);
  const body = clean(text.slice(from, to)).trim();
  return `${from > segment.start ? '…' : ''}${body}${to < segment.end ? '…' : ''}`;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
};
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
const YEARS = new RegExp(
  `(?<![\\p{L}\\p{N}])${NUM}\\s*(?:\\+|plus)?\\s*(?:(?:-|–|to)\\s*${NUM}\\s*\\+?\\s*)?(?:years?|yrs?)(?![\\p{L}])`,
  'giu',
);
/** A number of years is an experience requirement only in these surroundings. */
const EXPERIENCE_CONTEXT = /experience|\bexperienced\b|\bworking\s+(?:with|in|on)\b|\bhands-on\b/i;
const FOLLOWED_BY_SUBJECT =
  /^\s*(?:'|’)?\s*(?:of|in|with|using|developing|building|programming)\b/i;

const toNumber = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const word = NUMBER_WORDS[s.toLowerCase()];
  return word ?? Number(s);
};

/**
 * Finds technologies, practices and experience requirements in a job
 * posting. Pure and deterministic; fast enough to run on every keystroke
 * (well under 50 ms for {@link MAX_ANALYSIS_CHARS} characters).
 */
export function analyzeJobDescription(
  input: string,
  taxonomy: readonly TaxonomyTerm[],
): JobAnalysis {
  const truncated = input.length > MAX_ANALYSIS_CHARS;
  const text = truncated ? input.slice(0, MAX_ANALYSIS_CHARS) : input;
  if (text.trim() === '') {
    return { empty: true, truncated: false, inputLength: input.length, terms: [], experience: [] };
  }
  const segments = segmentsOf(text);

  // 1. Every candidate match of every name.
  const candidates: Candidate[] = [];
  for (const matcher of matchersFor(taxonomy)) {
    matcher.regex.lastIndex = 0;
    for (const m of text.matchAll(matcher.regex)) {
      const start = m.index;
      const end = start + m[0].length;
      if (matcher.context) {
        const segment = segmentAt(segments, start);
        if (!matcher.context.test(text.slice(segment.start, segment.end))) continue;
      }
      candidates.push({ matcher, start, end });
    }
  }

  // 2. Longest match wins where matches overlap; then the more confident one.
  candidates.sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      CONFIDENCE_RANK[b.matcher.confidence] - CONFIDENCE_RANK[a.matcher.confidence] ||
      a.start - b.start,
  );
  const taken: Candidate[] = [];
  for (const c of candidates) {
    if (!taken.some((t) => c.start < t.end && t.start < c.end)) taken.push(c);
  }
  taken.sort((a, b) => a.start - b.start);

  // 3. Group by term, with evidence.
  const byTerm = new Map<
    string,
    {
      term: TaxonomyTerm;
      best: MatchConfidence;
      mentions: number;
      first: number;
      evidence: TermEvidence[];
    }
  >();
  const termsBySegment = new Map<number, Set<string>>();
  for (const c of taken) {
    const { term, confidence } = c.matcher;
    const segment = segmentAt(segments, c.start);
    const entry = byTerm.get(term.id) ?? {
      term,
      best: confidence,
      mentions: 0,
      first: c.start,
      evidence: [],
    };
    entry.mentions++;
    if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[entry.best]) entry.best = confidence;
    const snippet = evidenceText(text, segment, c.start, c.end);
    if (
      entry.evidence.length < MAX_EVIDENCE_PER_TERM &&
      !entry.evidence.some((e) => e.text === snippet)
    ) {
      entry.evidence.push({ text: snippet, matched: text.slice(c.start, c.end), confidence });
    }
    byTerm.set(term.id, entry);
    const inSegment = termsBySegment.get(segment.start) ?? new Set<string>();
    inSegment.add(term.id);
    termsBySegment.set(segment.start, inSegment);
  }

  const categoryRank = (c: TermCategory) => TERM_CATEGORIES.indexOf(c);
  const terms: DetectedTerm[] = [...byTerm.values()]
    .map((e) => ({
      term: e.term,
      confidence: e.best,
      mentions: e.mentions,
      evidence: e.evidence,
      covered: isCovered(e.term),
      firstIndex: e.first,
    }))
    .sort(
      (a, b) =>
        categoryRank(a.term.category) - categoryRank(b.term.category) ||
        a.firstIndex - b.firstIndex,
    );

  // 4. Experience requirements ("5+ years of C#").
  const experience: ExperienceRequirement[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(YEARS)) {
    const segment = segmentAt(segments, m.index);
    const sentence = text.slice(segment.start, segment.end);
    const after = text.slice(m.index + m[0].length, segment.end);
    if (!EXPERIENCE_CONTEXT.test(sentence) && !FOLLOWED_BY_SUBJECT.test(after)) continue;
    const min = toNumber(m[1]);
    const max = toNumber(m[2]);
    if (min === undefined || !Number.isFinite(min) || min < 1 || min > 40) continue;
    const snippet = evidenceText(text, segment, m.index, m.index + m[0].length);
    if (seen.has(snippet)) continue;
    seen.add(snippet);
    experience.push({
      text: snippet,
      minYears: min,
      ...(max !== undefined && Number.isFinite(max) && max > min ? { maxYears: max } : {}),
      termIds: [...(termsBySegment.get(segment.start) ?? [])],
    });
  }

  return { empty: false, truncated, inputLength: input.length, terms, experience };
}

/** One step of a suggested preparation path: a term and its practice. */
export interface PathStep {
  readonly term: TaxonomyTerm;
  /** Practice not already listed under an earlier step. */
  readonly activities: readonly ActivityRef[];
}

/**
 * An ordered preparation path from term ids (detected, or stored in a saved
 * plan): category order (languages first, ways of working last), then the
 * given order. Uncovered and unknown terms are skipped; activities shared by
 * several terms appear once, under the first.
 */
export function suggestPath(
  termIds: readonly string[],
  taxonomy: readonly TaxonomyTerm[],
): PathStep[] {
  const byId = new Map(taxonomy.map((t) => [t.id, t]));
  const terms = [...new Set(termIds)]
    .map((id, index) => ({ term: byId.get(id), index }))
    .filter((t): t is { term: TaxonomyTerm; index: number } => t.term !== undefined)
    .sort(
      (a, b) =>
        TERM_CATEGORIES.indexOf(a.term.category) - TERM_CATEGORIES.indexOf(b.term.category) ||
        a.index - b.index,
    );
  const seen = new Set<string>();
  const steps: PathStep[] = [];
  for (const { term } of terms) {
    const activities = term.practice.filter((ref) => {
      const key = activityKey(ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (activities.length > 0) steps.push({ term, activities });
  }
  return steps;
}
