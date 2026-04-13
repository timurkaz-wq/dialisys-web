@echo off
title Dialisys Web
echo.
echo  ==============================
echo   Запуск Dialisys Web...
echo  ==============================
echo.
cd /d "%~dp0"
node server/index.js
pause
