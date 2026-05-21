$c = Get-Content -Raw "$PSScriptRoot/../s3-notion-body.md"
$obj = @{
  command = 'replace_content'
  page_id = '3546ba73-1a34-813c-8ba5-eae92633d4d1'
  new_str = $c
}
$obj | ConvertTo-Json -Compress -Depth 5 |
  Set-Content -Encoding utf8 "$PSScriptRoot/../notion-replace-payload.json"
