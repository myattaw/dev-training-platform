#!/bin/sh
# Web-challenge application runner for Spring Boot. Runs INSIDE an isolated
# container (no network, read-only root, unprivileged; see docs/execution-security.md).
#
# stdin:  a tar of the project (trusted template + the learner's editable files)
# stdout: compiler output, then the application's own output. Status lines start
#         with the per-run marker the API passes in PRACSTACK_MARKER.
# The class path is fixed (/opt/lib/<set>, pinned at image build; the API picks the
# set from trusted challenge content); a pom.xml in the project is documentation
# only and is never used to resolve anything.
set -u
M="${PRACSTACK_MARKER:-}"
MAIN="${PRACSTACK_MAIN_CLASS:-}"
LIBS="${PRACSTACK_LIB_SET:-core}"
unset PRACSTACK_MARKER PRACSTACK_MAIN_CLASS PRACSTACK_LIB_SET
case "$LIBS" in core|jpa|security) ;; *) echo "${M}project-invalid"; exit 3 ;; esac
mkdir -p /tmp/app /tmp/classes && cd /tmp/app || exit 1
if ! tar -x -f - -C /tmp/app 2>/dev/null || [ ! -d src/main/java ] || [ -z "$MAIN" ]; then
  echo "${M}project-invalid"
  exit 3
fi
echo "${M}building"
find src/main/java -name '*.java' > /tmp/sources.txt
if ! javac -d /tmp/classes -cp "/opt/lib/$LIBS/*" -encoding UTF-8 -parameters -proc:none -Xlint:none -nowarn -Xmaxerrs 50 @/tmp/sources.txt 2>&1; then
  echo "${M}build-failed"
  exit 2
fi
if [ -d src/main/resources ]; then cp -R src/main/resources/. /tmp/classes/; fi
echo "${M}build-ok"
echo "${M}starting"
exec java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss1m -XX:MaxRAMPercentage=60 \
  -Djava.io.tmpdir=/tmp -Dserver.address=127.0.0.1 -Dserver.port=8080 \
  -Dspring.main.banner-mode=off -Dserver.error.include-stacktrace=never \
  -cp "/tmp/classes:/opt/lib/$LIBS/*" "$MAIN"
