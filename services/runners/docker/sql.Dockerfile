# SQL runner function (AWS Lambda container image). Built by the CDK from
# services/runners/dist/sql. PGlite (PostgreSQL in WebAssembly) runs in a
# supervised child process; see docs/sql.md.
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6

COPY package.json ${LAMBDA_TASK_ROOT}/
RUN cd ${LAMBDA_TASK_ROOT} && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# An empty PostgreSQL cluster, made now with the PGlite installed above, so a
# cold runner loads it (a fraction of a second) instead of running initdb.
COPY make-base-cluster.mjs /tmp/make-base-cluster.mjs
RUN cp /tmp/make-base-cluster.mjs ${LAMBDA_TASK_ROOT}/ \
  && cd ${LAMBDA_TASK_ROOT} && node make-base-cluster.mjs sql-base.tar \
  && rm make-base-cluster.mjs /tmp/make-base-cluster.mjs && chmod 0444 sql-base.tar

COPY handler.mjs sql-runner.mjs sql-worker.mjs ${LAMBDA_TASK_ROOT}/
# Removes the role's credentials before the runtime starts (see entrypoint.sh).
COPY entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
