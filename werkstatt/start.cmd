@echo off
cd /d %~dp0
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5174"
npx tsx src/main.ts
pause
