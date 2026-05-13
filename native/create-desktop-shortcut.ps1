$desktop = [Environment]::GetFolderPath('Desktop')
$batPath = 'C:\Users\<user>\hermes-webui\native\hermes-desktop.bat'
$lnkPath = Join-Path $desktop 'Hermes Desktop.lnk'

$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = 'C:\Users\<user>\hermes-webui\native'
$shortcut.Description = 'Hermes WebUI - Native Desktop App (Sidekick/Zen)'
$shortcut.IconLocation = 'C:\Users\<user>\hermes-webui\native\assets\icon.ico'
$shortcut.Save()

Write-Output "Desktop shortcut created: $lnkPath"
