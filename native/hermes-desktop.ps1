$env:ELECTRON_DEV = "1"
$nativeDir = "$env:USERPROFILE\hermes-webui\native"
$electronCli = "$nativeDir\node_modules\electron\cli.js"
$node = "node"

# Kill old Hermes instances
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" -or $_.MainWindowTitle -like "Hermes*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Launch via Start-Process (inherits env)
Set-Location $nativeDir
Start-Process -NoNewWindow -FilePath $node -ArgumentList "`"$electronCli`" `"$nativeDir`"" -WorkingDirectory $nativeDir
