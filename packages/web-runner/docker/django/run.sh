#!/bin/sh
# Web-challenge application runner for Django / Django REST Framework. Runs
# INSIDE an isolated container (no network, read-only root, unprivileged; see
# docs/execution-security.md).
#
# stdin:  a tar of the project (trusted template + the learner's editable files)
# stdout: check/migration output, then the application's own output. Status
#         lines start with the per-run marker the API passes in PRACSTACK_MARKER.
# The database is a fresh SQLite file in /tmp, created by the project's
# migrations (and fixture data) on every run.
set -u
M="${PRACSTACK_MARKER:-}"
unset PRACSTACK_MARKER
mkdir -p /tmp/app && cd /tmp/app || exit 1
if ! tar -x -f - -C /tmp/app 2>/dev/null || [ ! -f manage.py ]; then
  echo "${M}project-invalid"
  exit 3
fi
echo "${M}building"
# Syntax errors first, with file and line (bytecode goes nowhere: the root is read-only).
if ! python -c "import ast,pathlib,sys
bad=False
for p in sorted(pathlib.Path('.').rglob('*.py')):
    try: ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
    except SyntaxError as e:
        print(f'{p}:{e.lineno}:{e.offset}: error: SyntaxError: {e.msg}'); bad=True
sys.exit(1 if bad else 0)" 2>&1; then
  echo "${M}build-failed"
  exit 2
fi
if ! python manage.py migrate --noinput -v 0 2>&1; then
  echo "${M}build-failed"
  exit 2
fi
if [ -f fixtures/seed.json ]; then
  python manage.py loaddata fixtures/seed.json -v 0 2>&1 || { echo "${M}build-failed"; exit 2; }
fi
echo "${M}build-ok"
echo "${M}starting"
exec python manage.py runserver 127.0.0.1:8080 --noreload --skip-checks
