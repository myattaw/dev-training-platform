#!/bin/sh
# Web-challenge application runner for ASP.NET Core. Runs INSIDE an isolated
# container (no network, read-only root, unprivileged; see docs/execution-security.md).
#
# stdin:  a tar of the project (trusted template + the learner's editable files,
#         assembled and validated by the API)
# stdout: build output, then the application's own output. Status lines start
#         with the per-run marker the API passes in PRACSTACK_MARKER.
set -u
M="${PRACSTACK_MARKER:-}"
unset PRACSTACK_MARKER
mkdir -p /tmp/app /tmp/out && cd /tmp/app || exit 1
if ! tar -x -f - -C /tmp/app 2>/dev/null; then
  echo "${M}project-invalid"
  exit 3
fi
project=$(ls *.csproj 2>/dev/null | head -n 1)
if [ -z "$project" ]; then
  echo "${M}project-invalid"
  exit 3
fi
echo "${M}building"
if ! dotnet build "$project" -c Release -o /tmp/out -nologo -nodeReuse:false \
     -p:UseSharedCompilation=false -p:GenerateDocumentationFile=false \
     -clp:NoSummary -v:q 2>&1; then
  echo "${M}build-failed"
  exit 2
fi
echo "${M}build-ok"
cd /tmp/out || exit 1
assembly="$(basename "$project" .csproj).dll"
echo "${M}starting"
exec dotnet "$assembly"
