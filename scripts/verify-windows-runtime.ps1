#Requires -Version 5.1
<#
.SYNOPSIS
Compile and run a native C++ mutex probe against the staged app-local x64 CRT.
.DESCRIPTION
Checks actual DLL loading and locking, not just presence of files. This catches
old-runtime/new-toolset failures like #683 before publishing Windows bundles.
Uses Visual Studio's x64 tools and only writes into a temporary directory.
#>
[CmdletBinding()]
param(
    [string]$RuntimeDirectory = (Join-Path $PSScriptRoot '../src-tauri/windows-resources/vc-runtime')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'The native CRT smoke check requires Windows and the MSVC x64 build tools.'
}
$RuntimeDirectory = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-runtime.json') -Raw | ConvertFrom-Json
$msvcp = Get-Item -LiteralPath (Join-Path $RuntimeDirectory 'msvcp140.dll')
$version = $msvcp.VersionInfo
$actualVersion = '{0}.{1}.{2}.{3}' -f $version.FileMajorPart, $version.FileMinorPart, $version.FileBuildPart, $version.FilePrivatePart
if ($actualVersion -ne $pin.version) {
    throw "Staged CRT version $actualVersion differs from the pin $($pin.version). Prepare it again."
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'vswhere.exe is missing; install the Visual Studio C++ x64 build tools.'
}
$vcvars = @(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC\Auxiliary\Build\vcvars64.bat')
if ($LASTEXITCODE -ne 0 -or $vcvars.Count -ne 1) {
    throw 'Could not locate exactly one vcvars64.bat for the latest installed C++ toolset.'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('dragonfruit-crt-smoke-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    Get-ChildItem -LiteralPath $RuntimeDirectory -Filter '*.dll' -File | Copy-Item -Destination $work
    $source = @'
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <initializer_list>
#include <mutex>
#include <string>

// Modern MSVC headers constexpr-initialize this mutex. An older MSVCP140 can
// load successfully yet access-violate on the first lock; #683 exposed an old CRT.
std::mutex gate;

int wmain() {
    wchar_t exe[32768];
    DWORD size = GetModuleFileNameW(nullptr, exe, 32768);
    if (!size || size >= 32768) return 1;
    std::wstring directory(exe, size);
    directory.resize(directory.find_last_of(L"\\/") + 1);
    for (const wchar_t* name : {L"msvcp140.dll", L"vcruntime140.dll"}) {
        HMODULE module = GetModuleHandleW(name);
        wchar_t loaded[32768];
        size = module ? GetModuleFileNameW(module, loaded, 32768) : 0;
        if (!size || size >= 32768) return 2;
        if (_wcsicmp(loaded, (directory + name).c_str()) != 0) {
            std::fwprintf(stderr, L"Unexpected system CRT: %ls\n", loaded);
            return 3;
        }
        std::wprintf(L"App-local CRT: %ls\n", loaded);
    }
    {
        std::lock_guard<std::mutex> lock(gate);
    }
    if (!gate.try_lock()) return 4;
    gate.unlock();
    std::wprintf(L"CRT smoke: app-local loading, mutex lock/unlock and try_lock passed\n");
    return 0;
}
'@
    $sourcePath = Join-Path $work 'crt-smoke.cpp'
    [IO.File]::WriteAllText($sourcePath, $source, [Text.Encoding]::ASCII)
    $batch = @"
@echo off
chcp 65001 >nul
call "$($vcvars[0])" >nul
if errorlevel 1 exit /b %errorlevel%
cd /d "$work"
set VCToolsRedistDir > redist-environment.txt
cl.exe /nologo /Bv /std:c++17 /EHsc /MD /O2 /W4 /WX crt-smoke.cpp /Fe:crt-smoke.exe
exit /b %errorlevel%
"@
    $batchPath = Join-Path $work 'compile.cmd'
    [IO.File]::WriteAllText($batchPath, $batch, (New-Object Text.UTF8Encoding($false)))
    & $env:ComSpec /d /c $batchPath
    if ($LASTEXITCODE -ne 0) { throw "CRT probe compilation failed: $LASTEXITCODE" }
    $redistEnvironment = Get-Content -LiteralPath (Join-Path $work 'redist-environment.txt')
    $redistLine = @($redistEnvironment | Where-Object { $_.StartsWith('VCToolsRedistDir=', [StringComparison]::OrdinalIgnoreCase) })
    if ($redistLine.Count -ne 1) { throw 'The selected MSVC toolset did not report VCToolsRedistDir.' }
    $redistRoot = $redistLine[0].Substring('VCToolsRedistDir='.Length)
    $toolsetRuntime = @(Get-ChildItem -Path (Join-Path $redistRoot 'x64/Microsoft.VC*.CRT/msvcp140.dll') -File)
    if ($toolsetRuntime.Count -ne 1) { throw 'Could not identify the selected toolset x64 redistributable.' }
    $required = $toolsetRuntime[0].VersionInfo
    $requiredVersion = [version]('{0}.{1}.{2}.{3}' -f $required.FileMajorPart, $required.FileMinorPart, $required.FileBuildPart, $required.FilePrivatePart)
    if ([version]$actualVersion -lt $requiredVersion) {
        throw "Pinned CRT $actualVersion is older than the selected MSVC redistributable $requiredVersion. Update the pin before bundling."
    }
    Write-Host "[windows-runtime] Selected toolset CRT $requiredVersion; bundled CRT $actualVersion."
    & (Join-Path $work 'crt-smoke.exe')
    if ($LASTEXITCODE -ne 0) {
        throw "App-local CRT $actualVersion failed the native probe (exit $LASTEXITCODE). Do not publish this bundle."
    }
    Write-Host "[windows-runtime] Native compatibility smoke passed with CRT $actualVersion."
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
