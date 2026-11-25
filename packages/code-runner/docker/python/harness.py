"""Python runner harness. Runs INSIDE an isolated container (see docs/runners.md).

stdin:  RunnerInput JSON (code + test INPUTS; never expected values)
stdout: "\n<nonce><RunnerOutput JSON>\n"

The learner's code is compiled and executed as a module named ``solution``.
Call tests call a function by name; operations tests construct a class and call
its methods in order. Return values are encoded like the TypeScript runner's
(see packages/challenge-runtime/src/values.ts), so the API grades every
language with the same code.

The entry point ``$program`` runs the code as a whole program (Skill Mastery
snippet checks): what it prints becomes the logs.
"""

import copy
import dataclasses
import enum
import io
import json
import math
import os
import re
import sys
import traceback
import types

PROGRAM_ENTRY_POINT = "$program"
SUPPORT_FILE_MARKER = "\n// <pracstack:support-file>\n"
TAG = "$pracstack"
MAX_SAFE_INTEGER = 2**53 - 1

# Keep a private handle on the real stdout before any learner code runs. The
# result line is written there; everything the learner prints is captured.
REAL_STDOUT = os.fdopen(os.dup(1), "w", encoding="utf-8")


class LogCapture(io.TextIOBase):
    """Collects printed lines, keeping at most ``max_lines``."""

    def __init__(self, max_lines):
        self.max_lines = max_lines
        self.lines = []
        self.partial = ""
        self.truncated = False

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            text = str(text)
        self.partial += text
        while "\n" in self.partial:
            line, self.partial = self.partial.split("\n", 1)
            self._add(line)
        if len(self.partial) > 10_000:
            self._add(self.partial)
            self.partial = ""
        return len(text)

    def _add(self, line):
        if len(self.lines) < self.max_lines:
            self.lines.append(line[:2000])
        else:
            self.truncated = True

    def flush(self):
        pass

    def result(self):
        if self.partial:
            self._add(self.partial)
            self.partial = ""
        lines = list(self.lines)
        if self.truncated:
            lines.append("… output truncated")
        return lines


def snake_case(name):
    return re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", name).lower()


def describe(err):
    message = str(err)
    name = type(err).__name__
    return f"{name}: {message}" if message else name


def encode(value, depth=0):
    if depth > 50:
        return {TAG: "too-deep"}
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, enum.Enum):
        return encode(value.value, depth + 1)
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            return {TAG: "bigint", "value": str(value)}
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return {TAG: "NaN"}
        if math.isinf(value):
            return {TAG: "Infinity" if value > 0 else "-Infinity"}
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return [encode(v, depth + 1) for v in value]
    if isinstance(value, (set, frozenset)):
        items = list(value)
        try:
            items.sort()
        except TypeError:
            pass
        return [encode(v, depth + 1) for v in items]
    if isinstance(value, dict):
        return {str(k): encode(v, depth + 1) for k, v in value.items()}
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {
            f.name: encode(getattr(value, f.name), depth + 1) for f in dataclasses.fields(value)
        }
    if callable(value):
        return {TAG: "function"}
    if hasattr(value, "__dict__"):
        return {
            k: encode(v, depth + 1) for k, v in vars(value).items() if not k.startswith("_")
        }
    return str(value)


def find_attribute(owner, name):
    """Exact name first, then the snake_case form (isPangram → is_pangram)."""
    for candidate in (name, snake_case(name)):
        if candidate in owner:
            return owner[candidate]
    return None


def run_call(fn, test):
    try:
        args = copy.deepcopy(test["input"])
        return {"kind": "call", "value": encode(fn(*args))}
    except BaseException as err:  # noqa: BLE001 — every failure is the learner's result
        if isinstance(err, (KeyboardInterrupt, SystemExit)):
            return {"kind": "call", "error": f"{type(err).__name__} raised"}
        return {"kind": "call", "error": describe(err)}


def run_operations(cls, entry_point, test):
    values = []
    try:
        instance = cls(*copy.deepcopy(test["constructorArgs"]))
    except BaseException as err:  # noqa: BLE001
        return {"kind": "operations", "values": [], "error": {"step": -1, "message": describe(err)}}
    for i, step in enumerate(test["steps"]):
        name = step["call"]
        method = None
        for candidate in (name, snake_case(name)):
            attr = getattr(instance, candidate, None)
            if callable(attr) and not candidate.startswith("__"):
                method = attr
                break
        if method is None:
            return {
                "kind": "operations",
                "values": values,
                "error": {"step": i, "message": f'{entry_point} has no method named "{name}"'},
            }
        try:
            values.append(encode(method(*copy.deepcopy(step["args"]))))
        except BaseException as err:  # noqa: BLE001
            return {
                "kind": "operations",
                "values": values,
                "error": {"step": i, "message": describe(err)},
            }
    return {"kind": "operations", "values": values}


def last_frame_line(err):
    """The line of the learner's code an error came from, for load errors."""
    for frame in reversed(traceback.extract_tb(err.__traceback__)):
        if frame.filename == "solution.py":
            return frame.lineno
    return None


def run(data, logs):
    code = data["code"]
    entry_point = data["entryPoint"]
    tests = data["tests"]
    support = ""
    if SUPPORT_FILE_MARKER in code:
        code, support = code.split(SUPPORT_FILE_MARKER, 1)

    try:
        compiled = compile(code, "solution.py", "exec", dont_inherit=True)
        compiled_support = compile(support, "support.py", "exec", dont_inherit=True) if support else None
    except SyntaxError as err:
        return {
            "kind": "compile-error",
            "diagnostics": [
                {
                    "line": max(1, err.lineno or 1),
                    "column": max(1, err.offset or 1),
                    "message": f"{type(err).__name__}: {err.msg}",
                }
            ],
        }

    module = types.ModuleType("solution")
    module.__file__ = "solution.py"
    sys.modules["solution"] = module
    program = entry_point == PROGRAM_ENTRY_POINT
    if program:
        # A script: `__name__ == "__main__"`, and modules that look themselves up
        # (dataclasses, Django's ROOT_URLCONF = __name__) find the learner's code.
        module.__name__ = "__main__"
        sys.modules["__main__"] = module
    try:
        exec(compiled, module.__dict__)  # noqa: S102 — this is the sandbox
        if compiled_support is not None:
            exec(compiled_support, module.__dict__)  # noqa: S102
    except BaseException as err:  # noqa: BLE001
        if program:
            outcome = {"kind": "call", "error": describe(err)}
            return {"kind": "completed", "outcomes": [outcome] * len(tests), "logs": logs.result()}
        line = last_frame_line(err)
        where = f" (line {line})" if line else ""
        return {
            "kind": "load-error",
            "message": f"Your code raised an error while loading{where}: {describe(err)}",
            "logs": logs.result(),
        }

    if program:
        outcome = {"kind": "call", "value": {TAG: "undefined"}}
        return {"kind": "completed", "outcomes": [outcome] * len(tests), "logs": logs.result()}

    namespace = module.__dict__
    operations = any(t["kind"] == "operations" for t in tests)
    entry = find_attribute(namespace, entry_point)
    if operations:
        if not isinstance(entry, type):
            return {
                "kind": "load-error",
                "message": f'Expected your code to define a class named "{entry_point}".',
                "logs": logs.result(),
            }
        outcomes = [run_operations(entry, entry_point, t) for t in tests]
    else:
        if not callable(entry) or isinstance(entry, type):
            return {
                "kind": "load-error",
                "message": f'Expected your code to define a function named "{snake_case(entry_point)}".',
                "logs": logs.result(),
            }
        outcomes = [run_call(entry, t) for t in tests]
    return {"kind": "completed", "outcomes": outcomes, "logs": logs.result()}


def main():
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    nonce = data["nonce"]
    logs = LogCapture(int(data["maxLogLines"]))
    sys.stdout = logs
    sys.stderr = logs
    sys.stdin = io.StringIO("")
    try:
        output = run(data, logs)
    except BaseException as err:  # noqa: BLE001
        output = {"kind": "load-error", "message": f"The runner failed: {describe(err)}", "logs": logs.result()}
    try:
        text = json.dumps(output, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as err:
        text = json.dumps({"kind": "load-error", "message": f"Unreadable result: {err}", "logs": []})
    REAL_STDOUT.write("\n" + nonce + text + "\n")
    REAL_STDOUT.flush()
    # Stop any threads the submission started.
    os._exit(0)


if __name__ == "__main__":
    main()
