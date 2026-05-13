Dim shell, fso, appPath, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
appPath = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(appPath, "launcher.bat")
Set shell = CreateObject("WScript.Shell")
shell.Run """" & batPath & """", 1, False
