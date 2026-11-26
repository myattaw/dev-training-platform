# PHASE 0 SPIKE: ASP.NET Core web runner as a Lambda container image.
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-noble AS sdk
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux tar findutils libicu && microdnf clean all
COPY --from=sdk /usr/share/dotnet /usr/share/dotnet
ENV PATH=/usr/share/dotnet:/var/lang/bin:/usr/local/bin:/usr/bin:/bin \
    DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_HOME=/tmp \
    NUGET_PACKAGES=/tmp/nuget \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    DOTNET_GENERATE_ASPNET_CERTIFICATE=false \
    DOTNET_EnableDiagnostics=0 \
    MSBUILDDISABLENODEREUSE=1 \
    ASPNETCORE_URLS=http://127.0.0.1:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Logging__Console__FormatterName=simple \
    PRACSTACK_NPROC=1024 PRACSTACK_MAX_RSS_MB=3300
COPY run.sh bootstrap.mjs probe.mjs entrypoint.sh /opt/pracstack/
RUN chmod 0555 /opt/pracstack/*.sh && chmod 0444 /opt/pracstack/*.mjs
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
