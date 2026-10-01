#Requires -Version 5.1
<#
.SYNOPSIS
Verify Windows installers do not redistribute the Microsoft runtime.
.DESCRIPTION
Extracts NSIS/MSI payloads without installing them, rejects CRT/redistributable
payloads, and checks the installer-side prerequisite guards and InetC notice.
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
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-runtime.json') -Raw | ConvertFrom-Json

function Get-MsiValue($Database, [string]$Query) {
    $view = $Database.OpenView($Query)
    try {
        $view.Execute()
        $record = $view.Fetch()
        if ($null -eq $record) { throw "Missing MSI prerequisite metadata: $Query" }
        return $record.StringData(1)
    } finally { $view.Close() }
}

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
                $windowsInstaller = New-Object -ComObject WindowsInstaller.Installer
                $database = $windowsInstaller.OpenDatabase($installer.FullName, 0)
                $minimum = Get-MsiValue $database 'SELECT `MinVersion` FROM `Signature` WHERE `Signature` = ''DfVcMsvcpSearch'''
                if ([version]$minimum -ne [version]$pin.version) { throw "MSI runtime floor $minimum differs from pin $($pin.version)." }
                $type = Get-MsiValue $database 'SELECT `Type` FROM `CustomAction` WHERE `Action` = ''DfRequireVcRuntime'''
                if ([int]$type -ne 19) { throw 'MSI prerequisite must be a blocking error action, not an executable installer.' }
                foreach ($sequence in @('InstallUISequence', 'InstallExecuteSequence')) {
                    $search = Get-MsiValue $database "SELECT ``Sequence`` FROM ``$sequence`` WHERE ``Action`` = 'AppSearch'"
                    $guard = Get-MsiValue $database "SELECT ``Sequence`` FROM ``$sequence`` WHERE ``Action`` = 'DfRequireVcRuntime'"
                    if ([int]$guard -le [int]$search) { throw "MSI prerequisite check runs before AppSearch in $sequence." }
                }
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($database)
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($windowsInstaller)
            }
            $files = @(Get-ChildItem -LiteralPath $destination -Recurse -File)
            $forbidden = @($files | Where-Object {
                $_.Name -match '^(msvcp\d+.*|vcruntime\d+.*|concrt\d+.*|vcamp\d+.*|vccorlib\d+.*|vcomp\d+.*)\.dll$' -or
                $_.Name -match '^(VC_redist.*\.exe|vc_runtime.*\.msi)$'
            })
            if ($forbidden.Count -gt 0) {
                throw "Microsoft runtime payloads must not ship in $($installer.Name): $($forbidden.Name -join ', ')"
            }
            $executables = @($files | Where-Object Name -eq 'dragonfruit-desktop.exe')
            if ($executables.Count -ne 1) { throw "Expected one DragonFruit executable in $($installer.Name)." }
            if ($format -eq 'nsis') {
                foreach ($name in @('INetC.dll', 'verify-windows-runtime.ps1', 'windows-runtime-common.ps1', 'windows-runtime.json')) {
                    $matches = @($files | Where-Object Name -ieq $name)
                    if ($matches.Count -ne 1) { throw "$($installer.Name) must include one prerequisite helper $name." }
                    if ($name -eq 'windows-runtime.json') {
                        $packagedPin = Get-Content -LiteralPath $matches[0].FullName -Raw | ConvertFrom-Json
                        if ($packagedPin.version -ne $pin.version -or $packagedPin.url -ne $pin.url -or $packagedPin.sha256 -ne $pin.sha256) {
                            throw 'NSIS prerequisite metadata differs from the checked pin.'
                        }
                    }
                }
            }
            $notice = Join-Path $executables[0].DirectoryName 'licenses/InetC.txt'
            $sourceNotice = Join-Path $PSScriptRoot 'inetc-license.txt'
            if (-not (Test-Path -LiteralPath $notice) -or
                (Get-FileHash -LiteralPath $notice).Hash -ne (Get-FileHash -LiteralPath $sourceNotice).Hash) {
                throw "$($installer.Name) is missing the unmodified InetC license notice."
            }
            Write-Host "[windows-runtime] $($installer.Name): prerequisite-only payload verified; no Microsoft CRT or redistributable bundled."
        }
    }
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
