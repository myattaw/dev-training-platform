# ASP.NET Core web runner function (AWS Lambda container image). Built from
# services/runners/dist/web-aspnetcore. The handler (Node.js) builds and runs
# the learner's application in a separate, limited process and probes it on
# loopback (see src/web-handler.ts). Learner projects reference only the shared
# framework (the .csproj is read-only for learners), so a build never needs NuGet.
#
# Pinned like the local image (packages/web-runner/docker/aspnetcore): .NET SDK 10.0.404.
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-noble AS sdk

FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux tar findutils libicu && microdnf clean all
COPY --from=sdk /usr/share/dotnet /usr/share/dotnet
ENV WEB_FRAMEWORK=aspnetcore
COPY run.sh /opt/pracstack/run.sh
COPY handler.mjs ${LAMBDA_TASK_ROOT}/
COPY web-entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/run.sh /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
