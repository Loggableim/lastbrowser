$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktop\LastBrowser.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "F:\lastbrowser\native\launcher.bat"
$shortcut.WorkingDirectory = "F:\lastbrowser\native"
$shortcut.Description = "LastBrowser - Productivity Workspace Browser"
$shortcut.IconLocation = "F:\lastbrowser\native\assets\icon.ico, 0"
$shortcut.Save()
Write-Output "Shortcut created: $shortcutPath"
