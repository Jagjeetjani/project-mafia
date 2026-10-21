' Silent background starter for Project Mafia
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
' Run npm run dev completely hidden (0 = hidden window)
WshShell.Run "cmd.exe /c npm run dev", 0, False
