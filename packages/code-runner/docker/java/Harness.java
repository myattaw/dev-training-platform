import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Java runner harness. Runs INSIDE an isolated container (see docs/runners.md).
 *
 * stdin:  RunnerInput JSON (code + test inputs; never expected values)
 * stdout: "\n<nonce><RunnerOutput JSON>\n"
 *
 * The learner's source is compiled in-process with the JDK compiler API, loaded
 * with its own class loader, and called by reflection. Return values are encoded
 * like the TypeScript runner's (see challenge-runtime/src/values.ts).
 */
public final class Harness {
  private static final PrintStream REAL_OUT = System.out;
  private static final Path WORK = Path.of("/tmp/work");
  private static final Path OUT = Path.of("/tmp/out");
  private static final Pattern PUBLIC_CLASS = Pattern.compile("(?m)^\\s*public\\s+(?:final\\s+|abstract\\s+)*class\\s+(\\w+)");

  public static void main(String[] args) throws Exception {
    Map<String, Object> input = asMap(Json.parse(new String(System.in.readAllBytes(), StandardCharsets.UTF_8)));
    String nonce = (String) input.get("nonce");
    int maxLogLines = ((Number) input.get("maxLogLines")).intValue();

    LogCapture logs = new LogCapture(maxLogLines);
    PrintStream capture = new PrintStream(logs, true, StandardCharsets.UTF_8);
    System.setOut(capture);
    System.setErr(capture);

    Map<String, Object> output;
    try {
      output = run(input, logs);
    } catch (Throwable t) {
      output = new LinkedHashMap<>();
      output.put("kind", "load-error");
      output.put("message", "The runner failed: " + describe(t));
      output.put("logs", logs.lines());
    }
    REAL_OUT.print("\n" + nonce + Json.stringify(output) + "\n");
    REAL_OUT.flush();
    // Stop any threads the submission started.
    Runtime.getRuntime().halt(0);
  }

  private static Map<String, Object> run(Map<String, Object> input, LogCapture logs) throws Exception {
    String code = (String) input.get("code");
    String entryPoint = (String) input.get("entryPoint");
    List<Object> tests = asList(input.get("tests"));

    Matcher publicClass = PUBLIC_CLASS.matcher(code);
    String fileName = (publicClass.find() ? publicClass.group(1) : "Submission") + ".java";
    Files.createDirectories(WORK);
    Files.createDirectories(OUT);
    Path source = WORK.resolve(fileName);
    Files.writeString(source, code);

    List<Object> diagnostics = compile(source);
    if (!diagnostics.isEmpty()) {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("kind", "compile-error");
      out.put("diagnostics", diagnostics);
      return out;
    }

    List<Class<?>> classes = loadClasses();
    boolean operations = tests.stream().anyMatch(t -> "operations".equals(asMap(t).get("kind")));
    Map<String, Object> out = new LinkedHashMap<>();
    List<Object> outcomes = new ArrayList<>();

    if (operations) {
      Class<?> cls = classes.stream().filter(c -> c.getSimpleName().equals(entryPoint)).findFirst().orElse(null);
      if (cls == null) return loadError("Expected your code to declare a class named \"" + entryPoint + "\".", logs);
      for (Object t : tests) outcomes.add(runOperations(cls, entryPoint, asMap(t)));
    } else {
      Method method = findStaticMethod(classes, entryPoint);
      if (method == null) {
        return loadError("Expected your code to declare a static method named \"" + entryPoint + "\".", logs);
      }
      for (Object t : tests) outcomes.add(runCall(method, asMap(t)));
    }
    out.put("kind", "completed");
    out.put("outcomes", outcomes);
    out.put("logs", logs.lines());
    return out;
  }

  private static List<Object> compile(Path source) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    DiagnosticCollector<JavaFileObject> collector = new DiagnosticCollector<>();
    try (StandardJavaFileManager files = compiler.getStandardFileManager(collector, Locale.ENGLISH, StandardCharsets.UTF_8)) {
      List<String> options = List.of("-d", OUT.toString(), "-encoding", "UTF-8", "-proc:none", "-Xlint:none", "-nowarn");
      compiler.getTask(null, files, collector, options, null, files.getJavaFileObjects(source.toFile())).call();
    }
    List<Object> errors = new ArrayList<>();
    for (Diagnostic<? extends JavaFileObject> d : collector.getDiagnostics()) {
      if (d.getKind() != Diagnostic.Kind.ERROR || errors.size() >= 50) continue;
      Map<String, Object> e = new LinkedHashMap<>();
      e.put("line", Math.max(1, d.getLineNumber()));
      e.put("column", Math.max(1, d.getColumnNumber()));
      e.put("message", d.getMessage(Locale.ENGLISH));
      errors.add(e);
    }
    return errors;
  }

  private static List<Class<?>> loadClasses() throws Exception {
    URLClassLoader loader = new URLClassLoader(new URL[] {OUT.toUri().toURL()}, Harness.class.getClassLoader());
    List<Class<?>> classes = new ArrayList<>();
    try (var paths = Files.walk(OUT)) {
      for (Path p : (Iterable<Path>) paths::iterator) {
        String name = OUT.relativize(p).toString();
        if (!name.endsWith(".class")) continue;
        String className = name.substring(0, name.length() - 6).replace('/', '.');
        classes.add(Class.forName(className, false, loader));
      }
    }
    return classes;
  }

  private static Method findStaticMethod(List<Class<?>> classes, String name) {
    Method found = null;
    for (Class<?> c : classes) {
      for (Method m : c.getDeclaredMethods()) {
        if (m.getName().equals(name) && Modifier.isStatic(m.getModifiers())) {
          // Prefer a class called Solution when several declare the method.
          if (found == null || c.getSimpleName().equals("Solution")) found = m;
        }
      }
    }
    if (found != null) found.setAccessible(true);
    return found;
  }

  private static Map<String, Object> runCall(Method method, Map<String, Object> test) {
    Map<String, Object> outcome = new LinkedHashMap<>();
    outcome.put("kind", "call");
    try {
      Object[] args = convertArgs(asList(test.get("input")), method.getGenericParameterTypes());
      Object result = method.invoke(null, args);
      outcome.put("value", method.getReturnType() == void.class ? Encoded.UNDEFINED : encode(result));
    } catch (Throwable t) {
      outcome.put("error", describe(unwrap(t)));
    }
    return outcome;
  }

  private static Map<String, Object> runOperations(Class<?> cls, String entryPoint, Map<String, Object> test) {
    Map<String, Object> outcome = new LinkedHashMap<>();
    outcome.put("kind", "operations");
    List<Object> values = new ArrayList<>();
    outcome.put("values", values);

    Object instance;
    try {
      List<Object> ctorArgs = asList(test.get("constructorArgs"));
      Constructor<?> ctor = findConstructor(cls, ctorArgs.size());
      if (ctor == null) throw new IllegalArgumentException(entryPoint + " has no constructor with " + ctorArgs.size() + " parameter(s)");
      ctor.setAccessible(true);
      instance = ctor.newInstance(convertArgs(ctorArgs, ctor.getGenericParameterTypes()));
    } catch (Throwable t) {
      outcome.put("error", stepError(-1, describe(unwrap(t))));
      return outcome;
    }

    List<Object> steps = asList(test.get("steps"));
    for (int i = 0; i < steps.size(); i++) {
      Map<String, Object> step = asMap(steps.get(i));
      String name = (String) step.get("call");
      List<Object> args = asList(step.get("args"));
      Method method = findInstanceMethod(cls, name, args.size());
      if (method == null) {
        outcome.put("error", stepError(i, entryPoint + " has no method named \"" + name + "\""));
        return outcome;
      }
      try {
        Object result = method.invoke(instance, convertArgs(args, method.getGenericParameterTypes()));
        values.add(method.getReturnType() == void.class ? Encoded.UNDEFINED : encode(result));
      } catch (Throwable t) {
        outcome.put("error", stepError(i, describe(unwrap(t))));
        return outcome;
      }
    }
    return outcome;
  }

  private static Constructor<?> findConstructor(Class<?> cls, int arity) {
    for (Constructor<?> c : cls.getDeclaredConstructors()) if (c.getParameterCount() == arity) return c;
    return null;
  }

  private static Method findInstanceMethod(Class<?> cls, String name, int arity) {
    for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
      for (Method m : c.getDeclaredMethods()) {
        if (m.getName().equals(name) && m.getParameterCount() == arity && !Modifier.isStatic(m.getModifiers())) {
          m.setAccessible(true);
          return m;
        }
      }
    }
    return null;
  }

  private static Map<String, Object> stepError(int step, String message) {
    Map<String, Object> e = new LinkedHashMap<>();
    e.put("step", step);
    e.put("message", message);
    return e;
  }

  private static Map<String, Object> loadError(String message, LogCapture logs) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("kind", "load-error");
    out.put("message", message);
    out.put("logs", logs.lines());
    return out;
  }

  // ---------- JSON → Java argument conversion ----------

  private static Object[] convertArgs(List<Object> values, Type[] types) {
    if (values.size() != types.length) {
      throw new IllegalArgumentException("expected " + types.length + " argument(s) but the test passes " + values.size());
    }
    Object[] args = new Object[types.length];
    for (int i = 0; i < types.length; i++) args[i] = convert(values.get(i), types[i]);
    return args;
  }

  static Object convert(Object value, Type type) {
    if (type instanceof ParameterizedType p && p.getRawType() instanceof Class<?> raw && Collection.class.isAssignableFrom(raw)) {
      List<Object> list = new ArrayList<>();
      for (Object v : asList(value)) list.add(convert(v, p.getActualTypeArguments()[0]));
      return list;
    }
    if (!(type instanceof Class<?> c)) return value;
    if (value == null) {
      if (c.isPrimitive()) throw new IllegalArgumentException("null cannot be passed as " + c.getSimpleName());
      return null;
    }
    if (c == int.class || c == Integer.class) return ((Number) value).intValue();
    if (c == long.class || c == Long.class) return ((Number) value).longValue();
    if (c == double.class || c == Double.class) return ((Number) value).doubleValue();
    if (c == float.class || c == Float.class) return ((Number) value).floatValue();
    if (c == short.class || c == Short.class) return ((Number) value).shortValue();
    if (c == byte.class || c == Byte.class) return ((Number) value).byteValue();
    if (c == boolean.class || c == Boolean.class) return value;
    if (c == char.class || c == Character.class) {
      String s = (String) value;
      if (s.length() != 1) throw new IllegalArgumentException("expected a single character");
      return s.charAt(0);
    }
    if (c == String.class) return value;
    if (c.isArray()) {
      List<Object> list = asList(value);
      Object array = Array.newInstance(c.getComponentType(), list.size());
      for (int i = 0; i < list.size(); i++) Array.set(array, i, convert(list.get(i), c.getComponentType()));
      return array;
    }
    if (Collection.class.isAssignableFrom(c)) return new ArrayList<>(asList(value));
    return value;
  }

  // ---------- Java → JSON-safe value encoding ----------

  enum Encoded { UNDEFINED }

  static Object encode(Object value) {
    if (value == null || value instanceof Boolean || value instanceof String) return value;
    if (value instanceof Character ch) return String.valueOf(ch);
    if (value instanceof Double || value instanceof Float) {
      double d = ((Number) value).doubleValue();
      if (Double.isNaN(d)) return tag("NaN");
      if (Double.isInfinite(d)) return tag(d > 0 ? "Infinity" : "-Infinity");
      return d;
    }
    if (value instanceof Number n) return n.longValue();
    if (value.getClass().isArray()) {
      List<Object> list = new ArrayList<>();
      for (int i = 0; i < Array.getLength(value); i++) list.add(encode(Array.get(value, i)));
      return list;
    }
    if (value instanceof Collection<?> col) {
      List<Object> list = new ArrayList<>();
      for (Object v : col) list.add(encode(v));
      return list;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> out = new LinkedHashMap<>();
      for (Map.Entry<?, ?> e : map.entrySet()) out.put(String.valueOf(e.getKey()), encode(e.getValue()));
      return out;
    }
    return value.toString();
  }

  static Map<String, Object> tag(String name) {
    Map<String, Object> t = new LinkedHashMap<>();
    t.put("$pracstack", name);
    return t;
  }

  // ---------- helpers ----------

  private static Throwable unwrap(Throwable t) {
    while (t instanceof InvocationTargetException && t.getCause() != null) t = t.getCause();
    return t;
  }

  private static String describe(Throwable t) {
    String name = t.getClass().getSimpleName();
    return t.getMessage() == null ? name : name + ": " + t.getMessage();
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> asMap(Object o) {
    return (Map<String, Object>) o;
  }

  @SuppressWarnings("unchecked")
  static List<Object> asList(Object o) {
    if (o == null) throw new IllegalArgumentException("expected a list but got null");
    return (List<Object>) o;
  }

  /** Captures System.out/err as log lines, with limits. */
  static final class LogCapture extends OutputStream {
    private final int maxLines;
    private final List<String> lines = new ArrayList<>();
    private final ByteArrayOutputStream current = new ByteArrayOutputStream();

    LogCapture(int maxLines) {
      this.maxLines = maxLines;
    }

    @Override
    public synchronized void write(int b) {
      if (b == '\n') {
        flushLine();
      } else if (current.size() < 2000) {
        current.write(b);
      }
    }

    private void flushLine() {
      if (lines.size() < maxLines) lines.add(current.toString(StandardCharsets.UTF_8));
      current.reset();
    }

    synchronized List<Object> lines() {
      if (current.size() > 0) flushLine();
      return new ArrayList<>(lines);
    }
  }

  /** Minimal JSON parser and writer (the image has no third-party libraries). */
  static final class Json {
    private final String s;
    private int i;

    private Json(String s) {
      this.s = s;
    }

    static Object parse(String text) {
      Json p = new Json(text);
      Object v = p.value();
      p.ws();
      if (p.i != p.s.length()) throw new IllegalArgumentException("trailing JSON");
      return v;
    }

    private void ws() {
      while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
    }

    private Object value() {
      ws();
      char c = s.charAt(i);
      switch (c) {
        case '{': {
          i++;
          Map<String, Object> m = new LinkedHashMap<>();
          ws();
          if (s.charAt(i) == '}') { i++; return m; }
          while (true) {
            ws();
            String k = string();
            ws();
            i++; // ':'
            m.put(k, value());
            ws();
            if (s.charAt(i++) == '}') return m;
          }
        }
        case '[': {
          i++;
          List<Object> l = new ArrayList<>();
          ws();
          if (s.charAt(i) == ']') { i++; return l; }
          while (true) {
            l.add(value());
            ws();
            if (s.charAt(i++) == ']') return l;
          }
        }
        case '"':
          return string();
        case 't': i += 4; return Boolean.TRUE;
        case 'f': i += 5; return Boolean.FALSE;
        case 'n': i += 4; return null;
        default: {
          int start = i;
          while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
          String num = s.substring(start, i);
          if (num.contains(".") || num.contains("e") || num.contains("E")) return Double.parseDouble(num);
          return Long.parseLong(num);
        }
      }
    }

    private String string() {
      StringBuilder b = new StringBuilder();
      i++; // opening quote
      while (true) {
        char c = s.charAt(i++);
        if (c == '"') return b.toString();
        if (c != '\\') { b.append(c); continue; }
        char e = s.charAt(i++);
        switch (e) {
          case 'n' -> b.append('\n');
          case 't' -> b.append('\t');
          case 'r' -> b.append('\r');
          case 'b' -> b.append('\b');
          case 'f' -> b.append('\f');
          case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
          default -> b.append(e);
        }
      }
    }

    static String stringify(Object v) {
      StringBuilder b = new StringBuilder();
      write(b, v);
      return b.toString();
    }

    private static void write(StringBuilder b, Object v) {
      if (v == null) b.append("null");
      else if (v == Encoded.UNDEFINED) write(b, tag("undefined"));
      else if (v instanceof String str) quote(b, str);
      else if (v instanceof Boolean || v instanceof Long || v instanceof Integer) b.append(v);
      else if (v instanceof Double d) b.append(d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf(d.longValue()) : String.valueOf(d));
      else if (v instanceof Map<?, ?> m) {
        b.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> e : m.entrySet()) {
          if (!first) b.append(',');
          first = false;
          quote(b, String.valueOf(e.getKey()));
          b.append(':');
          write(b, e.getValue());
        }
        b.append('}');
      } else if (v instanceof List<?> l) {
        b.append('[');
        for (int i = 0; i < l.size(); i++) {
          if (i > 0) b.append(',');
          write(b, l.get(i));
        }
        b.append(']');
      } else quote(b, v.toString());
    }

    private static void quote(StringBuilder b, String s) {
      b.append('"');
      for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        switch (c) {
          case '"' -> b.append("\\\"");
          case '\\' -> b.append("\\\\");
          case '\n' -> b.append("\\n");
          case '\r' -> b.append("\\r");
          case '\t' -> b.append("\\t");
          default -> {
            if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
          }
        }
      }
      b.append('"');
    }
  }
}
