@echo off
cd /d %~dp0
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5174"
rem --use-system-ca: Zertifikate aus Windows nutzen (z. B. von Antivirus-Programmen, die HTTPS pruefen)
node --use-system-ca --import tsx src/main.ts
pause
