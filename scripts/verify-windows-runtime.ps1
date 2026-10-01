#Requires -Version 5.1
<#
.SYNOPSIS
Verifies a downloaded Microsoft x64 redistributable against the runtime pin.
.DESCRIPTION
Requires the exact SHA-256, a trusted Microsoft Corporation Authenticode
signature, and the pinned file version. Does not download, extract, or execute
the installer. This script and its local helper are embedded in the NSIS bundle.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-runtime-common.ps1')

$pin = Read-DfVcManifest $ManifestPath
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).ProviderPath
Assert-DfVcInstaller $InstallerPath $pin
Write-Host "Verified Microsoft x64 redistributable $($pin.version): SHA-256, trusted signature, and file version match the pin."
