#!/bin/sh
# PHASE 0 SPIKE: stages each image's context under dist/ and builds pracstack-lambda-web-<fw>:spike.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../../../../packages/web-runner/docker"
for fw in ${*:-aspnetcore spring-boot django}; do
  ctx="$here/dist/$fw"; rm -rf "$ctx"; mkdir -p "$ctx"
  cp "$here/bootstrap.mjs" "$here/entrypoint.sh" "$src/probe/probe.mjs" "$src/$fw/run.sh" "$ctx/"
  cp "$here/$fw.Dockerfile" "$ctx/Dockerfile"
  [ "$fw" = spring-boot ] && cp -R "$src/spring-boot/libs" "$ctx/libs"
  [ "$fw" = django ] && cp "$src/django/requirements.txt" "$ctx/"
  docker build -q -t "pracstack-lambda-web-$fw:spike" "$ctx"
done
