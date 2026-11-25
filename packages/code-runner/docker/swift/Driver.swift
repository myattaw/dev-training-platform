// Swift runner driver. Runs INSIDE an isolated container (see docs/runners.md).
//
// stdin:  RunnerInput JSON (code + test INPUTS; never expected values)
// stdout: "\n<nonce><RunnerOutput JSON>\n"
//
// Swift has no runtime reflection for calling functions by name, so each
// challenge ships a small typed adapter (support code, public and read-only)
// that converts JSON arguments and calls the learner's code. The driver:
//   1. writes Solution.swift (learner), Support.swift (adapter) and main.swift
//      (TestMain.swift from the image), and compiles them with swiftc;
//   2. runs the program once PER TEST, so a crash fails only that test;
//   3. collects each test's outcome line and the learner's printed lines.
// The entry point `$program` compiles the learner's code alone as main.swift
// and reports what it prints (Skill Mastery snippet checks).
import Foundation

let work = URL(fileURLWithPath: "/tmp/work")
let supportMarker = "\n// <pracstack:support-file>\n"
let programEntryPoint = "$program"
let maxRunBytes = 512 * 1024

func jsonString(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [s], options: [])
    let array = String(data: data, encoding: .utf8)!
    return String(array.dropFirst().dropLast())
}

func toJSON(_ object: Any) -> String {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [])
    return String(data: data, encoding: .utf8)!
}

struct ProcessResult {
    let status: Int32
    let stdout: String
    let stderr: String
}

/// Runs a process to completion with the given stdin, keeping at most `maxRunBytes` of output.
func runProcess(_ path: String, _ arguments: [String], stdin: Data = Data()) -> ProcessResult {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    process.currentDirectoryURL = work
    process.environment = [
        "PATH": "/usr/bin:/bin",
        "HOME": "/tmp",
        "TMPDIR": "/tmp",
        "LANG": "C.UTF-8",
    ]
    let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
    process.standardInput = inPipe
    process.standardOutput = outPipe
    process.standardError = errPipe
    var out = Data(), err = Data()
    let group = DispatchGroup()
    group.enter()
    DispatchQueue.global().async {
        while true {
            let chunk = outPipe.fileHandleForReading.availableData
            if chunk.isEmpty { break }
            if out.count < maxRunBytes { out.append(chunk) }
        }
        group.leave()
    }
    group.enter()
    DispatchQueue.global().async {
        while true {
            let chunk = errPipe.fileHandleForReading.availableData
            if chunk.isEmpty { break }
            if err.count < 64 * 1024 { err.append(chunk) }
        }
        group.leave()
    }
    do {
        try process.run()
    } catch {
        return ProcessResult(status: -1, stdout: "", stderr: "could not start \(path): \(error)")
    }
    inPipe.fileHandleForWriting.write(stdin)
    try? inPipe.fileHandleForWriting.close()
    process.waitUntilExit()
    group.wait()
    return ProcessResult(
        status: process.terminationStatus,
        stdout: String(decoding: out, as: UTF8.self),
        stderr: String(decoding: err, as: UTF8.self))
}

/// swiftc diagnostics: "<file>:<line>:<column>: error: <message>".
func diagnostics(_ text: String, learnerFile: String) -> [[String: Any]] {
    var found: [[String: Any]] = []
    let pattern = try! NSRegularExpression(pattern: "^(.*?):(\\d+):(\\d+): error: (.*)$", options: [.anchorsMatchLines])
    let range = NSRange(text.startIndex..., in: text)
    for match in pattern.matches(in: text, range: range) {
        guard found.count < 50,
              let file = Range(match.range(at: 1), in: text),
              let line = Range(match.range(at: 2), in: text),
              let column = Range(match.range(at: 3), in: text),
              let message = Range(match.range(at: 4), in: text) else { continue }
        let inLearnerFile = text[file].hasSuffix(learnerFile)
        found.append([
            "line": inLearnerFile ? Int(text[line]) ?? 1 : 1,
            "column": inLearnerFile ? Int(text[column]) ?? 1 : 1,
            "message": inLearnerFile
                ? String(text[message])
                : "\(URL(fileURLWithPath: String(text[file])).lastPathComponent): \(text[message])",
        ])
    }
    if found.isEmpty {
        let firstLines = text.split(separator: "\n").prefix(5).joined(separator: "\n")
        found.append(["line": 1, "column": 1, "message": firstLines.isEmpty ? "The compiler failed." : firstLines])
    }
    return found
}

/// The runtime's reason for a crash, e.g. "Fatal error: Index out of range".
func crashMessage(_ result: ProcessResult) -> String {
    for line in result.stderr.split(separator: "\n") {
        if let range = line.range(of: "Fatal error:") {
            return String(line[range.lowerBound...]).trimmingCharacters(in: .whitespaces)
        }
    }
    if result.status == 137 || result.status == 9 { return "The program was killed (memory or time limit)." }
    return "The program crashed (exit status \(result.status))."
}

func run(_ input: [String: Any]) -> String {
    guard
        var code = input["code"] as? String,
        let entryPoint = input["entryPoint"] as? String,
        let tests = input["tests"] as? [[String: Any]],
        let maxLogLines = input["maxLogLines"] as? Int
    else {
        return toJSON(["kind": "load-error", "message": "The runner received unreadable input.", "logs": []])
    }
    var support = ""
    if let range = code.range(of: supportMarker) {
        support = String(code[range.upperBound...])
        code = String(code[..<range.lowerBound])
    }

    try? FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
    let program = entryPoint == programEntryPoint
    let learnerFile = program ? "main.swift" : "Solution.swift"
    var files = [learnerFile]
    try? code.write(to: work.appendingPathComponent(learnerFile), atomically: false, encoding: .utf8)
    if !program {
        try? support.write(to: work.appendingPathComponent("Support.swift"), atomically: false, encoding: .utf8)
        try? FileManager.default.copyItem(
            at: URL(fileURLWithPath: "/harness/TestMain.swift"), to: work.appendingPathComponent("main.swift"))
        files += ["Support.swift", "main.swift"]
    }

    let compile = runProcess("/usr/bin/swiftc", [
        "-Onone", "-swift-version", "6", "-module-name", "Solution", "-module-cache-path", "/opt/swift-module-cache",
        "-suppress-warnings", "-o", "/tmp/work/program",
    ] + files.map { "/tmp/work/\($0)" })
    if compile.status != 0 {
        return toJSON(["kind": "compile-error", "diagnostics": diagnostics(compile.stderr + compile.stdout, learnerFile: learnerFile)])
    }

    var logs: [String] = []
    var truncated = false
    func addLogs(_ lines: [Substring]) {
        for line in lines {
            if logs.count < maxLogLines { logs.append(String(line.prefix(2000))) } else { truncated = true }
        }
    }

    if program {
        let run = runProcess("/tmp/work/program", [])
        var stdoutLines = run.stdout.split(separator: "\n", omittingEmptySubsequences: false)
        if stdoutLines.last == "" { stdoutLines.removeLast() }
        addLogs(stdoutLines)
        let outcome: [String: Any] = run.status == 0
            ? ["kind": "call", "value": ["$pracstack": "undefined"]]
            : ["kind": "call", "error": crashMessage(run)]
        if truncated { logs.append("… output truncated") }
        return toJSON(["kind": "completed", "outcomes": Array(repeating: outcome, count: tests.count), "logs": logs])
    }

    var outcomeJSON: [String] = []
    for test in tests {
        let innerNonce = "<<TEST-\(UUID().uuidString)>>"
        let stdin = toJSON(["nonce": innerNonce, "test": test]).data(using: .utf8)!
        let run = runProcess("/tmp/work/program", [], stdin: stdin)
        var result: String? = nil
        var constructed = false
        var stepValues: [String] = []
        var printed: [Substring] = []
        for line in run.stdout.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix(innerNonce) {
                let rest = String(line.dropFirst(innerNonce.count))
                if rest == "+" {
                    constructed = true
                } else if rest.hasPrefix("~") {
                    stepValues.append(String(rest.dropFirst()))
                } else {
                    result = rest
                }
            } else {
                printed.append(line)
            }
        }
        while printed.last == "" { printed.removeLast() }
        addLogs(printed)
        if let result = result, run.status == 0 {
            outcomeJSON.append(result)
        } else {
            // The process crashed: report the values of the steps that completed,
            // and the crash at the step after them (or at the constructor).
            let kind = test["kind"] as? String ?? "call"
            let message = jsonString(crashMessage(run))
            let step = constructed ? stepValues.count : -1
            outcomeJSON.append(kind == "call"
                ? "{\"kind\":\"call\",\"error\":\(message)}"
                : "{\"kind\":\"operations\",\"values\":[\(stepValues.joined(separator: ","))],\"error\":{\"step\":\(step),\"message\":\(message)}}")
        }
    }
    if truncated { logs.append("… output truncated") }
    return "{\"kind\":\"completed\",\"outcomes\":[\(outcomeJSON.joined(separator: ","))],\"logs\":\(toJSON(logs))}"
}

let inputData = FileHandle.standardInput.readDataToEndOfFile()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let resultNonce = input["nonce"] as? String ?? ""
let output = run(input)
FileHandle.standardOutput.write(("\n" + resultNonce + output + "\n").data(using: .utf8)!)
