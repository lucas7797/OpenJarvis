@echo off
rem Double-click to open Civil Site Lab. Then click "Install" in the app (or the install icon in Edge/Chrome's address bar).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
