@REM ----------------------------------------------------------------------------
@REM Maven Wrapper startup batch script, version 3.3.2
@REM ----------------------------------------------------------------------------
@echo off
setlocal

set "MVNW_REPOURL="
set "MVNW_USERNAME="
set "MVNW_PASSWORD="

for %%I in ("%~dp0.") do set "BASEDIR=%%~fI"
set "WRAPPER_JAR=%BASEDIR%\.mvn\wrapper\maven-wrapper.jar"
set "WRAPPER_PROPERTIES=%BASEDIR%\.mvn\wrapper\maven-wrapper.properties"

if exist "%WRAPPER_JAR%" goto run

set "DOWNLOAD_URL=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar"
set "TMP_JAR=%TEMP%\maven-wrapper.jar"

if not exist "%BASEDIR%\.mvn\wrapper" mkdir "%BASEDIR%\.mvn\wrapper" >NUL 2>&1

rem Prefer Java downloader (works without PowerShell restrictions)
where javac >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
  javac "%BASEDIR%\.mvn\wrapper\MavenWrapperDownloader.java" >NUL 2>&1
  if exist "%BASEDIR%\.mvn\wrapper\MavenWrapperDownloader.class" (
    java -cp "%BASEDIR%\.mvn\wrapper" MavenWrapperDownloader "%BASEDIR%" >NUL 2>&1
  )
)

if exist "%WRAPPER_JAR%" goto run

where powershell >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue';" ^
    "Invoke-WebRequest -UseBasicParsing -Uri '%DOWNLOAD_URL%' -OutFile '%TMP_JAR%';"
) else (
  echo PowerShell is required to download the Maven wrapper. 1>&2
  exit /b 1
)

if not exist "%TMP_JAR%" (
  echo Failed to download Maven wrapper jar. 1>&2
  exit /b 1
)

copy /Y "%TMP_JAR%" "%WRAPPER_JAR%" >NUL

:run
set "JAVA_EXE=java"
where java >NUL 2>&1
if not %ERRORLEVEL% EQU 0 (
  echo Java not found on PATH. 1>&2
  exit /b 1
)

set "MAVEN_PROJECTBASEDIR=%BASEDIR%"
set "MAVEN_OPTS=%MAVEN_OPTS%"

"%JAVA_EXE%" %MAVEN_OPTS% -Dmaven.multiModuleProjectDirectory="%MAVEN_PROJECTBASEDIR%" -cp "%WRAPPER_JAR%" org.apache.maven.wrapper.MavenWrapperMain %*

endlocal
