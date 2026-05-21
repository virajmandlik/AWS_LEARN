$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) {
    $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edge)) {
    Write-Error "Edge not found"
    exit 1
}

$dir = $PSScriptRoot
$svgs = Get-ChildItem -Path $dir -Filter "*.svg"
foreach ($svg in $svgs) {
    $png = [System.IO.Path]::ChangeExtension($svg.FullName, ".png")
    Write-Host "Converting $($svg.Name) -> $([System.IO.Path]::GetFileName($png))"
    $svgUri = "file:///" + ($svg.FullName -replace '\\', '/')
    & $edge --headless=new --disable-gpu --hide-scrollbars --window-size=1200,700 --default-background-color=00FFFFFF --screenshot="$png" $svgUri 2>$null
    Start-Sleep -Milliseconds 500
}
Write-Host "Done. PNG files in $dir"
Get-ChildItem -Path $dir -Filter "*.png" | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}}
