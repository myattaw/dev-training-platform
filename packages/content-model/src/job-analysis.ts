import { type ActivityRef, activityKey } from './roles';
import {
  type CoverageLevel,
  coverageOf,
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
 * - Requirement level (separate from detection confidence): from the posting's
 *   section ("Requirements", "Preferred qualifications", "Responsibilities"…)
 *   and the wording nearest the mention ("is a plus", "familiarity with",
 *   "must have"…). Wording wins over the section, so "Nice to have: Docker"
 *   inside a Requirements list is preferred, not required.
 * - Alternatives: "Azure or AWS", "Java, Python, or TypeScript" and examples
 *   ("cloud platforms such as Azure and AWS") form a group where one member
 *   is enough; a term mentioned only inside groups is an "alternative".
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

/**
 * How the posting asks for something (not how sure the match is):
 * - `required`: in a requirements section, or "required", "must have";
 * - `responsibility`: part of the job ("You will maintain…", Responsibilities);
 * - `preferred`: "preferred", "is a plus", "nice to have", Preferred qualifications;
 * - `familiarity`: "familiarity with", "exposure to", "basic knowledge of";
 * - `alternative`: only mentioned as one of several options ("Azure or AWS")
 *   or as an example ("such as");
 * - `mentioned`: elsewhere (about the company, the team, benefits);
 * - `uncertain`: the posting has no recognizable structure or wording.
 */
export type RequirementLevel =
  | 'required'
  | 'responsibility'
  | 'preferred'
  | 'familiarity'
  | 'alternative'
  | 'mentioned'
  | 'uncertain';

export const REQUIREMENT_LABELS: Readonly<Record<RequirementLevel, string>> = {
  required: 'Required',
  responsibility: 'Core responsibility',
  preferred: 'Preferred',
  familiarity: 'General familiarity',
  alternative: 'One of several options',
  mentioned: 'Mentioned',
  uncertain: 'Uncertain',
};

/** Strongest first; a term's level is the strongest of its mentions. */
export const REQUIREMENT_RANK: Readonly<Record<RequirementLevel, number>> = {
  required: 6,
  responsibility: 5,
  preferred: 4,
  familiarity: 3,
  alternative: 2,
  mentioned: 1,
  uncertain: 0,
};

export interface TermEvidence {
  /** The sentence or line, trimmed (with … where it was shortened). */
  readonly text: string;
  /** The exact text that matched, as written in the posting. */
  readonly matched: string;
  readonly confidence: MatchConfidence;
  /** How this mention reads. */
  readonly requirement: RequirementLevel;
}

export interface DetectedTerm {
  readonly term: TaxonomyTerm;
  /** The best confidence over all mentions. */
  readonly confidence: MatchConfidence;
  readonly mentions: number;
  readonly evidence: readonly TermEvidence[];
  /** PracStack has direct practice for it (all or part of it). */
  readonly covered: boolean;
  readonly coverage: CoverageLevel;
  /** The strongest way the posting asks for it. */
  readonly requirement: RequirementLevel;
  /** Ids of the alternative groups it belongs to. */
  readonly alternativeGroups: readonly string[];
  /** Only matched through an ambiguous name ("MVC", "ASP.NET" alone). */
  readonly ambiguous: boolean;
  /** Position of the first mention (for ordering). */
  readonly firstIndex: number;
}

/** Where in the posting a line is. */
export type PostingSection = 'required' | 'preferred' | 'responsibilities' | 'other' | 'none';

/** Several terms where one is enough ("Azure or AWS"), or examples ("such as Azure and AWS"). */
export interface AlternativeGroup {
  readonly id: string;
  readonly kind: 'or' | 'examples';
  /** In the order written. */
  readonly termIds: readonly string[];
  /** How the posting asks for the group as a whole. */
  readonly level: Exclude<RequirementLevel, 'alternative'>;
  /** The broader requirement the examples illustrate ("cloud platforms"), when recognized. */
  readonly parentTermId?: string;
  readonly evidence: string;
}

/** "5+ years of C#": shown as information only; PracStack cannot satisfy it. */
export interface ExperienceRequirement {
  readonly text: string;
  readonly minYears: number;
  readonly maxYears?: number;
  /** Terms mentioned in the same sentence. */
  readonly termIds: readonly string[];
}

/** Things PracStack cannot practice or verify: degrees, eligibility, soft skills. */
export type QualificationKind = 'education' | 'eligibility' | 'communication';

export const QUALIFICATION_LABELS: Readonly<Record<QualificationKind, string>> = {
  education: 'Education',
  eligibility: 'Work eligibility and location',
  communication: 'Communication and teamwork',
};

export interface Qualification {
  readonly kind: QualificationKind;
  readonly text: string;
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
  readonly alternatives: readonly AlternativeGroup[];
  /** Degrees, eligibility and soft skills: shown, never practiced or verified. */
  readonly qualifications: readonly Qualification[];
  /** Section headings ("Requirements:") were found. */
  readonly structured: boolean;
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
 * Finds technologies, practices, how each is asked for, alternatives,
 * experience requirements and general qualifications in a job posting.
 * Pure and deterministic; fast enough to run on every keystroke (well under
 * 50 ms for {@link MAX_ANALYSIS_CHARS} characters).
 */
export function analyzeJobDescription(
  input: string,
  taxonomy: readonly TaxonomyTerm[],
): JobAnalysis {
  const truncated = input.length > MAX_ANALYSIS_CHARS;
  const text = truncated ? input.slice(0, MAX_ANALYSIS_CHARS) : input;
  if (text.trim() === '') {
    return {
      empty: true,
      truncated: false,
      inputLength: input.length,
      terms: [],
      experience: [],
      alternatives: [],
      qualifications: [],
      structured: false,
    };
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

  // 3. How each mention is asked for, and alternative groups.
  const sections = sectionsOf(text);
  const structured = sections.some((s) => s.heading && s.section !== 'none');
  const levels = taken.map((c) =>
    mentionLevel(
      text,
      segmentAt(segments, c.start),
      c.start,
      c.end,
      sectionAt(sections, c.start),
      structured,
    ),
  );
  const { groups: alternatives, grouped } = alternativeGroups(text, segments, taken, levels);

  // 4. Group by term, with evidence.
  const byTerm = new Map<
    string,
    {
      term: TaxonomyTerm;
      best: MatchConfidence;
      mentions: number;
      first: number;
      evidence: TermEvidence[];
      requirement: RequirementLevel | undefined;
      groups: Set<string>;
    }
  >();
  const termsBySegment = new Map<number, Set<string>>();
  taken.forEach((c, i) => {
    const { term, confidence } = c.matcher;
    const segment = segmentAt(segments, c.start);
    const entry = byTerm.get(term.id) ?? {
      term,
      best: confidence,
      mentions: 0,
      first: c.start,
      evidence: [],
      requirement: undefined,
      groups: new Set<string>(),
    };
    entry.mentions++;
    if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[entry.best]) entry.best = confidence;
    const group = grouped.get(i);
    const level: RequirementLevel = group ? 'alternative' : (levels[i] ?? 'uncertain');
    if (group) entry.groups.add(group);
    else if (!entry.requirement || REQUIREMENT_RANK[level] > REQUIREMENT_RANK[entry.requirement])
      entry.requirement = level;
    const snippet = evidenceText(text, segment, c.start, c.end);
    if (
      entry.evidence.length < MAX_EVIDENCE_PER_TERM &&
      !entry.evidence.some((e) => e.text === snippet)
    ) {
      entry.evidence.push({
        text: snippet,
        matched: text.slice(c.start, c.end),
        confidence,
        requirement: level,
      });
    }
    byTerm.set(term.id, entry);
    const inSegment = termsBySegment.get(segment.start) ?? new Set<string>();
    inSegment.add(term.id);
    termsBySegment.set(segment.start, inSegment);
  });

  const categoryRank = (c: TermCategory) => TERM_CATEGORIES.indexOf(c);
  const terms: DetectedTerm[] = [...byTerm.values()]
    .map((e) => ({
      term: e.term,
      confidence: e.best,
      mentions: e.mentions,
      evidence: e.evidence,
      covered: isCovered(e.term),
      coverage: coverageOf(e.term),
      // Mentioned only inside alternative groups: one of several options.
      requirement: e.requirement ?? ('alternative' as const),
      alternativeGroups: [...e.groups],
      ambiguous: e.best === 'low',
      firstIndex: e.first,
    }))
    .sort(
      (a, b) =>
        categoryRank(a.term.category) - categoryRank(b.term.category) ||
        a.firstIndex - b.firstIndex,
    );

  // 5. Experience requirements ("5+ years of C#").
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

  return {
    empty: false,
    truncated,
    inputLength: input.length,
    terms,
    experience,
    alternatives,
    qualifications: qualificationsOf(text, segments),
    structured,
  };
}

/* ---------------------------------------------------------------- Sections and wording */

interface SectionSpan {
  readonly start: number;
  readonly end: number;
  readonly section: PostingSection;
  /** The line is a heading (or starts with one, "Requirements: …"). */
  readonly heading: boolean;
}

const normalizeHeading = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[:?!.]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const HEADINGS: readonly (readonly [PostingSection, RegExp])[] = [
  [
    'preferred',
    /^(?:(?:preferred|desired|additional|bonus|nice[- ]to[- ]have|good[- ]to[- ]have)(?: (?:qualifications|skills|experience|requirements))?|nice[- ]to[- ]haves|bonus points|pluses|desirable|it's a plus if you have)$/,
  ],
  [
    'required',
    /^(?:requirements?|required(?: (?:qualifications|skills|experience))?|minimum (?:qualifications|requirements)|basic qualifications|qualifications|must[- ]haves?|what we're looking for|what we are looking for|what you(?:'ll| will)? (?:need|bring)|who you are|(?:technical )?skills(?: and (?:experience|qualifications))?|your (?:skills|experience|profile|background)|you have|requirements and qualifications|knowledge,? skills,? and abilities|experience(?: and qualifications)?|job requirements|education and experience)$/,
  ],
  [
    'responsibilities',
    /^(?:(?:key |main |primary |core )?responsibilities|(?:essential |job )?duties(?: and responsibilities)?|what you(?:'ll| will) do|what will you do|what you will be doing|what you'll be doing|your role|the role|in this role(?:,? you will)?|day[- ]to[- ]day|a day in the life|position summary|role overview|essential functions|about the (?:role|job|position)|job summary)$/,
  ],
  [
    'other',
    /^(?:about (?:us|the company|the team)|benefits|perks(?: and benefits)?|compensation|salary(?: range)?|pay|why join us|why you'll love working here|our culture|our values|equal (?:employment )?opportunity.*|eeo.*|location|how to apply|what we offer)$/,
  ],
];

/** Classifies a heading line; undefined when the line is not a heading. */
export function headingSection(line: string): PostingSection | undefined {
  const raw = line
    .replace(BULLET, '')
    .replace(/^#+\s*/, '')
    .replace(/\*+/g, '')
    .trim();
  if (raw === '' || raw.length > 70) return undefined;
  const text = normalizeHeading(raw);
  for (const [section, regex] of HEADINGS) if (regex.test(text)) return section;
  // An unknown short line ending in ":" is a heading too, of nothing we know.
  return /:\s*$/.test(raw) && raw.split(/\s+/).length <= 6 ? 'none' : undefined;
}

/** Each line's section, from the nearest heading above it ("Heading: text" counts for its own line). */
function sectionsOf(text: string): SectionSpan[] {
  const spans: SectionSpan[] = [];
  let current: PostingSection = 'none';
  let start = 0;
  for (const line of text.split('\n')) {
    const end = start + line.length;
    const heading = headingSection(line);
    const inline = /^\s*(?:[-*•]\s*)?([^:\n]{2,50}):\s*\S/.exec(line);
    const inlineSection = inline?.[1] ? headingSection(`${inline[1]}:`) : undefined;
    if (heading !== undefined) {
      current = heading;
      spans.push({ start, end, section: current, heading: true });
    } else if (inlineSection !== undefined && inlineSection !== 'none') {
      // "Requirements: C#, SQL" is in that section; "Nice to have: Docker" inside a
      // Requirements list changes only its own line.
      const list = current === 'required' || current === 'preferred';
      if (!list) current = inlineSection;
      spans.push({ start, end, section: inlineSection, heading: true });
    } else {
      spans.push({ start, end, section: current, heading: false });
    }
    start = end + 1;
  }
  return spans;
}

function sectionAt(spans: readonly SectionSpan[], index: number): PostingSection {
  for (const s of spans) if (index >= s.start && index <= s.end) return s.section;
  return 'none';
}

const PREFERRED_WORDING =
  /\b(?:(?:is|are|would be) (?:a |an )?(?:plus|bonus|advantage|asset)|a plus|an asset|an advantage|preferred|preferably|nice[- ]to[- ]have|bonus|desirable|desired|ideally|good to have|beneficial|not required|optional)\b/gi;
const FAMILIARITY_WORDING =
  /\b(?:familiarity|familiar with|exposure to|exposed to|awareness of|aware of|basic (?:understanding|knowledge)|working knowledge|general knowledge|some experience)\b/gi;
const REQUIRED_WORDING =
  /\b(?:required|requires?|must[- ]have|must|mandatory|essential|minimum of|at least|proficien(?:t|cy)|expert(?:ise)?|strong|solid|deep|demonstrated|proven)\b/gi;
const QUALIFYING_WORDING =
  /\b(?:experience (?:with|in|using|developing|building)|knowledge of|skills? (?:in|with)|hands-on|background in|years)\b/i;
const RESPONSIBILITY_START =
  /^(?:you will |you'll |will |the (?:developer|engineer|candidate) will )?(?:write|writes|writing|develop|develops|developing|design|designs|designing|build|builds|building|maintain|maintains|maintaining|test|tests|testing|debug|debugs|debugging|implement|implements|implementing|participate|participates|participating|collaborate|collaborates|support|supports|supporting|create|creates|gather|gathers|gathering|analyze|analyzes|document|documents|documenting|train|trains|training|troubleshoot|troubleshoots|lead|leads|own|owns|deliver|delivers|ensure|ensures|perform|performs|provide|provides|review|reviews|deploy|deploys|monitor|monitors|modify|modifies|code|codes|prepare|prepares|produce|produces|contribute|contributes|resolve|resolves|integrate|integrates|migrate|migrates|optimize|optimizes|automate|automates)\b/i;

/** Distance from a mention to the nearest match of a wording pattern in the same segment. */
function nearest(
  regex: RegExp,
  sentence: string,
  offset: number,
  from: number,
  to: number,
): number {
  let best = Infinity;
  regex.lastIndex = 0;
  for (const m of sentence.matchAll(regex)) {
    const a = offset + m.index;
    const b = a + m[0].length;
    const d = b <= from ? from - b : a >= to ? a - to : 0;
    if (d < best) best = d;
  }
  return best;
}

function mentionLevel(
  text: string,
  segment: Segment,
  from: number,
  to: number,
  section: PostingSection,
  structured: boolean,
): RequirementLevel {
  const sentence = text.slice(segment.start, segment.end);
  // The wording closest to the mention decides ("C# required; Docker is a plus").
  const wording = (
    [
      ['preferred', nearest(PREFERRED_WORDING, sentence, segment.start, from, to)],
      ['familiarity', nearest(FAMILIARITY_WORDING, sentence, segment.start, from, to)],
      ['required', nearest(REQUIRED_WORDING, sentence, segment.start, from, to)],
    ] as const
  )
    .filter(([, d]) => d < Infinity)
    .sort((a, b) => a[1] - b[1])[0]?.[0];
  if (wording === 'preferred' || wording === 'familiarity') return wording;
  if (wording === 'required') return section === 'preferred' ? 'preferred' : 'required';
  if (section === 'required') return 'required';
  if (section === 'preferred') return 'preferred';
  if (section === 'responsibilities') return 'responsibility';
  const line = sentence.replace(/\s+/g, ' ').trim().replace(BULLET, '');
  if (RESPONSIBILITY_START.test(line)) return 'responsibility';
  if (QUALIFYING_WORDING.test(sentence)) return section === 'other' ? 'mentioned' : 'required';
  if (section === 'other') return 'mentioned';
  return structured ? 'mentioned' : 'uncertain';
}

/* ---------------------------------------------------------------- Alternatives */

/** Text allowed between members of a list: commas, slashes, "or", "and/or" (and "and" in examples). */
const LIST_GAP = /^[\s,/()]*(?:(?:or|and\/or|and)\s+)?[\s(]*$/i;
const OR_GAP = /(?:^|[\s,])(?:or|and\/or)\s|\//i;
const EXAMPLE_MARKER =
  /(?:\be\.?\s?g\.?|\bsuch as|\bfor example|\bfor instance|\blike|\bincluding|\bvia)\s*[:,]?\s*\(?\s*$/i;

function alternativeGroups(
  text: string,
  segments: readonly Segment[],
  taken: readonly Candidate[],
  levels: readonly RequirementLevel[],
): { groups: AlternativeGroup[]; grouped: Map<number, string> } {
  const groups: AlternativeGroup[] = [];
  const grouped = new Map<number, string>();
  let i = 0;
  while (i < taken.length) {
    const first = taken[i]!;
    const segment = segmentAt(segments, first.start);
    // Extend a run of mentions separated only by list punctuation.
    let j = i;
    let hasOr = false;
    while (j + 1 < taken.length) {
      const next = taken[j + 1]!;
      if (segmentAt(segments, next.start).start !== segment.start) break;
      const gap = text.slice(taken[j]!.end, next.start);
      if (gap.length > 12 || !LIST_GAP.test(gap)) break;
      if (OR_GAP.test(gap)) hasOr = true;
      j++;
    }
    const before = text.slice(Math.max(segment.start, first.start - 30), first.start);
    const examples = EXAMPLE_MARKER.test(before);
    const members = taken.slice(i, j + 1);
    const ids = [...new Set(members.map((m) => m.matcher.term.id))];
    if (ids.length >= 2 && (hasOr || examples)) {
      const id = `alt-${groups.length + 1}`;
      // The broader requirement: a term mentioned just before the example marker.
      const parent = examples
        ? taken
            .slice(0, i)
            .reverse()
            .find(
              (t) =>
                segmentAt(segments, t.start).start === segment.start && first.start - t.end < 40,
            )
        : undefined;
      const level = levels[i] ?? 'uncertain';
      groups.push({
        id,
        kind: examples ? 'examples' : 'or',
        termIds: ids,
        level: level === 'alternative' ? 'uncertain' : level,
        ...(parent ? { parentTermId: parent.matcher.term.id } : {}),
        evidence: evidenceText(text, segment, first.start, members[members.length - 1]!.end),
      });
      for (let k = i; k <= j; k++) grouped.set(k, id);
    }
    i = j + 1;
  }
  return { groups, grouped };
}

/* ---------------------------------------------------------------- Qualifications */

const QUALIFICATION_PATTERNS: readonly (readonly [QualificationKind, RegExp])[] = [
  [
    'education',
    /\b(?:degree|bachelor'?s?|master'?s|ph\.?d|B\.S\.|B\.A\.|BS\/BA|diploma|certification|certified)\b/i,
  ],
  [
    'eligibility',
    /\b(?:citizen(?:ship)?|authori[sz]ed to work|work authori[sz]ation|sponsorship|visa|security clearance|clearance|background check|reside|residen(?:t|cy)|relocat(?:e|ion)|on-?site|hybrid|remote)\b/i,
  ],
  [
    'communication',
    /\b(?:communication skills|communicat(?:e|ion)|written and verbal|verbal and written|interpersonal|teamwork|team player|collaborat(?:e|ion|ive)|work(?:s)? well with others)\b/i,
  ],
];
const MAX_QUALIFICATIONS = 12;

function qualificationsOf(text: string, segments: readonly Segment[]): Qualification[] {
  const found: Qualification[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const sentence = text.slice(segment.start, segment.end);
    // A heading ("Benefits:", "Collaboration:") is not a qualification.
    if (headingSection(sentence) !== undefined) continue;
    for (const [kind, regex] of QUALIFICATION_PATTERNS) {
      const m = regex.exec(sentence);
      if (!m) continue;
      const at = segment.start + m.index;
      const snippet = evidenceText(text, segment, at, at + m[0].length);
      if (snippet.length < 4 || seen.has(snippet)) break;
      seen.add(snippet);
      found.push({ kind, text: snippet });
      break;
    }
    if (found.length >= MAX_QUALIFICATIONS) break;
  }
  return found;
}

/* ---------------------------------------------------------------- Paths */

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
