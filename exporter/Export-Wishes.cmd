@echo off
cd /d "%~dp0"
echo Review README.txt and Export-Wishes.ps1 before running this helper.
echo Open Genshin - Wish - History and wait for it to load first.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-Wishes.ps1"
pause
