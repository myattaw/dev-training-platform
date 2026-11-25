# Runner image for Java submissions and Java/Spring Boot Skill Mastery snippets.
# Built by `npm run runners:build`. Contains only the JDK, the harness and a pinned
# set of libraries (see libs/pom.xml): no secrets, no expected values, no network
# at run time. Learner code cannot add dependencies.
#
# Versions are pinned: Temurin 21 JDK; Spring Boot 4.1.3 (resolved at image build).
FROM maven:3.9-eclipse-temurin-21 AS libs
WORKDIR /libs
COPY libs/pom.xml ./
RUN mvn -q -B dependency:copy-dependencies -DoutputDirectory=/opt/lib -DincludeScope=test

FROM eclipse-temurin:21-jdk-alpine

COPY --from=libs /opt/lib /opt/lib
WORKDIR /harness
COPY Harness.java logback.xml ./
RUN javac -d /harness Harness.java && rm Harness.java

# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
# Small heap and fast startup: submissions are short programs.
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:MaxRAMPercentage=50", "-XX:TieredStopAtLevel=1", "-Xss1m", "-Xshare:auto", "-Djava.io.tmpdir=/tmp", "-Dspring.main.banner-mode=off", "-Dspring.main.log-startup-info=false", "-cp", "/harness:/opt/lib/*", "Harness"]
