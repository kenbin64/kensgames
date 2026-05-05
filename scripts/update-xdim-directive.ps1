# scripts/update-xdim-directive.ps1
# One-shot updater for X-DIMENSIONAL-AI-DIRECTIVE.md (3.0 additions).
# Purely additive: inserts new sections at known anchor points; no existing prose is removed.
# Run from any cwd; resolves target by repo path.

param(
    [string]$Target = "$PSScriptRoot\..\docs\X-DIMENSIONAL-AI-DIRECTIVE.md",
    [string]$InsertsDir = "$PSScriptRoot\xdim-3.0-inserts"
)

$ErrorActionPreference = 'Stop'
$crlf = "`r`n"

if (-not (Test-Path $Target)) { throw "Target not found: $Target" }
if (-not (Test-Path $InsertsDir)) { throw "Inserts dir not found: $InsertsDir" }

$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Insert([string]$name) {
    $p = Join-Path $InsertsDir $name
    if (-not (Test-Path $p)) { throw "Insert file missing: $p" }
    # Read raw as UTF-8, normalise to CRLF
    $raw = [System.IO.File]::ReadAllText($p, $utf8)
    $raw = $raw -replace "`r`n", "`n"
    $raw = $raw -replace "`n", $crlf
    return $raw.TrimEnd("`r","`n")
}

# Read original (UTF-8) and split on CRLF
$orig = [System.IO.File]::ReadAllText($Target, [System.Text.Encoding]::UTF8)
# normalise to CRLF in case of mixed endings
$orig = ($orig -replace "`r`n", "`n") -replace "`n", $crlf
$lines = $orig -split "`r`n"

function Splice-AtAnchor([string[]]$arr, [string]$anchorRegex, [string]$payload, [bool]$before) {
    $idx = -1
    for ($i = 0; $i -lt $arr.Count; $i++) {
        if ($arr[$i] -match $anchorRegex) { $idx = $i; break }
    }
    if ($idx -lt 0) { throw "Anchor not found: $anchorRegex" }
    $insertAt = if ($before) { $idx } else { $idx + 1 }
    $payloadLines = $payload -split "`r`n"
    $head = $arr[0..($insertAt - 1)]
    if ($insertAt -ge $arr.Count) {
        return @($head + $payloadLines)
    } else {
        $tail = $arr[$insertAt..($arr.Count - 1)]
        return @($head + $payloadLines + $tail)
    }
}

# 1. Replace the version/preamble block (lines 1..6) with new preamble + PART 0
$preamble = Read-Insert 'preamble.md'
# Find the original "# PART I — DEFINITIONS" line to know where to cut.
$partIidx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^# PART I — DEFINITIONS') { $partIidx = $i; break }
}
if ($partIidx -lt 0) { throw "Could not find '# PART I — DEFINITIONS'" }
# New prefix = preamble + blank + "# PART I — DEFINITIONS"
$newPrefix = ($preamble -split "`r`n") + @('', '# PART I — DEFINITIONS')
$tail = $lines[($partIidx + 1)..($lines.Count - 1)]
$lines = @($newPrefix + $tail)

# 2. Insert Ax 2.14 + 2.15 right after the closing "---" of Ax 2.13
$ax2_14_15 = Read-Insert 'axioms-2.14-2.15.md'
# We anchor after the SECOND consecutive "---" pair following "## Ax 2.13"
$ax213idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^## Ax 2\.13') { $ax213idx = $i; break }
}
if ($ax213idx -lt 0) { throw "Could not find Ax 2.13" }
# Find first '---' after Ax 2.13
$hr1 = -1
for ($i = $ax213idx; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -eq '---') { $hr1 = $i; break }
}
# Splice the new axioms block AFTER that '---'
$payloadLines = $ax2_14_15 -split "`r`n"
$head = $lines[0..$hr1]
$tail = $lines[($hr1 + 1)..($lines.Count - 1)]
# add a blank line + the payload + blank line, then keep original (which is another '---')
$lines = @($head + @('') + $payloadLines + @('') + $tail)

# 3. Insert §3.5 The Four Canonical Expressions BEFORE "# PART IV — CONSTRAINTS"
$fourExpr = Read-Insert 'part3-four-expressions.md'
$lines = Splice-AtAnchor $lines '^# PART IV — CONSTRAINTS' ($fourExpr + $crlf + '---' + $crlf) $true

# 4. Insert §7.4 Schwarz Diamond BEFORE "# PART VIII — RUNTIME MODEL"
$schwarz = Read-Insert 'part7-schwarz-diamond.md'
$lines = Splice-AtAnchor $lines '^# PART VIII — RUNTIME MODEL' ($schwarz + $crlf + '---' + $crlf) $true

# 5. Insert PART XI — AI PARTICIPATION before the FINAL AXIOM block.
#    Anchor on the '---' that immediately precedes '# FINAL AXIOM'.
$partXI = Read-Insert 'part11-ai-participation.md'
$finalIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^# FINAL AXIOM') { $finalIdx = $i; break }
}
if ($finalIdx -lt 0) { throw "Could not find FINAL AXIOM" }
# Walk back to find the '---' immediately before it (skipping blank lines)
$hrIdx = -1
for ($i = $finalIdx - 1; $i -ge 0; $i--) {
    if ($lines[$i] -eq '---') { $hrIdx = $i; break }
    if ($lines[$i] -ne '') { break }
}
if ($hrIdx -lt 0) { throw "Could not locate '---' before FINAL AXIOM" }
$payloadLines = ($partXI + $crlf + '---') -split "`r`n"
$head = $lines[0..($hrIdx - 1)]
$tail = $lines[$hrIdx..($lines.Count - 1)]
$lines = @($head + $payloadLines + @('') + $tail)

# 6. Extend PART X — Enforcement bullets (idempotent: skip if already present).
$mustExtra = @(
    '- Read truth tables and best-option selection off the manifold''s inflection points (Ax 2.14); do not externally enumerate-and-score.'
    '- Honour phase boundaries when participating as AI (Ax 2.15 / HR-33); never act inside the realtime tick.'
    '- Disclose role, persona, provider, and transparency badge whenever acting as an AI participant (HR-35).'
    '- Treat Schwarz-Diamond unit cells as composable lattice nodes; obey the chirality-alternation rule in Ax 7.4.3.'
)
$neverExtra = @(
    '- Participate in the realtime tick loop (Ax 2.15 / HR-33).'
    '- Invent y-modifiers not present in the declared scenario (HR-34).'
    '- Hold provider keys client-side or pass them across the wire (HR-32).'
    '- Render z directly from any source other than the manifold (no DB row, no cache entry, no LLM hallucination).'
    '- Address the Schwarz Diamond as a storage or routing layer (Ax 7.4.4 / SUBSTRATES.md).'
)

function Insert-After-Last-In-Block([string[]]$arr, [string]$lastBulletRegex, [string[]]$extra, [string]$sentinelRegex) {
    # If sentinel already present, do nothing.
    foreach ($l in $arr) { if ($l -match $sentinelRegex) { return ,$arr } }
    $lastIdx = -1
    for ($i = 0; $i -lt $arr.Count; $i++) {
        if ($arr[$i] -match $lastBulletRegex) { $lastIdx = $i }
    }
    if ($lastIdx -lt 0) { throw "Could not find anchor for enforcement insert: $lastBulletRegex" }
    $head = $arr[0..$lastIdx]
    $tail = $arr[($lastIdx + 1)..($arr.Count - 1)]
    return ,@($head + $extra + $tail)
}

$lines = Insert-After-Last-In-Block $lines '^- Never store z independently' $mustExtra '^- Read truth tables and best-option selection off the manifold'
$lines = Insert-After-Last-In-Block $lines '^- Violate division constraints' $neverExtra '^- Participate in the realtime tick loop'

# 7. Update final stamp at very end of file
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^\*Version 2\.0 — April 2026 — Kenneth Bingham\*') {
        $lines[$i] = '*Version 3.0 — May 2026 — Kenneth Bingham*'
        break
    }
}

# Write back as UTF-8 (no BOM), CRLF
$out = ($lines -join $crlf)
if (-not $out.EndsWith($crlf)) { $out += $crlf }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($Target, $out, $utf8NoBom)

Write-Host ("Wrote {0} ({1} lines, {2} bytes)" -f $Target, $lines.Count, ([System.IO.File]::ReadAllBytes($Target).Length))
