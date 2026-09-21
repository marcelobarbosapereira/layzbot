[CmdletBinding()]
param([string]$Output = "$PSScriptRoot\..\dist\package-windows")
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
New-Item -ItemType Directory -Force -Path $Output, "$Output\config", "$Output\data" | Out-Null
Copy-Item "$root\apps\agent\dist\*" $Output -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path "$root\apps\agent\node_modules\.cache\ms-playwright") { Copy-Item "$root\apps\agent\node_modules\.cache\ms-playwright" "$Output\playwright" -Recurse -Force }
Copy-Item "$PSScriptRoot\..\packaging\lazybot-agent.xml" $Output -Force
Write-Output "Package created at $Output"
