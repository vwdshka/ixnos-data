# Build context: backend/
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY src/IxnosData.Domain/IxnosData.Domain.csproj src/IxnosData.Domain/
COPY src/IxnosData.Application/IxnosData.Application.csproj src/IxnosData.Application/
COPY src/IxnosData.Infrastructure/IxnosData.Infrastructure.csproj src/IxnosData.Infrastructure/
COPY src/IxnosData.Api/IxnosData.Api.csproj src/IxnosData.Api/
COPY src/IxnosData.Notifier/IxnosData.Notifier.csproj src/IxnosData.Notifier/
RUN dotnet restore src/IxnosData.Api/IxnosData.Api.csproj && dotnet restore src/IxnosData.Notifier/IxnosData.Notifier.csproj

COPY src/ src/
# The notifier ships in the same image (same runtime and dependencies); run it with
# --entrypoint "dotnet IxnosData.Notifier.dll".
RUN dotnet publish src/IxnosData.Api/IxnosData.Api.csproj -c Release --no-restore -o /app  && dotnet publish src/IxnosData.Notifier/IxnosData.Notifier.csproj -c Release --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "IxnosData.Api.dll"]
