# TypeScript runner function (AWS Lambda container image). Built by the CDK
# from services/runners/dist/typescript (npm run build -w @pracstack/runners).
# Contains the runtime, the TypeScript compiler, the harness and the
# supervisor only: no content, no expected values, no secrets.
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6

# prlimit (util-linux) sets per-run process, file and file-size limits.
RUN microdnf -y install util-linux && microdnf clean all

COPY harness/ /opt/harness/
RUN cd /opt/harness && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY handler.mjs ${LAMBDA_TASK_ROOT}/
ENV RUNNER_LANGUAGE=typescript
# Removes the role's credentials before the runtime starts (see entrypoint.sh).
COPY entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
