# Replace mangled bytes (control chars + U+FFFD replacement chars) with safe ASCII
$dir = $PSScriptRoot
$files = "08-cloudwatch-overview.svg","09-cloudwatch-alarm-lifecycle.svg","10-cloudwatch-logs-hierarchy.svg","11-eventbridge-bus-rules.svg","12-cloudtrail-events.svg","13-xray-trace-flow.svg","14-codeguru-overview.svg","15-aws-health-dashboard.svg","16-monitoring-summary.svg"

foreach ($f in $files) {
    $p = Join-Path $dir $f
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $out = New-Object System.Collections.Generic.List[byte]
    $i = 0
    $changes = 0
    while ($i -lt $bytes.Length) {
        $b = $bytes[$i]
        # Replace U+FFFD sequence (EF BF BD) with '*'
        if ($i + 2 -lt $bytes.Length -and $b -eq 0xEF -and $bytes[$i+1] -eq 0xBF -and $bytes[$i+2] -eq 0xBD) {
            [void]$out.Add(0x2A) # '*'
            $i += 3
            $changes++
            continue
        }
        # Replace control chars (truncated multi-byte UTF-8)
        if ($b -lt 0x20 -and $b -ne 0x09 -and $b -ne 0x0A -and $b -ne 0x0D) {
            if ($b -eq 0x14) { [void]$out.Add(0x2D) } # em-dash -> '-'
            elseif ($b -eq 0x13) { [void]$out.Add(0x2B) } # check -> '+'
            else { [void]$out.Add(0x3F) } # '?'
            $i++
            $changes++
            continue
        }
        # Strip stray high bytes that aren't valid UTF-8 starts
        if ($b -gt 0x7F -and $b -lt 0xC2) {
            if ($b -eq 0xB7) { [void]$out.Add(0x2E) } # middle dot -> '.'
            elseif ($b -eq 0x92) { [void]$out.Add(0x3E) } # right arrow -> '>'
            elseif ($b -eq 0x90) { [void]$out.Add(0x3C) } # left arrow -> '<'
            elseif ($b -eq 0xA5) { [void]$out.Add(0x3D) } # geq -> '='
            else { [void]$out.Add(0x3F) }
            $i++
            $changes++
            continue
        }
        [void]$out.Add($b)
        $i++
    }
    [System.IO.File]::WriteAllBytes($p, $out.ToArray())
    Write-Host "$f : $changes bytes replaced -> $($out.Count) total"
}
