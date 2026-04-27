param()

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$exts = @('.js','.html','.json','.py')
$excludeDirs = @('node_modules','lib','_archive','.git','assets','docs','dist','build')

function IsExcluded($path) {
  foreach ($d in $excludeDirs) {
    $needle = [IO.Path]::DirectorySeparatorChar + $d + [IO.Path]::DirectorySeparatorChar
    if ($path.Contains($needle)) { return $true }
    if ($path.Contains('/' + $d + '/')) { return $true }
  }
  return $false
}

# Strong signals — file is a manifold definition or substrate
$strongName = {
  param($n)
  ($n -ieq 'manifold.game.json') -or
  ($n -ieq 'manifold.portal.json') -or
  ($n -like '*_substrate.js') -or
  ($n -like 'manifold*.js') -or
  ($n -like 'substrate_*.js') -or
  ($n -ieq 'manifold_compiler.py') -or
  ($n -ieq 'manifold_core.py') -or
  ($n -ieq 'manifold_bridge.js')
}

# Paradigm signals — explicit references to the algebra
$xdimRegex = [regex]'(?i)(manifold\.(game|portal)\.json|manifold_bridge|manifold-core|manifold_core|KGManifold|KensGamesObserver|solve_for_y|solveForY|observe_manifold|observeManifold|update_manifold|updateManifold|"dimension"\s*:|dimension\s*\.\s*[xyz]\b|register_manifold|registerManifold|require_manifold|"substrate"\s*:|"lens"\s*:|"axiom"\s*:|z\s*=\s*x\s*\*\s*y)'

# Bundle / minified detector — files with these names get treated as opaque artifacts
$isBundleLike = {
  param($n)
  ($n -like '*.bundle.js') -or
  ($n -like '*.min.js') -or
  ($n -like 'bundle.js') -or
  ($n -ieq 'package-lock.json')
}

$root = (Get-Location).Path
$files = Get-ChildItem -Recurse -File -Path $root | Where-Object {
  $exts -contains $_.Extension.ToLower() -and -not (IsExcluded $_.FullName)
}

$rows = foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1)
  $parts = $rel -split '[\\/]+'
  $area = if ($parts.Length -eq 1) { '(root)' } else { $parts[0] }
  $loc = 0; $hits = 0
  try {
    $content = Get-Content -Raw -LiteralPath $f.FullName -ErrorAction Stop
    if ($null -ne $content) {
      $loc = ($content -split "`n").Count
      $hits = ([regex]::Matches($content, $xdimRegex)).Count
    }
  } catch { }

  $bundle = & $isBundleLike $f.Name
  $strong = & $strongName $f.Name

  # density = hits per 100 LOC
  $density = if ($loc -gt 0) { $hits * 100.0 / $loc } else { 0 }

  $tier =
    if ($bundle) { 'BUNDLE' }
    elseif ($strong) { 'CORE' }
    elseif ($hits -ge 5 -and $density -ge 0.3) { 'CONSUMER' }
    elseif ($hits -ge 2 -and $density -ge 0.5) { 'CONSUMER' }
    elseif ($hits -ge 1 -and $density -ge 1.0) { 'CONSUMER' }
    elseif ($hits -ge 1) { 'TRACE' }
    else { 'NONE' }

  [PSCustomObject]@{
    Area    = $area
    Path    = $rel
    LOC     = $loc
    Hits    = $hits
    Density = [math]::Round($density,2)
    Tier    = $tier
  }
}

$totalLoc   = ($rows | Measure-Object LOC -Sum).Sum
$totalFiles = $rows.Count

function PctOf($n) { if ($totalLoc -gt 0) { [math]::Round($n * 100.0 / $totalLoc, 1) } else { 0 } }
function FpctOf($n) { if ($totalFiles -gt 0) { [math]::Round($n * 100.0 / $totalFiles, 1) } else { 0 } }

"=== TOTALS (in-scope source; excludes node_modules, lib, _archive, assets, docs) ==="
"Files:          {0}" -f $totalFiles
"LOC:            {0}" -f $totalLoc
""

"=== TIER BREAKDOWN ==="
$rows | Group-Object Tier | ForEach-Object {
  $g = $_.Group
  $sum = ($g | Measure-Object LOC -Sum).Sum
  [PSCustomObject]@{
    Tier    = $_.Name
    Files   = $g.Count
    FilePct = (FpctOf $g.Count)
    LOC     = $sum
    LocPct  = (PctOf $sum)
  }
} | Sort-Object @{Expression={
  switch($_.Tier){ 'CORE'{1} 'CONSUMER'{2} 'TRACE'{3} 'BUNDLE'{4} 'NONE'{5} default{9} }
}} | Format-Table -AutoSize

"=== BY AREA (LOC by tier) ==="
$rows | Group-Object Area | ForEach-Object {
  $g = $_.Group
  $core     = ($g | Where-Object Tier -eq 'CORE'     | Measure-Object LOC -Sum).Sum
  $consumer = ($g | Where-Object Tier -eq 'CONSUMER' | Measure-Object LOC -Sum).Sum
  $trace    = ($g | Where-Object Tier -eq 'TRACE'    | Measure-Object LOC -Sum).Sum
  $bundle   = ($g | Where-Object Tier -eq 'BUNDLE'   | Measure-Object LOC -Sum).Sum
  $none     = ($g | Where-Object Tier -eq 'NONE'     | Measure-Object LOC -Sum).Sum
  $tot      = ($g | Measure-Object LOC -Sum).Sum
  $xdim     = $core + $consumer
  [PSCustomObject]@{
    Area     = $_.Name
    Files    = $g.Count
    LOC      = $tot
    Core     = $core
    Consumer = $consumer
    Trace    = $trace
    Bundle   = $bundle
    None     = $none
    XPct     = if ($tot -gt 0) { [math]::Round($xdim * 100.0 / $tot, 1) } else { 0 }
  }
} | Sort-Object LOC -Descending | Format-Table -AutoSize

"=== CORE FILES (manifold definitions / substrates / engine) ==="
$rows | Where-Object Tier -eq 'CORE' | Sort-Object LOC -Descending |
  Format-Table Area, Path, LOC, Hits, Density -AutoSize

"=== CONSUMERS (significant manifold paradigm usage) ==="
$rows | Where-Object Tier -eq 'CONSUMER' | Sort-Object Density -Descending |
  Format-Table Area, Path, LOC, Hits, Density -AutoSize

"=== LARGEST 'NONE' FILES (no manifold paradigm at all) ==="
$rows | Where-Object Tier -eq 'NONE' | Sort-Object LOC -Descending | Select-Object -First 15 |
  Format-Table Area, Path, LOC -AutoSize
