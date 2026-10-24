param([string]$OutputDirectory = 'release')
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
$outputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path
$files = @("CCB-Portable-$version.exe", "CCB-Setup-$version.exe", "CCB-$version-win.zip", 'win-unpacked/CCB.exe')
foreach ($name in $files) {
    $file = Get-Item -LiteralPath (Join-Path $outputPath $name)
    if ($file.Length -eq 0) { throw "Empty release artifact: $name" }
    if ($file.Extension -eq '.exe') {
        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature ($($signature.Status)): $name" }
    }
}

# ZIP 必须包含本次已验证签名的应用，拒绝混入旧包。
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
        if ($zipHash -ne $appHash) { throw "ZIP differs from the signed application: $entryName" }
    }
} finally { $zip.Dispose() }
Write-Output "Release signatures and ZIP identity verified: $version"
