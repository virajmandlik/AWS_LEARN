$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$dir = $PSScriptRoot
$targets = @(
    @{ svg = "10-cloudwatch-logs-hierarchy.svg";  w = 1200; h = 720 },
    @{ svg = "11-eventbridge-bus-rules.svg";      w = 1200; h = 720 },
    @{ svg = "12-cloudtrail-events.svg";          w = 1200; h = 720 }
)
foreach ($t in $targets) {
    $svgPath = Join-Path $dir $t.svg
    $pngPath = [System.IO.Path]::ChangeExtension($svgPath, ".png")
    $svgUri  = "file:///" + ($svgPath -replace '\\', '/')
    Write-Host ("Retry: {0} ({1}x{2})" -f $t.svg, $t.w, $t.h)

    # Use a unique temp profile to avoid Edge sharing state
    $profile = Join-Path $env:TEMP ("edgeconv-" + [System.IO.Path]::GetRandomFileName())
    $args = @(
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--virtual-time-budget=8000",
        ("--user-data-dir=" + $profile),
        ("--window-size={0},{1}" -f $t.w, $t.h),
        "--default-background-color=00FFFFFF",
        ("--screenshot=" + $pngPath),
        $svgUri
    )
    $p = Start-Process -FilePath $edge -ArgumentList $args -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(45000)) {
        Write-Host "  Timed out at 45s, killing..."
        try { $p.Kill() } catch {}
    }
    if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}
Get-ChildItem -Path $dir -Filter "*.png" | Where-Object { $_.Name -match '^1[012]-' } | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table
