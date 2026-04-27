param()

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$exts = @('.js','.html','.json','.py')
$excludeDirs = @('node_modules','lib','_archive','.git','assets','docs','dist','build')

function IsExcluded($path) {
  foreach ($d in $excludeDirs) {
    $needle = [IO.Path]::DirectorySeparatorChar + $d + [IO.Path]::DirectorySeparatorChar
    if ($path.Contains($needle)) { return $true }
    $altNeedle = '/' + $d + '/'
    if ($path.Contains($altNeedle)) { return $true }
  }
  return $false
}

# Signals that a file participates in the x-dim / manifold paradigm
$xdimRegex = [regex]'(?i)(manifold\.(game|portal)\.json|manifold_bridge|manifold-core|manifold_core|KGManifold|KensGamesObserver|solve_for_y|solveForY|observe_manifold|observeManifold|dimension\s*\.\s*x|dimension\s*\.\s*y|dimension\s*\.\s*z|"dimension"\s*:|substrate\s*:|"substrate"\s*:|require_manifold|registerManifold|register_manifold|z\s*=\s*x\s*\*\s*y|z\s*=\s*x\.y|axiom|lens\s*:|"lens"\s*:|_substrate\.js)'

$root = (Get-Location).Path
$files = Get-ChildItem -Recurse -File -Path $root | Where-Object {
  $exts -contains $_.Extension.ToLower() -and -not (IsExcluded $_.FullName)
}

$rows = foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1)
  $parts = $rel -split '[\\/]+'
  $area = if ($parts.Length -eq 1) { '(root)' } else { $parts[0] }
  $loc = 0
  $hits = 0
  try {
    $content = Get-Content -Raw -LiteralPath $f.FullName -ErrorAction Stop
    if ($null -ne $content) {
      $loc = ($content -split "`n").Count
      $hits = ([regex]::Matches($content, $xdimRegex)).Count
    }
  } catch { }
  $isXdim = $hits -gt 0
  # Heuristic: a file with manifold.game.json or substrate in name is core x-dim
  $strong = ($f.Name -ieq 'manifold.game.json') -or ($f.Name -ieq 'manifold.portal.json') -or ($f.Name -like '*_substrate.js') -or ($f.Name -like 'manifold*.js')
  if ($strong) { $isXdim = $true }
  [PSCustomObject]@{
    Area   = $area
    Path   = $rel
    Ext    = $f.Extension.ToLower()
    LOC    = $loc
    Hits   = $hits
    XDim   = $isXdim
    Strong = $strong
  }
}

$total = ($rows | Measure-Object LOC -Sum).Sum
$xdimLoc = ($rows | Where-Object XDim | Measure-Object LOC -Sum).Sum
$xdimFiles = ($rows | Where-Object XDim).Count
$totalFiles = $rows.Count

"=== TOTALS ==="
"Files (in scope):       {0}" -f $totalFiles
"X-dim files:            {0} ({1:N1}%)" -f $xdimFiles, ($xdimFiles * 100.0 / [math]::Max($totalFiles,1))
"LOC (in scope):         {0}" -f $total
"X-dim LOC:              {0} ({1:N1}%)" -f $xdimLoc, ($xdimLoc * 100.0 / [math]::Max($total,1))
""
"=== BY AREA ==="
$rows | Group-Object Area | ForEach-Object {
  $g = $_.Group
  $areaTotal = ($g | Measure-Object LOC -Sum).Sum
  $areaX = ($g | Where-Object XDim | Measure-Object LOC -Sum).Sum
  $areaXFiles = ($g | Where-Object XDim).Count
  [PSCustomObject]@{
    Area     = $_.Name
    Files    = $g.Count
    XFiles   = $areaXFiles
    LOC      = $areaTotal
    XLOC     = $areaX
    XPct     = if ($areaTotal -gt 0) { [math]::Round($areaX * 100.0 / $areaTotal, 1) } else { 0 }
  }
} | Sort-Object LOC -Descending | Format-Table -AutoSize

"=== BY EXT ==="
$rows | Group-Object Ext | ForEach-Object {
  $g = $_.Group
  $eTotal = ($g | Measure-Object LOC -Sum).Sum
  $eX = ($g | Where-Object XDim | Measure-Object LOC -Sum).Sum
  [PSCustomObject]@{
    Ext   = $_.Name
    Files = $g.Count
    LOC   = $eTotal
    XLOC  = $eX
    XPct  = if ($eTotal -gt 0) { [math]::Round($eX * 100.0 / $eTotal, 1) } else { 0 }
  }
} | Sort-Object LOC -Descending | Format-Table -AutoSize

"=== TOP 25 X-DIM FILES BY HITS ==="
$rows | Where-Object XDim | Sort-Object Hits -Descending | Select-Object -First 25 |
  Format-Table Area, Path, LOC, Hits, Strong -AutoSize

"=== LARGEST NON-X-DIM FILES (top 20) ==="
$rows | Where-Object { -not $_.XDim } | Sort-Object LOC -Descending | Select-Object -First 20 |
  Format-Table Area, Path, LOC -AutoSize
