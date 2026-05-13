$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktopPath\Hermes Desktop.lnk"
$psScript = "$env:USERPROFILE\hermes-webui\native\hermes-desktop.ps1"
$iconPath = "$env:USERPROFILE\hermes-webui\native\assets\icon.ico"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$psScript`""
$shortcut.WorkingDirectory = "$env:USERPROFILE\hermes-webui\native"
$shortcut.Description = "Hermes WebUI Desktop - Sidekick/Zen Browser"
$shortcut.IconLocation = $iconPath
$shortcut.Save()

Write-Output "Shortcut updated: $shortcutPath"
Write-Output "Target: powershell.exe -ExecutionPolicy Bypass -File `"$psScript`""
Write-Output ""
Write-Output "To pin to taskbar: right-click shortcut > Pin to taskbar"
