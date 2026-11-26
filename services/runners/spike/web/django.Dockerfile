# PHASE 0 SPIKE: Django / DRF web runner as a Lambda container image (Python 3.14.10).
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6 AS node
FROM public.ecr.aws/lambda/python:3.14
RUN microdnf -y install util-linux tar findutils && microdnf clean all
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && python -m compileall -q /var/lang/lib/python3.14 \
    && pip uninstall -y pip setuptools wheel 2>/dev/null; rm -rf /tmp/requirements.txt
COPY --from=node /var/lang/bin/node /opt/node/bin/node
ENV PATH=/var/lang/bin:/opt/node/bin:/usr/local/bin:/usr/bin:/bin \
    PRACSTACK_NODE=/opt/node/bin/node \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONHASHSEED=0 PYTHONIOENCODING=utf-8 \
    PRACSTACK_NPROC=256 PRACSTACK_MAX_RSS_MB=1600
COPY run.sh bootstrap.mjs probe.mjs entrypoint.sh /opt/pracstack/
RUN chmod 0555 /opt/pracstack/*.sh && chmod 0444 /opt/pracstack/*.mjs
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
