[CmdletBinding()]
param([string]$Output = "$PSScriptRoot\..\dist\package-windows")
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
New-Item -ItemType Directory -Force -Path $Output, "$Output\config", "$Output\data", "$Output\dist", "$Output\node_modules" | Out-Null
Copy-Item "$root\apps\agent\dist\*" "$Output\dist" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$root\apps\agent\node_modules\zod" "$Output\node_modules\zod" -Recurse -Force
New-Item -ItemType Directory -Force -Path "$Output\node_modules\@lazybot\contracts" | Out-Null
Copy-Item "$root\packages\contracts\src" "$Output\node_modules\@lazybot\contracts\src" -Recurse -Force
Set-Content "$Output\node_modules\@lazybot\contracts\package.json" '{"name":"@lazybot/contracts","private":true,"type":"module","exports":"./src/index.ts"}' -Encoding UTF8
if (Test-Path "$root\apps\agent\node_modules\.cache\ms-playwright") { Copy-Item "$root\apps\agent\node_modules\.cache\ms-playwright" "$Output\playwright" -Recurse -Force }
Copy-Item "$PSScriptRoot\..\packaging\lazybot-agent.xml" $Output -Force
@('@echo off', 'node "%~dp0dist\src\cli\main.js" %*') | Set-Content "$Output\lazybot-agent.cmd" -Encoding ASCII
# Task Scheduler requires the XML payload to be UTF-16, including its BOM.
$xmlTemp = Join-Path $Output '.lazybot-agent.xml.utf16'
(Get-Content "$Output\lazybot-agent.xml" -Raw).Replace('encoding="UTF-8"', 'encoding="UTF-16"') | Set-Content $xmlTemp -Encoding Unicode
Move-Item $xmlTemp "$Output\lazybot-agent.xml" -Force
Write-Output "Package created at $Output"
