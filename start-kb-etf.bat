@echo off
chcp 65001 > nul
echo ====================================================================
echo   KB국민은행 퇴직연금 ETF 284 전종목 멀티차트 웹앱을 시작합니다...
echo   브라우저에서 http://localhost:3000/kb-etf.html 이 열립니다.
echo ====================================================================
start http://localhost:3000/kb-etf.html
node "%~dp0server.js"
pause
