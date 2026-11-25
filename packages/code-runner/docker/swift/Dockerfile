# Runner image for Swift submissions and Swift Skill Mastery snippets.
# Built by `npm run runners:build`. Contains only the Swift toolchain (Linux),
# the driver and the test entry point: no secrets, no expected values, no network
# at run time. No Apple SDKs: Foundation here is swift-corelibs-foundation, and
# SwiftUI/UIKit are not available.
#
# Versions are pinned: Swift 6.4.3 (swift:6.4.3-bookworm).
FROM swift:6.4.3-bookworm

WORKDIR /harness
COPY Driver.swift TestMain.swift ./
RUN swiftc -O -o /harness/driver Driver.swift && rm Driver.swift
# Warm the module cache (Swift, Foundation, Glibc) once at build time, so a run
# compiles only the learner's code. Read-only at run time.
COPY warmup ./warmup
RUN mkdir -p /opt/swift-module-cache && cp TestMain.swift warmup/main.swift \
    && swiftc -Onone -module-name Solution -module-cache-path /opt/swift-module-cache \
         -o /tmp/warm warmup/Solution.swift warmup/Support.swift warmup/main.swift \
    && printf 'import Foundation\nprint("ok")\n' > /tmp/main.swift \
    && swiftc -Onone -module-cache-path /opt/swift-module-cache -o /tmp/warm2 /tmp/main.swift \
    && rm -rf /tmp/warm /tmp/warm2 /tmp/main.swift warmup \
    && chmod -R a+rX /opt/swift-module-cache

# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
ENTRYPOINT ["/harness/driver"]
