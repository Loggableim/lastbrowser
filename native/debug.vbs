Dim shell, fso, appPath, electronPath, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
appPath = fso.GetParentFolderName(WScript.ScriptFullName)
electronPath = fso.BuildPath(appPath, "node_modules\.bin\electron.cmd")
logFile = fso.BuildPath(appPath, "hermes-debug.log")

' Write info to log
Set logStream = fso.CreateTextFile(logFile, True)
logStream.WriteLine "App path: " & appPath
logStream.WriteLine "Electron path: " & electronPath
logStream.WriteLine "Electron exists: " & fso.FileExists(electronPath)

Set shell = CreateObject("WScript.Shell")
shell.Environment("PROCESS")("ELECTRON_DEV") = "1"

' Try running electron directly
Dim cmd
cmd = """" & electronPath & """ """ & appPath & "\."" "
logStream.WriteLine "Command: " & cmd

Dim result
result = shell.Run(cmd, 1, False)
logStream.WriteLine "Result: " & result

logStream.Close
WScript.Echo "Done. Check: " & logFile
