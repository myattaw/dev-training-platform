# Runner image for C# submissions. Built by `npm run runners:build`.
# Contains only the ASP.NET Core runtime and the harness (with the Roslyn compiler):
# no SDK, no secrets, no expected values, no network at run time.
#
# Versions are pinned: .NET 10 (LTS) SDK 10.0.404 / runtime 10.0.15, Roslyn 5.0.0 (C# 14).
# Upgrading: see docs/runners.md ("Upgrading the C# runner").
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-alpine3.24 AS build
WORKDIR /src
COPY Harness.csproj ./
RUN dotnet restore -r linux-musl-x64
COPY Harness.cs ./
RUN dotnet publish -c Release -r linux-musl-x64 --no-restore -o /harness

# The ASP.NET Core runtime: .NET plus the Microsoft.AspNetCore.App framework.
FROM mcr.microsoft.com/dotnet/aspnet:10.0.15-alpine3.24
COPY --from=build /harness /harness
# No diagnostic IPC (it would create sockets in /tmp and allow attaching a debugger).
# W^X off: it double-maps JIT code through a memory file that grows past the
# container's 16 MB file-size limit (--ulimit fsize), and .NET then fails with
# "Out of memory". The file-size limit protects more than W^X adds here.
ENV DOTNET_EnableDiagnostics=0 \
    DOTNET_EnableWriteXorExecute=0 \
    DOTNET_gcServer=0 \
    DOTNET_TieredPGO=0 \
    DOTNET_NOLOGO=1
# Unprivileged user; the container also runs with --user, --read-only,
# --cap-drop ALL and no network (see packages/code-runner/src/docker-runner.ts).
USER 10001:10001
ENTRYPOINT ["dotnet", "/harness/Harness.dll"]
