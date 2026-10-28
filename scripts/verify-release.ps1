param([string]$OutputDirectory = 'release', [switch]$AllowUnsigned)
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
if ($AllowUnsigned -and $version -ne '1.5.1') { throw 'Unsigned exception is restricted to 1.5.1' }
$outputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path
$files = @("CCB-Portable-$version.exe", "CCB-Setup-$version.exe", "CCB-$version-win.zip", 'win-unpacked/CCB.exe')
foreach ($name in $files) {
    $file = Get-Item -LiteralPath (Join-Path $outputPath $name)
    if ($file.Length -eq 0) { throw "Empty release artifact: $name" }
    if ($file.Extension -eq '.exe') {
        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne 'Valid' -and !($AllowUnsigned -and $signature.Status -eq 'NotSigned')) {
            throw "Invalid Authenticode signature ($($signature.Status)): $name"
        }
    }
}

# Verify that the ZIP contains the current application, not stale output.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $outputPath "CCB-$version-win.zip"))
try {
    foreach ($entryName in @('CCB.exe', 'resources/app.asar')) {
        $entry = $zip.GetEntry($entryName)
        if (!$entry) { throw "ZIP does not contain $entryName" }
        $stream = $entry.Open()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $zipHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $sha.Dispose() }
        $appHash = (Get-FileHash -LiteralPath (Join-Path $outputPath "win-unpacked/$entryName") -Algorithm SHA256).Hash
        if ($zipHash -ne $appHash) { throw "ZIP differs from the verified application: $entryName" }
    }
} finally { $zip.Dispose() }
Write-Output "Release signature policy and ZIP identity verified: $version (unsigned exception: $AllowUnsigned)"
