# Web-challenge runner for ASP.NET Core applications (UNTRUSTED code runs here).
# Built by `npm run web-runners:build`. Holds the .NET SDK only: no secrets, no
# expected values, no network at run time. Projects may reference only the
# shared framework (Microsoft.AspNetCore.App); the .csproj is read-only for
# learners, so a build never needs NuGet.
#
# Versions are pinned: .NET SDK 10.0.404 (ASP.NET Core 10).
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-alpine3.24

COPY run.sh /opt/pracstack/run.sh
RUN chmod 555 /opt/pracstack/run.sh

# Writable state goes to the /tmp tmpfs; no telemetry, first-run work or debugger IPC.
ENV HOME=/tmp \
    DOTNET_CLI_HOME=/tmp \
    NUGET_PACKAGES=/tmp/nuget \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    DOTNET_GENERATE_ASPNET_CERTIFICATE=false \
    DOTNET_EnableDiagnostics=0 \
    DOTNET_EnableWriteXorExecute=0 \
    MSBUILDDISABLENODEREUSE=1 \
    ASPNETCORE_URLS=http://127.0.0.1:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Logging__Console__FormatterName=simple

USER 10001:10001
ENTRYPOINT ["/opt/pracstack/run.sh"]
