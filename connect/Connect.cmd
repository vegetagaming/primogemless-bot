@echo off
setlocal
if not exist "%~dp0Connect.ps1" goto missing_files
if not exist "%~dp0connection.json" goto missing_files
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Connect.ps1"
pause
exit /b

:missing_files
echo.
echo PRIMOGEMLESS - Extract the ZIP first
echo.
echo This launcher needs Connect.ps1 and connection.json beside it.
echo Windows can run a single file from a ZIP without extracting the others.
echo.
echo 1. Close this window.
echo 2. Right-click Connect-Primogemless.zip and choose Extract All.
echo 3. Open the extracted folder, then double-click Connect.cmd there.
echo.
echo Keep Connect.cmd, Connect.ps1, connection.json and README.txt together.
echo If the request expires, download a fresh Windows helper from /login.
echo.
pause
exit /b 1
