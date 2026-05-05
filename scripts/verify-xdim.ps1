$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '..\docs\X-DIMENSIONAL-AI-DIRECTIVE.md'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)
$lines = $text -split "`r`n"
"Total lines: $($lines.Count)"
""
"=== Major headings ==="
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^# (PART|FINAL)') {
        "{0,4}: {1}" -f ($i + 1), $lines[$i]
    }
}
""
"=== Lines around expected --- separator zones ==="
$probes = @(
    @{ name = '§3.5 -> PART IV'; needle = '# PART IV' },
    @{ name = 'PART X -> PART XI'; needle = '# PART XI' },
    @{ name = '§11.8 -> FINAL';   needle = '# FINAL AXIOM' }
)
foreach ($p in $probes) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith($p.needle)) {
            "--- $($p.name) (line $($i + 1)) ---"
            $start = [Math]::Max(0, $i - 4)
            for ($j = $start; $j -le $i + 1 -and $j -lt $lines.Count; $j++) {
                "{0,4}: |{1}|" -f ($j + 1), $lines[$j]
            }
            ""
            break
        }
    }
}
