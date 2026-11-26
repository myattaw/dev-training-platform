# Django / Django REST Framework web runner function (AWS Lambda container
# image). Built from services/runners/dist/web-django (see src/web-handler.ts).
# Python comes from AWS's Lambda Python 3.14 image (3.14.10, the same version as
# the local image), built for /var/lang like the Node.js runtime, whose files
# it does not overlap. pip is removed after installing the pinned packages.
#
# Pinned like the local image (packages/web-runner/docker/django): Django 5.2.19, DRF 3.16.1.
FROM public.ecr.aws/lambda/python:3.14 AS python
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && python -m compileall -q /var/lang/lib/python3.14 \
    && pip uninstall -y pip setuptools wheel 2>/dev/null; rm -f /tmp/requirements.txt

FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux tar findutils && microdnf clean all
COPY --from=python /var/lang/bin/python3.14 /var/lang/bin/python3.14
COPY --from=python /var/lang/lib /var/lang/lib
RUN ln -s python3.14 /var/lang/bin/python3 && ln -s python3.14 /var/lang/bin/python \
    && /var/lang/bin/python3 --version && /var/lang/bin/node --version
ENV WEB_FRAMEWORK=django
COPY run.sh /opt/pracstack/run.sh
COPY handler.mjs ${LAMBDA_TASK_ROOT}/
COPY web-entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/run.sh /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
