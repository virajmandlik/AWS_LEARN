$dir = $PSScriptRoot
$files = @(
  "08-cloudwatch-overview.svg","09-cloudwatch-alarm-lifecycle.svg","10-cloudwatch-logs-hierarchy.svg",
  "11-eventbridge-bus-rules.svg","12-cloudtrail-events.svg","13-xray-trace-flow.svg",
  "14-codeguru-overview.svg","15-aws-health-dashboard.svg","16-monitoring-summary.svg"
)

foreach ($f in $files) {
    $p = Join-Path $dir $f
    if (-not (Test-Path $p)) { continue }
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $out = New-Object System.Collections.Generic.List[byte]
    $i = 0
    $changes = 0
    while ($i -lt $bytes.Length) {
        $b = $bytes[$i]
        # Replace 3-byte UTF-8 replacement char (EF BF BD) with '*'
        if ($i + 2 -lt $bytes.Length -and $b -eq 0xEF -and $bytes[$i+1] -eq 0xBF -and $bytes[$i+2] -eq 0xBD) {
            $out.Add(0x2A) | Out-Null  # '*'
            $i += 3
            $changes++
            continue
        }
        # Truncated em-dash (0x14) -> '-'
        if ($b -eq 0x14) {
            $out.Add(0x2D) | Out-Null
            $i++
            $changes++
            continue
        }
        # Truncated check (0x13) -> '+'
        if ($b -eq 0x13) {
            $out.Add(0x2B) | Out-Null
            $i++
            $changes++
            continue
        }
        $out.Add($b) | Out-Null
        $i++
    }
    [System.IO.File]::WriteAllBytes($p, $out.ToArray())
    Write-Host ("Fixed {0}: {1} byte substitutions, new size: {2}" -f $f, $changes, $out.Count)
}
