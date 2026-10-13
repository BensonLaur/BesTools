@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish.ps1"
if errorlevel 1 (
  echo.
  echo Publishing stopped. Read the error above; no force push is used.
)
pause
