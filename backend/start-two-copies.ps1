# Starts two backend copies (8081 = "a", 8082 = "b") and the Nginx load balancer on 8080.
# The database must already be running (docker compose up -d). Stop with: .\start-two-copies.ps1 -Stop
param([switch]$Stop, [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$logDir = Join-Path $PSScriptRoot 'target\lb-logs'

function Stop-Port($port) {
  $line = cmd /c "netstat -ano | findstr LISTENING | findstr 0.0.0.0:$port"
  if ($line) {
    $procId = [int](($line | Select-Object -First 1) -split '\s+' | Where-Object { $_ } | Select-Object -Last 1)
    Stop-Process -Id $procId -Force
    Write-Host "Stopped the copy on port $port"
  }
}

function Wait-Health($port) {
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null; return } catch { Start-Sleep -Seconds 2 }
  }
  throw "The copy on port $port did not start. See $logDir"
}

if ($Stop) {
  cmd /c "docker compose --profile lb stop lb"
  Stop-Port 8081
  Stop-Port 8082
  return
}

if (cmd /c "netstat -ano | findstr LISTENING | findstr 0.0.0.0:8080") {
  throw "Port 8080 is busy. Stop the single backend first; Nginx needs this port."
}
if (-not $NoBuild) { .\mvnw.cmd -q -DskipTests package }
$jar = Get-ChildItem target\backend-*.jar | Select-Object -First 1
New-Item -ItemType Directory -Force $logDir | Out-Null

# Copy "a" starts alone first so Flyway checks the migrations only once.
foreach ($copy in @(@{ Name = 'a'; Port = 8081 }, @{ Name = 'b'; Port = 8082 })) {
  Start-Process java -WindowStyle Hidden -ArgumentList @('-jar', $jar.FullName, '--spring.profiles.active=postgres',
    "--server.port=$($copy.Port)", "--broker.node-name=$($copy.Name)") `
    -RedirectStandardOutput "$logDir\copy-$($copy.Name).log" -RedirectStandardError "$logDir\copy-$($copy.Name).err.log"
  Wait-Health $copy.Port
  Write-Host "Copy $($copy.Name) is up on port $($copy.Port)"
}

cmd /c "docker compose --profile lb up -d lb"
Wait-Health 8080
Write-Host "Nginx is up on 8080. The site at http://localhost:3001 now goes through it."
