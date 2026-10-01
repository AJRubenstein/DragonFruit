#Requires -Version 5.1
<#
.SYNOPSIS
Verify that Windows installers ship the pinned CRT beside the application.
.DESCRIPTION
Inspects actual NSIS/MSI payloads before publication, without installing them.
The updater ships these same installers. Requires 7-Zip for NSIS extraction.
#>
[CmdletBinding()]
param(
    [string]$BundleDirectory = (Join-Path $PSScriptRoot '../src-tauri/target/x86_64-pc-windows-msvc/release/bundle'),
    [ValidateSet('nsis', 'msi')][string[]]$Formats = @('nsis', 'msi')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Windows installer verification requires Windows.'
}
$runtimeDirectory = Join-Path $PSScriptRoot '../src-tauri/windows-resources/vc-runtime'
$expected = @(Get-ChildItem -LiteralPath $runtimeDirectory -Filter '*.dll' -File)
if ($expected.Count -eq 0) { throw 'No prepared CRT is available for bundle verification.' }
$work = Join-Path ([IO.Path]::GetTempPath()) ('dragonfruit-bundle-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    foreach ($format in $Formats) {
        $pattern = if ($format -eq 'nsis') { '*-setup.exe' } else { '*.msi' }
        $installers = @(Get-ChildItem -LiteralPath (Join-Path $BundleDirectory $format) -Filter $pattern -File)
        if ($installers.Count -eq 0) { throw "No $format installer found in $BundleDirectory" }
        foreach ($installer in $installers) {
            $destination = Join-Path $work ([Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $destination | Out-Null
            if ($format -eq 'nsis') {
                & 7z.exe x $installer.FullName "-o$destination" -y
                if ($LASTEXITCODE -ne 0) { throw "Could not unpack NSIS installer: $($installer.FullName)" }
            } else {
                # Administrative extraction only; never /i or a nested MSI install.
                $log = Join-Path $work 'msi-extraction.log'
                $process = Start-Process msiexec.exe -ArgumentList "/a `"$($installer.FullName)`" /qn TARGETDIR=`"$destination`" /L*v `"$log`"" -Wait -PassThru
                if ($process.ExitCode -ne 0) {
                    Get-Content -LiteralPath $log -ErrorAction SilentlyContinue | Write-Host
                    throw "Could not unpack MSI installer (exit $($process.ExitCode)): $($installer.FullName)"
                }
            }
            $executables = @(Get-ChildItem -LiteralPath $destination -Recurse -File -Filter 'dragonfruit-desktop.exe')
            if ($executables.Count -ne 1) { throw "Expected one DragonFruit executable in $($installer.Name)." }
            $appDirectory = $executables[0].DirectoryName
            foreach ($dll in $expected) {
                $packaged = Join-Path $appDirectory $dll.Name
                if (-not (Test-Path -LiteralPath $packaged -PathType Leaf)) {
                    throw "$($installer.Name) is missing $($dll.Name) BESIDE dragonfruit-desktop.exe."
                }
                if ((Get-FileHash -LiteralPath $packaged -Algorithm SHA256).Hash -ne
                    (Get-FileHash -LiteralPath $dll.FullName -Algorithm SHA256).Hash) {
                    throw "$($installer.Name) contains a stale or modified $($dll.Name)."
                }
            }
            & (Join-Path $PSScriptRoot 'verify-windows-runtime.ps1') -RuntimeDirectory $appDirectory
            Write-Host "[windows-runtime] $($installer.Name): $($expected.Count) matching CRT DLLs at the executable root; native probe passed."
        }
    }
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
