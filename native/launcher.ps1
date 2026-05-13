$env:ELECTRON_DEV = "1"
$nativeDir = "F:\hermesbrowser\native"
$electronCli = "$nativeDir\node_modules\electron\cli.js"

# Kill old instances
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force

# Launch from native dir
Set-Location $nativeDir
Start-Process -FilePath "node" -ArgumentList "`"$electronCli`" `"$nativeDir`"" -WorkingDirectory $nativeDir -WindowStyle Normal
