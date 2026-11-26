' Civil Site Lab launcher: opens the app in its own window (Microsoft Edge or Google Chrome "app" mode).
Option Explicit
Dim sh, fso, appDir, page, url, profile, browsers, b, exe, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
page = appDir & "\app\index.html"
url = "file:///" & Replace(Replace(page, "\", "/"), " ", "%20")
If WScript.Arguments.Count > 0 Then url = url & "#" & WScript.Arguments(0)

' Separate browser profile so the app has its own window, taskbar entry and saved data.
profile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CivilSiteLab\Profile"

browsers = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe")

exe = ""
For i = 0 To UBound(browsers)
  If fso.FileExists(browsers(i)) Then
    exe = browsers(i)
    Exit For
  End If
Next

If exe <> "" Then
  sh.Run """" & exe & """ --app=""" & url & """ --user-data-dir=""" & profile & """ --no-first-run --no-default-browser-check --start-maximized", 1, False
Else
  ' No Edge/Chrome found: open in the default browser.
  sh.Run """" & page & """", 1, False
End If
