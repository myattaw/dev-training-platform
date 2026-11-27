import type * as Monaco from 'monaco-editor';

type MonacoApi = typeof Monaco;

/*
 * Suggestions while typing C# and Java: keywords, the standard types used in
 * the challenges, and common members after a dot. A fixed list, in the
 * browser (free and instant): it is not the compiler, so it does not know a
 * variable's type and offers the common members of every type after a dot.
 * Monaco adds the words already in the file (your own variables and methods).
 */

export interface LanguageWords {
  readonly keywords: readonly string[];
  readonly types: readonly string[];
  readonly members: readonly string[];
  readonly snippets: readonly { label: string; body: string; detail: string }[];
}

const CSHARP: LanguageWords = {
  keywords:
    `abstract as async await base bool break byte case catch char checked class const continue
    decimal default delegate do double else enum event explicit false finally float for foreach
    goto if implicit in init int interface internal is lock long namespace new null object
    operator out override params private protected public readonly record ref return sealed short
    static string struct switch this throw true try typeof uint ulong using var virtual void
    when while yield nameof`.split(/\s+/),
  types: `Console Math String StringBuilder StringComparison StringComparer Char Int32 Int64 Double
    Decimal Boolean DateTime DateOnly TimeSpan Guid Array List Dictionary HashSet SortedSet
    SortedDictionary SortedList Queue Stack LinkedList PriorityQueue KeyValuePair Tuple ValueTuple
    Enumerable IEnumerable IList ICollection IDictionary ISet IReadOnlyList IReadOnlyCollection
    IReadOnlyDictionary IComparer IEqualityComparer Comparer EqualityComparer Func Action Predicate
    Exception ArgumentException ArgumentNullException ArgumentOutOfRangeException
    InvalidOperationException NotImplementedException NotSupportedException KeyNotFoundException
    FormatException Span ReadOnlySpan Memory Regex Task Lazy Nullable Random Convert Environment
    CultureInfo Results`.split(/\s+/),
  members:
    `Add AddRange Remove RemoveAt RemoveAll Clear Contains ContainsKey ContainsValue TryGetValue
    TryAdd GetValueOrDefault Count Length Keys Values IndexOf LastIndexOf Insert Sort Reverse
    BinarySearch ToArray ToList ToDictionary ToHashSet ToLower ToUpper ToLowerInvariant
    ToUpperInvariant Trim TrimStart TrimEnd Split Substring Replace StartsWith EndsWith PadLeft
    PadRight Join Concat Format IsNullOrEmpty IsNullOrWhiteSpace IsLetter IsDigit IsLetterOrDigit
    IsWhiteSpace IsUpper IsLower Equals GetHashCode ToString CompareTo Push Pop Peek Enqueue
    Dequeue TryPeek TryDequeue TryPop EnqueueRange Append AppendLine Where Select SelectMany
    OrderBy OrderByDescending ThenBy ThenByDescending GroupBy Distinct DistinctBy Any All First
    FirstOrDefault Last LastOrDefault Single SingleOrDefault Sum Min Max MinBy MaxBy Average
    Aggregate Skip Take TakeWhile SkipWhile Zip Chunk Range Repeat Empty Abs Floor Ceiling Round
    Pow Sqrt Clamp WriteLine Write ReadLine Parse TryParse Key Value Item1 Item2 Message
    AddFirst AddLast RemoveFirst RemoveLast UnionWith IntersectWith ExceptWith SetEquals
    IsSubsetOf IsSupersetOf Overlaps`.split(/\s+/),
  snippets: [
    {
      label: 'for',
      body: 'for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++)\n{\n\t$0\n}',
      detail: 'for loop',
    },
    {
      label: 'foreach',
      body: 'foreach (var ${1:item} in ${2:items})\n{\n\t$0\n}',
      detail: 'foreach loop',
    },
    { label: 'if', body: 'if (${1:condition})\n{\n\t$0\n}', detail: 'if statement' },
    { label: 'while', body: 'while (${1:condition})\n{\n\t$0\n}', detail: 'while loop' },
    { label: 'cw', body: 'Console.WriteLine($0);', detail: 'Console.WriteLine' },
  ],
};

const JAVA: LanguageWords = {
  keywords: `abstract boolean break byte case catch char class continue default do double else enum
    extends final finally float for if implements import instanceof int interface long new null
    private protected public record return short static super switch this throw throws true
    false try var void while yield`.split(/\s+/),
  types: `String StringBuilder Character Integer Long Double Boolean Math Object System Arrays
    Collections List ArrayList LinkedList Map HashMap TreeMap LinkedHashMap Set HashSet TreeSet
    LinkedHashSet Queue Deque ArrayDeque PriorityQueue Stack Iterator Optional Stream
    Collectors IntStream Comparator Objects Function BiFunction Predicate Supplier Consumer
    Exception RuntimeException IllegalArgumentException IllegalStateException
    UnsupportedOperationException NullPointerException IndexOutOfBoundsException`.split(/\s+/),
  members: `add addAll remove removeIf contains containsKey containsValue get getOrDefault put
    putIfAbsent merge computeIfAbsent size isEmpty clear length charAt substring indexOf
    lastIndexOf toLowerCase toUpperCase trim strip split equals equalsIgnoreCase hashCode
    toString append insert reverse push pop peek offer poll offerFirst offerLast pollFirst
    pollLast peekFirst peekLast keySet values entrySet getKey getValue stream map filter
    collect forEach sorted distinct count reduce toList toArray anyMatch allMatch noneMatch
    findFirst orElse sort asList of copyOf fill toCharArray chars valueOf parseInt max min abs
    pow sqrt floor ceil isLetter isDigit isLetterOrDigit isWhitespace isUpperCase isLowerCase
    println print format join repeat isBlank startsWith endsWith replace compareTo
    getMessage`.split(/\s+/),
  snippets: [
    {
      label: 'for',
      body: 'for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$0\n}',
      detail: 'for loop',
    },
    {
      label: 'foreach',
      body: 'for (${1:var} ${2:item} : ${3:items}) {\n\t$0\n}',
      detail: 'enhanced for loop',
    },
    { label: 'if', body: 'if (${1:condition}) {\n\t$0\n}', detail: 'if statement' },
    { label: 'while', body: 'while (${1:condition}) {\n\t$0\n}', detail: 'while loop' },
    { label: 'sout', body: 'System.out.println($0);', detail: 'System.out.println' },
  ],
};

/** The word lists, also used by the web-challenge project editor's own suggestions. */
export const BASIC_WORDS: Readonly<Record<'csharp' | 'java', LanguageWords>> = {
  csharp: CSHARP,
  java: JAVA,
};

/**
 * Models of a multi-file web-challenge project: they get the project editor's
 * suggestions (with automatic imports) instead of these.
 */
export const projectModels = new WeakSet<Monaco.editor.ITextModel>();

let registered = false;

/** Registers the C# and Java suggestions once per page. */
export function registerCompletions(monaco: MonacoApi): void {
  if (registered) return;
  registered = true;
  for (const [id, words] of [
    ['csharp', CSHARP],
    ['java', JAVA],
  ] as const) {
    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: ['.'],
      provideCompletionItems(model, position) {
        if (projectModels.has(model)) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const before = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: word.startColumn,
        });
        const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages;
        if (/\.\s*$/.test(before)) {
          return {
            suggestions: words.members.map((label) => ({
              label,
              kind: Kind.Method,
              insertText: label,
              range,
            })),
          };
        }
        return {
          suggestions: [
            ...words.types.map((label) => ({ label, kind: Kind.Class, insertText: label, range })),
            ...words.keywords.map((label) => ({
              label,
              kind: Kind.Keyword,
              insertText: label,
              range,
            })),
            ...words.snippets.map((s) => ({
              label: s.label,
              kind: Kind.Snippet,
              detail: s.detail,
              insertText: s.body,
              insertTextRules: Rule.InsertAsSnippet,
              range,
            })),
          ],
        };
      },
    });
  }
}
