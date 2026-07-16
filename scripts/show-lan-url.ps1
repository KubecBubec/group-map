# Spusti Node skript s QR kodom (cross-platform).
$root = Split-Path -Parent $PSScriptRoot
node (Join-Path $root 'scripts/show-mobile-qr.mjs')
