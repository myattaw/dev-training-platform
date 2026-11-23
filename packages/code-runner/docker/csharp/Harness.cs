// C# runner harness. Runs INSIDE an isolated container (see docs/runners.md).
//
// stdin:  RunnerInput JSON (code + test inputs; never expected values)
// stdout: "\n<nonce><RunnerOutput JSON>\n"
//
// The learner's source is compiled in memory with Roslyn, loaded into its own
// collectible AssemblyLoadContext, and called by reflection. Return values are
// encoded like the TypeScript and Java runners' (see challenge-runtime/src/values.ts),
// so the same grader handles all three.
using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace PracStack.Runner;

public static class Harness
{
    /// <summary>Usings every submission gets, as in a `dotnet new console` project.</summary>
    private const string GlobalUsings =
        "global using System;\nglobal using System.Collections.Generic;\nglobal using System.Linq;\n" +
        "global using System.Text;\nglobal using System.Threading;\nglobal using System.Threading.Tasks;\n";

    private const int MaxDiagnostics = 50;

    public static int Main()
    {
        var realOut = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false };
        using var input = JsonDocument.Parse(Console.In.ReadToEnd());
        var root = input.RootElement;
        var nonce = root.GetProperty("nonce").GetString()!;
        var logs = new LogCapture(root.GetProperty("maxLogLines").GetInt32());
        Console.SetOut(logs);
        Console.SetError(logs);

        Dictionary<string, object?> output;
        try
        {
            output = Run(root, logs);
        }
        catch (Exception e)
        {
            output = LoadError("The runner failed: " + Describe(e), logs);
        }
        realOut.Write("\n" + nonce + JsonSerializer.Serialize(output) + "\n");
        realOut.Flush();
        // Ends threads the submission started, without waiting for them.
        Environment.Exit(0);
        return 0;
    }

    private static Dictionary<string, object?> Run(JsonElement input, LogCapture logs)
    {
        var code = input.GetProperty("code").GetString()!;
        var entryPoint = input.GetProperty("entryPoint").GetString()!;
        var tests = input.GetProperty("tests").EnumerateArray().ToList();

        var program = entryPoint == ProgramEntryPoint;
        var (assemblyBytes, diagnostics) = Compile(code, program);
        if (assemblyBytes is null)
        {
            return new() { ["kind"] = "compile-error", ["diagnostics"] = diagnostics };
        }

        var context = new AssemblyLoadContext("submission", isCollectible: true);
        var assembly = context.LoadFromStream(new MemoryStream(assemblyBytes));
        if (program) return RunProgram(assembly, tests.Count, logs);
        var types = assembly.GetTypes();
        var operations = tests.Any(t => t.GetProperty("kind").GetString() == "operations");
        var outcomes = new List<object?>();

        if (operations)
        {
            var type = types.FirstOrDefault(t => t.Name == entryPoint);
            if (type is null) return LoadError($"Expected your code to declare a class named \"{entryPoint}\".", logs);
            foreach (var t in tests) outcomes.Add(RunOperations(type, entryPoint, t));
        }
        else
        {
            var methods = FindStaticMethods(types, entryPoint);
            if (methods.Count == 0)
            {
                return LoadError($"Expected your code to declare a static method named \"{entryPoint}\".", logs);
            }
            foreach (var t in tests) outcomes.Add(RunCall(methods, t));
        }
        return new() { ["kind"] = "completed", ["outcomes"] = outcomes, ["logs"] = logs.Lines() };
    }

    /// <summary>
    /// Runs the code as a whole program (top-level statements or Main) instead of
    /// calling a method; its console output is the result. Used by the content
    /// build to check C# Skill Mastery snippets, never set from learner input.
    /// A file with only declarations is compiled and not run.
    /// </summary>
    private const string ProgramEntryPoint = "$program";

    private static Dictionary<string, object?> RunProgram(Assembly assembly, int testCount, LogCapture logs)
    {
        var outcome = new Dictionary<string, object?> { ["kind"] = "call", ["value"] = Undefined };
        var main = assembly.EntryPoint;
        if (main is not null)
        {
            try
            {
                var args = main.GetParameters().Length == 0 ? null : new object?[] { Array.Empty<string>() };
                Invoke(main, null, args ?? []);
            }
            catch (Exception e)
            {
                outcome.Remove("value");
                outcome["error"] = Describe(Unwrap(e));
            }
        }
        var outcomes = Enumerable.Range(0, testCount).Select(_ => (object?)outcome).ToList();
        return new() { ["kind"] = "completed", ["outcomes"] = outcomes, ["logs"] = logs.Lines() };
    }

    // ---------- compilation ----------

    private static (byte[]? Assembly, List<object?> Diagnostics) Compile(string code, bool program)
    {
        var parse = new CSharpParseOptions(LanguageVersion.CSharp14);
        var source = CSharpSyntaxTree.ParseText(code, parse, path: "Solution.cs");
        var trees = new[] { CSharpSyntaxTree.ParseText(GlobalUsings, parse, path: "GlobalUsings.cs"), source };
        var hasEntryPoint = program && (
            source.GetCompilationUnitRoot().Members.OfType<Microsoft.CodeAnalysis.CSharp.Syntax.GlobalStatementSyntax>().Any()
            || code.Contains("static void Main", StringComparison.Ordinal)
            || code.Contains("static async Task Main", StringComparison.Ordinal));
        var options = new CSharpCompilationOptions(
            hasEntryPoint ? OutputKind.ConsoleApplication : OutputKind.DynamicallyLinkedLibrary,
            optimizationLevel: OptimizationLevel.Release,
            nullableContextOptions: NullableContextOptions.Enable,
            allowUnsafe: false,
            concurrentBuild: false,
            deterministic: true);
        var compilation = CSharpCompilation.Create("Submission", trees, References.Value, options);

        using var stream = new MemoryStream();
        var result = compilation.Emit(stream);
        var errors = result.Diagnostics
            .Where(d => d.Severity == DiagnosticSeverity.Error)
            .Take(MaxDiagnostics)
            .Select(d =>
            {
                var span = d.Location.GetLineSpan();
                return (object?)new Dictionary<string, object?>
                {
                    ["line"] = Math.Max(1, span.StartLinePosition.Line + 1),
                    ["column"] = Math.Max(1, span.StartLinePosition.Character + 1),
                    ["message"] = $"{d.Id}: {d.GetMessage(System.Globalization.CultureInfo.InvariantCulture)}",
                };
            })
            .ToList();
        return result.Success ? (stream.ToArray(), errors) : (null, errors);
    }

    /// <summary>
    /// The .NET and ASP.NET Core framework assemblies (and Microsoft.Extensions), minus the
    /// compiler and this harness.
    /// </summary>
    private static readonly Lazy<List<MetadataReference>> References = new(() =>
        ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!)
            .Split(Path.PathSeparator)
            .Where(p =>
            {
                var name = Path.GetFileName(p);
                return (name.StartsWith("System.", StringComparison.Ordinal) ||
                        name.StartsWith("Microsoft.AspNetCore.", StringComparison.Ordinal) ||
                        name.StartsWith("Microsoft.Extensions.", StringComparison.Ordinal) ||
                        name is "netstandard.dll" or "mscorlib.dll" or "Microsoft.CSharp.dll")
                    && !name.StartsWith("System.Private.", StringComparison.Ordinal)
                    || name == "System.Private.CoreLib.dll";
            })
            .Select(p => (MetadataReference)MetadataReference.CreateFromFile(p))
            .ToList());

    // ---------- finding and calling the learner's code ----------

    /// <summary>Exact name first; `isPangram` in a shared test also finds C#'s `IsPangram`.</summary>
    private static IEnumerable<string> NameCandidates(string name)
    {
        yield return name;
        if (name.Length > 0 && char.IsLower(name[0])) yield return char.ToUpperInvariant(name[0]) + name[1..];
    }

    private static List<MethodInfo> FindStaticMethods(Type[] types, string entryPoint)
    {
        const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.DeclaredOnly;
        foreach (var name in NameCandidates(entryPoint))
        {
            var found = types
                .Where(t => !t.IsGenericTypeDefinition)
                // Prefer a class called Solution when several declare the method.
                .OrderBy(t => t.Name == "Solution" ? 0 : 1)
                .SelectMany(t => t.GetMethods(flags))
                .Where(m => m.Name == name && !m.IsGenericMethodDefinition && !m.IsSpecialName)
                .ToList();
            if (found.Count > 0) return found;
        }
        return [];
    }

    private static MethodInfo? FindInstanceMethod(Type type, string name, int arity)
    {
        const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
        return NameCandidates(name)
            .SelectMany(n => type.GetMethods(flags).Where(m => m.Name == n && m.GetParameters().Length == arity))
            .FirstOrDefault(m => !m.IsGenericMethodDefinition);
    }

    private static Dictionary<string, object?> RunCall(List<MethodInfo> methods, JsonElement test)
    {
        var outcome = new Dictionary<string, object?> { ["kind"] = "call" };
        try
        {
            var args = test.GetProperty("input").EnumerateArray().ToList();
            var method = methods.FirstOrDefault(m => m.GetParameters().Length == args.Count)
                ?? throw new ArgumentException($"expected {methods[0].GetParameters().Length} argument(s) but the test passes {args.Count}");
            var result = Invoke(method, null, ConvertArgs(args, method.GetParameters()));
            outcome["value"] = result.IsVoid ? Undefined : Encode(result.Value);
        }
        catch (Exception e)
        {
            outcome["error"] = Describe(Unwrap(e));
        }
        return outcome;
    }

    private static Dictionary<string, object?> RunOperations(Type type, string entryPoint, JsonElement test)
    {
        var values = new List<object?>();
        var outcome = new Dictionary<string, object?> { ["kind"] = "operations", ["values"] = values };

        object instance;
        try
        {
            var ctorArgs = test.GetProperty("constructorArgs").EnumerateArray().ToList();
            var ctor = type.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .FirstOrDefault(c => c.GetParameters().Length == ctorArgs.Count)
                ?? throw new ArgumentException($"{entryPoint} has no constructor with {ctorArgs.Count} parameter(s)");
            instance = ctor.Invoke(ConvertArgs(ctorArgs, ctor.GetParameters()));
        }
        catch (Exception e)
        {
            outcome["error"] = StepError(-1, Describe(Unwrap(e)));
            return outcome;
        }

        var steps = test.GetProperty("steps").EnumerateArray().ToList();
        for (var i = 0; i < steps.Count; i++)
        {
            var name = steps[i].GetProperty("call").GetString()!;
            var args = steps[i].GetProperty("args").EnumerateArray().ToList();
            var method = FindInstanceMethod(type, name, args.Count);
            if (method is null)
            {
                outcome["error"] = StepError(i, $"{entryPoint} has no method named \"{name}\"");
                return outcome;
            }
            try
            {
                var result = Invoke(method, instance, ConvertArgs(args, method.GetParameters()));
                values.Add(result.IsVoid ? Undefined : Encode(result.Value));
            }
            catch (Exception e)
            {
                outcome["error"] = StepError(i, Describe(Unwrap(e)));
                return outcome;
            }
        }
        return outcome;
    }

    /// <summary>Calls the method; a Task or ValueTask is awaited, so async solutions work too.</summary>
    private static (bool IsVoid, object? Value) Invoke(MethodInfo method, object? target, object?[] args)
    {
        var result = method.Invoke(target, args);
        var returnType = method.ReturnType;
        if (returnType == typeof(void)) return (true, null);
        if (result is ValueTask vt)
        {
            vt.AsTask().GetAwaiter().GetResult();
            return (true, null);
        }
        if (returnType.IsGenericType && returnType.GetGenericTypeDefinition() == typeof(ValueTask<>))
        {
            result = returnType.GetMethod("AsTask")!.Invoke(result, null);
            returnType = result!.GetType();
        }
        if (result is Task task)
        {
            task.GetAwaiter().GetResult();
            var resultProperty = task.GetType().GetProperty("Result");
            var isGeneric = returnType != typeof(Task) && resultProperty is not null
                && resultProperty.PropertyType.Name != "VoidTaskResult";
            return isGeneric ? (false, resultProperty!.GetValue(task)) : (true, null);
        }
        return (false, result);
    }

    private static Dictionary<string, object?> StepError(int step, string message) =>
        new() { ["step"] = step, ["message"] = message };

    private static Dictionary<string, object?> LoadError(string message, LogCapture logs) =>
        new() { ["kind"] = "load-error", ["message"] = message, ["logs"] = logs.Lines() };

    // ---------- JSON → C# argument conversion ----------

    private static object?[] ConvertArgs(List<JsonElement> values, ParameterInfo[] parameters)
    {
        if (values.Count != parameters.Length)
        {
            throw new ArgumentException($"expected {parameters.Length} argument(s) but the test passes {values.Count}");
        }
        return values.Select((v, i) => Convert(v, parameters[i].ParameterType)).ToArray();
    }

    internal static object? Convert(JsonElement value, Type type)
    {
        if (value.ValueKind == JsonValueKind.Null)
        {
            if (type.IsValueType && Nullable.GetUnderlyingType(type) is null)
            {
                throw new ArgumentException($"null cannot be passed as {type.Name}");
            }
            return null;
        }
        type = Nullable.GetUnderlyingType(type) ?? type;

        if (type == typeof(int)) return value.GetInt32();
        if (type == typeof(long)) return value.GetInt64();
        if (type == typeof(short)) return value.GetInt16();
        if (type == typeof(byte)) return value.GetByte();
        if (type == typeof(double)) return value.GetDouble();
        if (type == typeof(float)) return value.GetSingle();
        if (type == typeof(decimal)) return value.GetDecimal();
        if (type == typeof(bool)) return value.GetBoolean();
        if (type == typeof(string)) return value.GetString();
        if (type == typeof(char))
        {
            var s = value.GetString()!;
            if (s.Length != 1) throw new ArgumentException("expected a single character");
            return s[0];
        }
        if (type == typeof(object)) return Natural(value);
        if (type.IsArray)
        {
            var element = type.GetElementType()!;
            var items = value.EnumerateArray().ToList();
            var array = Array.CreateInstance(element, items.Count);
            for (var i = 0; i < items.Count; i++) array.SetValue(Convert(items[i], element), i);
            return array;
        }
        if (type.IsGenericType)
        {
            var definition = type.GetGenericTypeDefinition();
            var args = type.GetGenericArguments();
            if (args.Length == 2 && IsDictionaryType(definition) && args[0] == typeof(string))
            {
                var dict = (IDictionary)Activator.CreateInstance(typeof(Dictionary<,>).MakeGenericType(args))!;
                foreach (var p in value.EnumerateObject()) dict[p.Name] = Convert(p.Value, args[1]);
                return dict;
            }
            if (args.Length == 1 && IsListType(definition))
            {
                var list = (IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(args))!;
                foreach (var v in value.EnumerateArray()) list.Add(Convert(v, args[0]));
                if (definition == typeof(HashSet<>) || definition == typeof(ISet<>) || definition == typeof(IReadOnlySet<>))
                {
                    return Activator.CreateInstance(typeof(HashSet<>).MakeGenericType(args), list);
                }
                return list;
            }
        }
        throw new ArgumentException($"parameters of type {type.Name} are not supported by the runner");
    }

    private static bool IsListType(Type d) =>
        d == typeof(List<>) || d == typeof(IList<>) || d == typeof(ICollection<>) || d == typeof(IEnumerable<>)
        || d == typeof(IReadOnlyList<>) || d == typeof(IReadOnlyCollection<>)
        || d == typeof(HashSet<>) || d == typeof(ISet<>) || d == typeof(IReadOnlySet<>);

    private static bool IsDictionaryType(Type d) =>
        d == typeof(Dictionary<,>) || d == typeof(IDictionary<,>) || d == typeof(IReadOnlyDictionary<,>);

    private static object? Natural(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => v.TryGetInt64(out var l) ? l : v.GetDouble(),
        JsonValueKind.Array => v.EnumerateArray().Select(Natural).ToList(),
        JsonValueKind.Object => v.EnumerateObject().ToDictionary(p => p.Name, p => Natural(p.Value)),
        _ => null,
    };

    // ---------- C# → JSON-safe value encoding ----------

    private static readonly Dictionary<string, object?> Undefined = Tag("undefined");

    internal static object? Encode(object? value)
    {
        switch (value)
        {
            case null: return null;
            case bool or string: return value;
            case char c: return c.ToString();
            case double or float or decimal:
                var d = System.Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
                if (double.IsNaN(d)) return Tag("NaN");
                if (double.IsInfinity(d)) return Tag(d > 0 ? "Infinity" : "-Infinity");
                return d;
            case sbyte or byte or short or ushort or int or uint or long:
                return System.Convert.ToInt64(value, System.Globalization.CultureInfo.InvariantCulture);
            case ulong u: return (double)u;
            case IDictionary map:
                var obj = new Dictionary<string, object?>();
                foreach (DictionaryEntry e in map) obj[System.Convert.ToString(e.Key, System.Globalization.CultureInfo.InvariantCulture)!] = Encode(e.Value);
                return obj;
            case ITuple tuple:
                var items = new List<object?>();
                for (var i = 0; i < tuple.Length; i++) items.Add(Encode(tuple[i]));
                return items;
            case IEnumerable list:
                var encoded = new List<object?>();
                foreach (var v in list) encoded.Add(Encode(v));
                return encoded;
            default:
                return System.Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
        }
    }

    private static Dictionary<string, object?> Tag(string name) => new() { ["$pracstack"] = name };

    // ---------- helpers ----------

    private static Exception Unwrap(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException!;
        if (e is AggregateException { InnerExceptions.Count: 1 } a) e = a.InnerExceptions[0];
        return e;
    }

    private static string Describe(Exception e) =>
        string.IsNullOrEmpty(e.Message) ? e.GetType().Name : $"{e.GetType().Name}: {e.Message}";

    /// <summary>Captures Console output as log lines, with limits.</summary>
    private sealed class LogCapture(int maxLines) : TextWriter
    {
        private readonly List<string> _lines = [];
        private readonly StringBuilder _current = new();
        private readonly Lock _gate = new();

        public override Encoding Encoding => Encoding.UTF8;

        public override void Write(char value)
        {
            lock (_gate)
            {
                if (value == '\n') FlushLine();
                else if (value != '\r' && _current.Length < 2000) _current.Append(value);
            }
        }

        private void FlushLine()
        {
            if (_lines.Count < maxLines) _lines.Add(_current.ToString());
            _current.Clear();
        }

        public List<object?> Lines()
        {
            lock (_gate)
            {
                if (_current.Length > 0) FlushLine();
                return [.. _lines];
            }
        }
    }
}
