# Runner image for Java submissions. Built by `npm run runners:build`.
# Contains only the JDK and the harness: no secrets, no expected values,
# no network at run time.
FROM eclipse-temurin:21-jdk-alpine

WORKDIR /harness
COPY Harness.java ./
RUN javac -d /harness Harness.java && rm Harness.java

# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
# Small heap and fast startup: submissions are short, single-threaded programs.
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:MaxRAMPercentage=50", "-XX:TieredStopAtLevel=1", "-Xss1m", "-Djava.io.tmpdir=/tmp", "-cp", "/harness", "Harness"]
