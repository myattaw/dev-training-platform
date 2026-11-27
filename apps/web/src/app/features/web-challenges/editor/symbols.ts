/*
 * The classes, annotations and modules the web challenges use, with where they
 * come from, for autocomplete with automatic imports, for the live check of
 * unknown names (Java) and for "did you mean" hints on build errors.
 *
 * A fixed list (no language server, free and instant): it covers what the
 * challenges' projects need and the common standard library, not everything
 * on the class path. Members are the static ones you reach through the name
 * (`ResponseEntity.ok`), or a module's (`status.HTTP_404_NOT_FOUND`).
 */

export type ProjectLanguage = 'java' | 'csharp' | 'python';

export type SymbolKind =
  'class' | 'interface' | 'enum' | 'annotation' | 'function' | 'module' | 'constant';

export interface SymbolMember {
  readonly name: string;
  /** A method (`ok()` in the list), or a field / constant. */
  readonly method: boolean;
}

export interface SymbolEntry {
  readonly name: string;
  /** Java package, C# namespace or Python module it is imported from. */
  readonly module: string;
  readonly kind: SymbolKind;
  readonly members: readonly SymbolMember[];
  /** Python: imported with `import <name>` rather than `from <module> import <name>`. */
  readonly plainImport?: boolean;
}

/** `"ok() notFound() OK"` → members; names with `()` are methods. */
function members(list: string): SymbolMember[] {
  return list
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => ({ name: m.replace(/\(\)$/, ''), method: m.endsWith('()') }));
}

/** Several names from one module, with the members of each (by name). */
function from(
  module: string,
  kind: SymbolKind,
  names: string,
  memberLists: Readonly<Record<string, string>> = {},
): SymbolEntry[] {
  return names
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => ({ name, module, kind, members: members(memberLists[name] ?? '') }));
}

const JAVA: readonly SymbolEntry[] = [
  ...from('java.util', 'interface', 'List Map Set Collection Iterator Deque Queue', {
    List: 'of() copyOf()',
    Map: 'of() entry() copyOf() ofEntries()',
    Set: 'of() copyOf()',
  }),
  ...from(
    'java.util',
    'class',
    'ArrayList LinkedList HashMap LinkedHashMap TreeMap HashSet LinkedHashSet TreeSet ArrayDeque Optional Collections Arrays Objects UUID Locale Base64 Random Comparator',
    {
      Optional: 'of() ofNullable() empty()',
      Collections:
        'emptyList() emptyMap() unmodifiableList() unmodifiableMap() sort() reverse() max() min()',
      Arrays: 'asList() stream() sort() copyOf() fill() toString()',
      Objects:
        'equals() hash() requireNonNull() isNull() nonNull() toString() requireNonNullElse()',
      UUID: 'randomUUID() fromString() nameUUIDFromBytes()',
      Locale: 'ROOT ENGLISH US',
      Base64: 'getEncoder() getDecoder() getUrlEncoder()',
      Comparator:
        'comparing() comparingInt() comparingLong() comparingDouble() naturalOrder() reverseOrder() nullsFirst() nullsLast()',
    },
  ),
  ...from('java.util.stream', 'class', 'Collectors Stream IntStream', {
    Collectors:
      'toList() toSet() toMap() groupingBy() joining() counting() summingInt() partitioningBy() mapping()',
    Stream: 'of() concat() empty() iterate()',
    IntStream: 'range() rangeClosed() of()',
  }),
  ...from('java.util.function', 'interface', 'Function BiFunction Supplier Consumer Predicate'),
  ...from('java.util.regex', 'class', 'Pattern Matcher', {
    Pattern: 'compile() matches() quote() CASE_INSENSITIVE',
  }),
  ...from('java.util.concurrent', 'class', 'ConcurrentHashMap'),
  ...from('java.util.concurrent.atomic', 'class', 'AtomicLong AtomicInteger'),
  ...from('java.math', 'class', 'BigDecimal BigInteger', {
    BigDecimal: 'valueOf() ZERO ONE TEN',
    BigInteger: 'valueOf() ZERO ONE TEN',
  }),
  ...from('java.math', 'enum', 'RoundingMode', {
    RoundingMode: 'HALF_UP HALF_EVEN HALF_DOWN UP DOWN CEILING FLOOR',
  }),
  ...from(
    'java.time',
    'class',
    'LocalDate LocalDateTime LocalTime Instant Duration Clock ZoneOffset',
    {
      LocalDate: 'now() of() parse() MIN MAX',
      LocalDateTime: 'now() of() parse()',
      LocalTime: 'now() of() parse()',
      Instant: 'now() parse() ofEpochMilli() ofEpochSecond() EPOCH',
      Duration: 'ofSeconds() ofMinutes() ofHours() ofDays() ofMillis() between() ZERO',
      Clock: 'systemUTC() systemDefaultZone() fixed()',
      ZoneOffset: 'UTC',
    },
  ),
  ...from('java.time.format', 'class', 'DateTimeFormatter DateTimeParseException', {
    DateTimeFormatter: 'ofPattern() ISO_LOCAL_DATE ISO_LOCAL_DATE_TIME ISO_INSTANT',
  }),
  ...from('java.net', 'class', 'URI', { URI: 'create()' }),
  ...from(
    'org.springframework.http',
    'class',
    'ResponseEntity HttpHeaders MediaType ProblemDetail',
    {
      ResponseEntity:
        'ok() notFound() badRequest() status() created() noContent() accepted() unprocessableEntity() internalServerError() of() ofNullable()',
      HttpHeaders: 'LOCATION CONTENT_TYPE AUTHORIZATION ACCEPT',
      MediaType: 'APPLICATION_JSON APPLICATION_JSON_VALUE TEXT_PLAIN APPLICATION_PROBLEM_JSON',
      ProblemDetail: 'forStatus() forStatusAndDetail()',
    },
  ),
  ...from('org.springframework.http', 'enum', 'HttpStatus', {
    HttpStatus:
      'OK CREATED ACCEPTED NO_CONTENT BAD_REQUEST UNAUTHORIZED FORBIDDEN NOT_FOUND CONFLICT UNPROCESSABLE_ENTITY TOO_MANY_REQUESTS INTERNAL_SERVER_ERROR valueOf()',
  }),
  ...from('org.springframework.http.converter', 'class', 'HttpMessageNotReadableException'),
  ...from(
    'org.springframework.web.bind.annotation',
    'annotation',
    'RestController RequestMapping GetMapping PostMapping PutMapping PatchMapping DeleteMapping PathVariable RequestParam RequestBody RequestHeader RequestAttribute ResponseStatus ResponseBody ExceptionHandler RestControllerAdvice ControllerAdvice CrossOrigin',
  ),
  ...from('org.springframework.web.bind', 'class', 'MethodArgumentNotValidException'),
  ...from('org.springframework.web', 'interface', 'ErrorResponse'),
  ...from('org.springframework.web.server', 'class', 'ResponseStatusException'),
  ...from('org.springframework.web.servlet', 'interface', 'HandlerInterceptor'),
  ...from('org.springframework.web.servlet.config.annotation', 'interface', 'WebMvcConfigurer'),
  ...from('org.springframework.web.servlet.config.annotation', 'class', 'InterceptorRegistry'),
  ...from(
    'org.springframework.stereotype',
    'annotation',
    'Service Component Repository Controller',
  ),
  ...from('org.springframework.context.annotation', 'annotation', 'Bean Configuration Primary'),
  ...from(
    'org.springframework.beans.factory.annotation',
    'annotation',
    'Autowired Value Qualifier',
  ),
  ...from('org.springframework.beans.factory', 'interface', 'ObjectProvider'),
  ...from('org.springframework.boot', 'class', 'SpringApplication', { SpringApplication: 'run()' }),
  ...from('org.springframework.boot.autoconfigure', 'annotation', 'SpringBootApplication'),
  ...from('org.slf4j', 'interface', 'Logger'),
  ...from('org.slf4j', 'class', 'LoggerFactory', { LoggerFactory: 'getLogger()' }),
  ...from('jakarta.servlet.http', 'interface', 'HttpServletRequest HttpServletResponse'),
];

/**
 * java.lang: visible without an import. Used by the unknown-name check, and offered
 * as plain suggestions (no import added).
 */
export const JAVA_LANG = new Set(
  `Object String StringBuilder StringBuffer CharSequence Integer Long Double Float Short Byte
  Boolean Character Number Math StrictMath System Thread Runnable Iterable Comparable
  AutoCloseable Cloneable Class Enum Record Void Process ProcessBuilder Runtime ThreadLocal
  Throwable Exception Error RuntimeException IllegalArgumentException IllegalStateException
  NullPointerException UnsupportedOperationException IndexOutOfBoundsException
  ArrayIndexOutOfBoundsException StringIndexOutOfBoundsException ArithmeticException
  NumberFormatException ClassCastException InterruptedException CloneNotSupportedException
  ReflectiveOperationException ClassNotFoundException SecurityException AssertionError
  StackOverflowError OutOfMemoryError Override Deprecated SuppressWarnings FunctionalInterface
  SafeVarargs`.split(/\s+/),
);

/** Namespaces a `Microsoft.NET.Sdk.Web` project imports implicitly (ImplicitUsings). */
export const CSHARP_IMPLICIT = new Set([
  'System',
  'System.Collections.Generic',
  'System.IO',
  'System.Linq',
  'System.Net.Http',
  'System.Net.Http.Json',
  'System.Threading',
  'System.Threading.Tasks',
  'Microsoft.AspNetCore.Builder',
  'Microsoft.AspNetCore.Hosting',
  'Microsoft.AspNetCore.Http',
  'Microsoft.AspNetCore.Routing',
  'Microsoft.Extensions.Configuration',
  'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Hosting',
  'Microsoft.Extensions.Logging',
]);

const CSHARP: readonly SymbolEntry[] = [
  ...from(
    'Microsoft.AspNetCore.Mvc',
    'class',
    'ControllerBase ProblemDetails ValidationProblemDetails ObjectResult',
  ),
  ...from('Microsoft.AspNetCore.Mvc', 'interface', 'IActionResult'),
  ...from('Microsoft.AspNetCore.Mvc', 'class', 'ActionResult'),
  ...from(
    'Microsoft.AspNetCore.Mvc',
    'annotation',
    'ApiController Route HttpGet HttpPost HttpPut HttpPatch HttpDelete FromBody FromRoute FromQuery FromHeader ProducesResponseType',
  ),
  ...from('Microsoft.AspNetCore.Http', 'class', 'Results TypedResults StatusCodes HttpContext', {
    Results:
      'Ok() NotFound() BadRequest() Created() NoContent() Conflict() Problem() ValidationProblem() StatusCode() Json() Unauthorized() Forbid()',
    TypedResults: 'Ok() NotFound() BadRequest() Created() NoContent() Conflict() Problem()',
    StatusCodes:
      'Status200OK Status201Created Status204NoContent Status400BadRequest Status401Unauthorized Status403Forbidden Status404NotFound Status409Conflict Status422UnprocessableEntity Status429TooManyRequests Status500InternalServerError',
  }),
  ...from('Microsoft.AspNetCore.Http', 'interface', 'IResult'),
  ...from(
    'Microsoft.AspNetCore.Diagnostics',
    'interface',
    'IExceptionHandler IExceptionHandlerFeature IExceptionHandlerPathFeature',
  ),
  ...from('Microsoft.Extensions.DependencyInjection', 'interface', 'IServiceCollection'),
  ...from('Microsoft.Extensions.Logging', 'interface', 'ILogger'),
  ...from(
    'System',
    'class',
    'DateTime DateOnly DateTimeOffset TimeSpan Guid Math Convert Exception ArgumentException ArgumentNullException InvalidOperationException',
    {
      DateTime: 'Now UtcNow Today Parse() TryParse()',
      DateOnly: 'Parse() TryParse() FromDateTime()',
      DateTimeOffset: 'Now UtcNow Parse()',
      TimeSpan: 'FromSeconds() FromMinutes() FromHours() FromDays() Zero',
      Guid: 'NewGuid() Parse() TryParse() Empty',
      Math: 'Round() Max() Min() Abs() Floor() Ceiling() Pow() Sqrt() Clamp()',
      Convert: 'ToInt32() ToDecimal() ToString() ToBase64String() FromBase64String()',
    },
  ),
  ...from(
    'System.Collections.Generic',
    'class',
    'List Dictionary HashSet KeyValuePair KeyNotFoundException',
  ),
  ...from(
    'System.Collections.Generic',
    'interface',
    'IEnumerable IList IReadOnlyList IReadOnlyCollection IDictionary IReadOnlyDictionary',
  ),
  ...from('System.Collections.Concurrent', 'class', 'ConcurrentDictionary'),
  ...from('System.Linq', 'class', 'Enumerable', { Enumerable: 'Range() Repeat() Empty()' }),
  ...from('System.Globalization', 'class', 'CultureInfo', {
    CultureInfo: 'InvariantCulture CurrentCulture',
  }),
  ...from('System.Globalization', 'enum', 'NumberStyles DateTimeStyles'),
  ...from('System.Text.RegularExpressions', 'class', 'Regex Match', {
    Regex: 'IsMatch() Match() Replace() Split() Escape()',
  }),
  ...from('System.Text.RegularExpressions', 'enum', 'RegexOptions', {
    RegexOptions: 'IgnoreCase Compiled CultureInvariant None',
  }),
  ...from('System.Text.Json', 'class', 'JsonSerializer', {
    JsonSerializer: 'Serialize() Deserialize()',
  }),
  ...from('System.Text.Json.Serialization', 'annotation', 'JsonPropertyName JsonIgnore'),
  ...from(
    'System.Security.Cryptography',
    'class',
    'RandomNumberGenerator SHA256 Rfc2898DeriveBytes CryptographicOperations',
    {
      RandomNumberGenerator: 'GetBytes() GetInt32()',
      SHA256: 'HashData()',
      Rfc2898DeriveBytes: 'Pbkdf2()',
      CryptographicOperations: 'FixedTimeEquals()',
    },
  ),
  ...from(
    'System.ComponentModel.DataAnnotations',
    'annotation',
    'Required Range StringLength EmailAddress MaxLength MinLength',
  ),
];

/** `ControllerBase` methods: called without a qualifier inside a controller. */
export const CSHARP_CONTROLLER_METHODS = members(
  'Ok() NotFound() BadRequest() Created() CreatedAtAction() NoContent() Conflict() StatusCode() Problem() ValidationProblem() Unauthorized() Forbid() UnprocessableEntity() Accepted()',
);

const PYTHON: readonly SymbolEntry[] = [
  ...from('rest_framework.views', 'class', 'APIView'),
  ...from('rest_framework.views', 'function', 'exception_handler'),
  ...from('rest_framework.response', 'class', 'Response'),
  ...from('rest_framework', 'module', 'status serializers exceptions', {
    status:
      'HTTP_200_OK HTTP_201_CREATED HTTP_204_NO_CONTENT HTTP_400_BAD_REQUEST HTTP_401_UNAUTHORIZED HTTP_403_FORBIDDEN HTTP_404_NOT_FOUND HTTP_409_CONFLICT HTTP_422_UNPROCESSABLE_ENTITY HTTP_429_TOO_MANY_REQUESTS HTTP_500_INTERNAL_SERVER_ERROR HTTP_501_NOT_IMPLEMENTED',
    serializers:
      'Serializer() ModelSerializer() CharField() IntegerField() DecimalField() EmailField() BooleanField() DateField() DateTimeField() ListField() DictField() ChoiceField() SerializerMethodField() ValidationError()',
    exceptions:
      'ValidationError() NotFound() PermissionDenied() AuthenticationFailed() NotAuthenticated() APIException()',
  }),
  ...from('rest_framework.permissions', 'class', 'AllowAny IsAuthenticated BasePermission'),
  ...from('rest_framework.authentication', 'class', 'BaseAuthentication'),
  ...from(
    'rest_framework.exceptions',
    'class',
    'ValidationError NotFound PermissionDenied AuthenticationFailed NotAuthenticated APIException',
  ),
  ...from('rest_framework.decorators', 'function', 'api_view'),
  ...from('django.db', 'module', 'models transaction', {
    models:
      'Model() CharField() TextField() IntegerField() PositiveIntegerField() DecimalField() BooleanField() DateField() DateTimeField() EmailField() ForeignKey() CASCADE PROTECT SET_NULL Q() F() Sum() Count() Max() Min() Avg() UniqueConstraint()',
    transaction: 'atomic()',
  }),
  ...from('django.db', 'class', 'IntegrityError'),
  ...from('django.db.models', 'class', 'F Q Sum Count'),
  ...from('django.http', 'class', 'Http404 JsonResponse HttpResponse'),
  ...from('django.shortcuts', 'function', 'get_object_or_404'),
  ...from('django.urls', 'function', 'path include'),
  ...from('django.core.paginator', 'class', 'Paginator EmptyPage PageNotAnInteger'),
  ...from('decimal', 'class', 'Decimal InvalidOperation'),
  ...from('decimal', 'constant', 'ROUND_HALF_UP ROUND_HALF_EVEN'),
  ...from('datetime', 'class', 'date datetime timedelta timezone'),
  ...from('dataclasses', 'function', 'dataclass field'),
  ...from('typing', 'class', 'Optional Any'),
  ...['re', 'json', 'logging', 'uuid'].map((name): SymbolEntry => ({
    name,
    module: name,
    kind: 'module',
    plainImport: true,
    members: members(
      {
        re: 'compile() match() fullmatch() search() sub() findall() split() IGNORECASE',
        json: 'dumps() loads()',
        logging: 'getLogger() INFO WARNING ERROR',
        uuid: 'uuid4() UUID()',
      }[name] ?? '',
    ),
  })),
];

export const SYMBOLS: Readonly<Record<ProjectLanguage, readonly SymbolEntry[]>> = {
  java: JAVA,
  csharp: CSHARP,
  python: PYTHON,
};

/** The entries with this simple name (a name can exist in more than one module). */
export function symbolsNamed(language: ProjectLanguage, name: string): SymbolEntry[] {
  return SYMBOLS[language].filter((s) => s.name === name);
}
