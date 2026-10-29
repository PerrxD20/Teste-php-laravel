[CmdletBinding()]
param([string]$OutputDirectory = "build/native/sensors")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $project = Join-Path $root "native/sensors/Mello.SensorCollector.csproj"
  $output = if ([IO.Path]::IsPathRooted($OutputDirectory)) { [IO.Path]::GetFullPath($OutputDirectory) } else { [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory)) }
  # Remove only known obsolete generated compatibility libraries from an older publish.
  foreach ($obsolete in @('Mono.Posix.NETStandard.dll', 'MonoPosixHelper.dll', 'libMonoPosixHelper.dll')) {
    $path = Join-Path $output $obsolete
    if (Test-Path $path) { Remove-Item $path -Force }
  }
  $sdk = (& dotnet --version).Trim()
  if ($LASTEXITCODE -ne 0 -or [int]($sdk.Split('.')[0]) -lt 10) { throw '.NET SDK 10 is required to build the native sensor collector.' }
  & dotnet restore $project --runtime win-x64 --locked-mode
  if ($LASTEXITCODE -ne 0) { throw 'Sensor dependency restoration failed.' }
  & dotnet publish $project --no-restore --configuration Release --runtime win-x64 --self-contained true --output $output
  if ($LASTEXITCODE -ne 0) { throw 'Sensor collector publish failed.' }
  $licenses = Join-Path $output 'licenses'
  New-Item -ItemType Directory -Force $licenses | Out-Null
  $assets = Get-Content (Join-Path $root 'native/sensors/obj/project.assets.json') -Raw | ConvertFrom-Json
  $folders = @($assets.packageFolders.PSObject.Properties.Name)
  $index = @()
  foreach ($entry in $assets.libraries.PSObject.Properties) {
    if ($entry.Value.type -ne 'package') { continue }
    $id, $version = $entry.Name.Split('/', 2)
    $directory = $null
    foreach ($folder in $folders) {
      $candidate = Join-Path $folder $entry.Value.path
      if (Test-Path $candidate) { $directory = $candidate; break }
    }
    if (!$directory) { throw "Restored dependency metadata missing: $($entry.Name)" }
    $destination = Join-Path $licenses ("nuget/" + $entry.Value.path)
    New-Item -ItemType Directory -Force $destination | Out-Null
    $spec = Get-ChildItem $directory -Filter '*.nuspec' | Select-Object -First 1
    if (!$spec) { throw "NuGet package manifest missing: $($entry.Name)" }
    Copy-Item $spec.FullName $destination -Force
    [xml]$manifest = Get-Content $spec.FullName -Raw
    $metadata = $manifest.SelectSingleNode("//*[local-name()='metadata']")
    $license = $metadata.SelectSingleNode("*[local-name()='license']")
    foreach ($file in Get-ChildItem $directory -File) {
      if ($file.Name -match '(?i)^(licen[sc]e|notice|third.party.notices|copying|patents)') { Copy-Item $file.FullName $destination -Force }
    }
    if ($license -and $license.type -eq 'file') {
      $file = [IO.Path]::GetFullPath((Join-Path $directory $license.InnerText))
      if (!$file.StartsWith([IO.Path]::GetFullPath($directory) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Invalid package license path: $id" }
      if (!(Test-Path $file)) { throw "Package license file missing: $id" }
      Copy-Item $file $destination -Force
    }
    $index += [ordered]@{
      id = $id; version = $version
      sha512 = $entry.Value.sha512
      license = $(if ($license) { $license.InnerText } else { $metadata.SelectSingleNode("*[local-name()='licenseUrl']").InnerText })
      authors = $metadata.SelectSingleNode("*[local-name()='authors']").InnerText
      copyright = $metadata.SelectSingleNode("*[local-name()='copyright']").InnerText
      runtimeExcluded = $id -eq 'Mono.Posix.NETStandard'
    }
  }
  $index | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $licenses 'NuGet-Packages.json') -Encoding utf8
  $config = Get-Content (Join-Path $output 'Mello.SensorCollector.runtimeconfig.json') -Raw | ConvertFrom-Json
  $runtimeVersion = @($config.runtimeOptions.includedFrameworks | Where-Object name -eq 'Microsoft.NETCore.App')[0].version
  $runtime = $null
  foreach ($folder in $folders) {
    $candidate = Join-Path $folder "microsoft.netcore.app.runtime.win-x64/$runtimeVersion"
    if (Test-Path $candidate) { $runtime = $candidate; break }
  }
  if (!$runtime) { throw 'Self-contained .NET runtime license package was not found.' }
  $runtimeNotices = Join-Path $licenses 'dotnet-runtime'
  New-Item -ItemType Directory -Force $runtimeNotices | Out-Null
  foreach ($name in @('LICENSE.TXT', 'THIRD-PARTY-NOTICES.TXT')) { Copy-Item (Join-Path $runtime $name) $runtimeNotices -Force }
  Copy-Item (Join-Path $runtime 'LICENSE.TXT') (Join-Path $licenses 'Microsoft-MIT.txt') -Force
  foreach ($name in @('Mello.SensorCollector.exe', 'Mello.SensorCollector.dll', 'LibreHardwareMonitorLib.dll', 'coreclr.dll')) {
    if (!(Test-Path (Join-Path $output $name))) { throw "Native collector output missing: $name" }
  }
  foreach ($name in @('Mono.Posix.NETStandard.dll', 'MonoPosixHelper.dll', 'libMonoPosixHelper.dll')) {
    if (Test-Path (Join-Path $output $name)) { throw "Unused Unix compatibility asset unexpectedly published: $name" }
  }
  Write-Host "Self-contained Windows sensor collector ready: $output"
} finally { Pop-Location }
