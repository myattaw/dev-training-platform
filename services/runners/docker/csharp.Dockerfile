# C# runner function (AWS Lambda container image). Built by the CDK from
# services/runners/dist/csharp. The handler (Node.js) supervises the C#
# harness (.NET 10, Roslyn) in a separate, limited process.
#
# Pinned like the local image (packages/code-runner/docker/csharp/Dockerfile):
# SDK 10.0.404 and ASP.NET Core runtime 10.0.15, Roslyn 5.0.0. The runtime is
# copied into the same Node.js Lambda base image the other runners use.
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-noble AS build
WORKDIR /src
COPY harness/Harness.csproj ./
RUN dotnet restore -r linux-x64
COPY harness/Harness.cs ./
RUN dotnet publish -c Release -r linux-x64 --no-restore -o /harness

FROM mcr.microsoft.com/dotnet/aspnet:10.0.15-noble AS runtime

FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux && microdnf clean all
COPY --from=runtime /usr/share/dotnet /usr/share/dotnet
COPY --from=build /harness /opt/harness

COPY handler.mjs ${LAMBDA_TASK_ROOT}/
ENV RUNNER_LANGUAGE=csharp
# Removes the role's credentials before the runtime starts (see entrypoint.sh).
COPY entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
