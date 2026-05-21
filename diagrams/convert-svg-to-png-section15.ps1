$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) {
    Write-Error "Edge not found at $edge"
    exit 1
}

$dir = $PSScriptRoot
$targets = @(
    @{ svg = "17-vpc-architecture.svg";       w = 1200; h = 800 },
    @{ svg = "18-aws-ip-addressing.svg";      w = 1200; h = 780 },
    @{ svg = "19-igw-natgw-flow.svg";         w = 1200; h = 760 },
    @{ svg = "20-sg-vs-nacl.svg";             w = 1200; h = 800 },
    @{ svg = "21-vpc-peering-flowlogs.svg";   w = 1200; h = 800 },
    @{ svg = "22-vpc-endpoints.svg";          w = 1200; h = 800 },
    @{ svg = "23-privatelink.svg";            w = 1200; h = 760 },
    @{ svg = "24-dx-vpn.svg";                 w = 1200; h = 820 },
    @{ svg = "25-transit-gateway.svg";        w = 1200; h = 800 },
    @{ svg = "26-networking-summary.svg";     w = 1440; h = 900 }
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
Get-ChildItem -Path $dir -Filter "*.png" | Where-Object { $_.Name -match '^(1[7-9]|2[0-6])-' } | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table
