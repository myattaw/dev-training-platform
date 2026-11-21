# Runner image for TypeScript submissions. Built by `npm run runners:build`.
# Only the harness, the TypeScript compiler and the shared test executor are
# inside; no secrets, no expected values, no network at run time.
FROM node:26.3-alpine3.22

WORKDIR /harness
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY harness.mjs execute.mjs ./

# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
ENTRYPOINT ["node", "--max-old-space-size=192", "/harness/harness.mjs"]
