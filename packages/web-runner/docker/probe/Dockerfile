# HTTP probe for web-challenge applications (TRUSTED). Built by
# `npm run web-runners:build`. Runs in the application container's network
# namespace (loopback only), sends the requests it is given and reports the raw
# responses. It never receives expected values: the API grades the responses.
FROM node:22.17-alpine3.22
WORKDIR /probe
COPY probe.mjs ./
USER 10001:10001
ENTRYPOINT ["node", "--disallow-code-generation-from-strings", "/probe/probe.mjs"]
