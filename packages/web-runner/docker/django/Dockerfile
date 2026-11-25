# Web-challenge runner for Django / Django REST Framework applications
# (UNTRUSTED code runs here). Built by `npm run web-runners:build`. Holds
# CPython and pinned packages only (pip removed): no secrets, no expected
# values, no network at run time.
#
# Versions are pinned: Python 3.14.10, Django 5.2.19 (LTS), Django REST Framework 3.16.1.
FROM python:3.14.10-slim-bookworm
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && python -m compileall -q /usr/local/lib/python3.14 \
    && pip uninstall -y pip setuptools wheel 2>/dev/null; rm -f /tmp/requirements.txt
COPY run.sh /opt/pracstack/run.sh
RUN chmod 555 /opt/pracstack/run.sh
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=0 \
    PYTHONIOENCODING=utf-8
USER 10001:10001
ENTRYPOINT ["/opt/pracstack/run.sh"]
