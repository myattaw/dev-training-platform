# Runner image for Python submissions and Python/Django Skill Mastery snippets.
# Built by `npm run runners:build`. Contains only CPython, the harness and a pinned,
# pre-installed set of packages: no secrets, no expected values, no network at
# run time, and no way to install packages (pip is removed).
#
# Versions are pinned: Python 3.14.10, Django 5.2.19 (LTS), Django REST Framework 3.16.1.
FROM python:3.14.10-slim-bookworm

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --no-compile -r /tmp/requirements.txt \
    && python -m compileall -q /usr/local/lib/python3.14 \
    && pip uninstall -y pip setuptools wheel 2>/dev/null; rm -f /tmp/requirements.txt

WORKDIR /harness
COPY harness.py ./
RUN python -m py_compile harness.py

# Read-only root filesystem at run time: never write .pyc files.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=0 \
    PYTHONIOENCODING=utf-8
# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
# -s: no user site-packages; -P: no script/current directory on sys.path. (Not -I, which
# would also ignore PYTHONHASHSEED: the fixed seed keeps set and hash ordering reproducible.)
ENTRYPOINT ["python", "-s", "-P", "/harness/harness.py"]
