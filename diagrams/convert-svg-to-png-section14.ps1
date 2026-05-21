$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) {
    Write-Error "Edge not found at $edge"
    exit 1
}

$dir = $PSScriptRoot
$targets = @(
    @{ svg = "08-cloudwatch-overview.svg";        w = 1200; h = 720 },
    @{ svg = "09-cloudwatch-alarm-lifecycle.svg"; w = 1200; h = 680 },
    @{ svg = "10-cloudwatch-logs-hierarchy.svg";  w = 1200; h = 720 },
    @{ svg = "11-eventbridge-bus-rules.svg";      w = 1200; h = 720 },
    @{ svg = "12-cloudtrail-events.svg";          w = 1200; h = 720 },
    @{ svg = "13-xray-trace-flow.svg";            w = 1200; h = 720 },
    @{ svg = "14-codeguru-overview.svg";          w = 1200; h = 600 },
    @{ svg = "15-aws-health-dashboard.svg";       w = 1200; h = 620 },
    @{ svg = "16-monitoring-summary.svg";         w = 1320; h = 770 }
)

foreach ($t in $targets) {
    $svgPath = Join-Path $dir $t.svg
    if (-not (Test-Path $svgPath)) { Write-Host "Missing $($t.svg)"; continue }
    $pngPath = [System.IO.Path]::ChangeExtension($svgPath, ".png")
    $svgUri  = "file:///" + ($svgPath -replace '\\', '/')
    Write-Host ("Converting {0} -> {1} ({2}x{3})" -f $t.svg, [System.IO.Path]::GetFileName($pngPath), $t.w, $t.h)

    $args = @(
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--virtual-time-budget=5000",
        ("--window-size={0},{1}" -f $t.w, $t.h),
        "--default-background-color=00FFFFFF",
        ("--screenshot=" + $pngPath),
        $svgUri
    )
    $p = Start-Process -FilePath $edge -ArgumentList $args -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(15000)) {
        Write-Host "  Timed out, killing..."
        try { $p.Kill() } catch {}
    }
    Start-Sleep -Milliseconds 200
}
Write-Host "Done."
Get-ChildItem -Path $dir -Filter "*.png" | Where-Object { $_.Name -match '^(08|09|1[0-6])-' } | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table
