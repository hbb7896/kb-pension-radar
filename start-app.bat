@echo off
chcp 65001 > nul
echo ====================================================
echo   Tom Doub R-System 웹앱을 시작합니다...
echo   브라우저에서 http://localhost:3000 이 열립니다.
echo ====================================================
start http://localhost:3000
node "%~dp0server.js"
pause
