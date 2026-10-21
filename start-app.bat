@echo off
title Starting Project Mafia...
cd /d "%~dp0"
echo Starting Project Mafia local server...
start /b cmd /c "npm run dev"
timeout /t 2 >nul
start http://localhost:5173
exit
