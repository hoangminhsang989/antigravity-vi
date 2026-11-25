@echo off
title Antigravity Vietnamese UI Patcher
echo [agy-vi] Dang kiem tra tien trinh Antigravity.exe...
tasklist /FI "IMAGENAME eq Antigravity.exe" 2>NUL | find /I /N "Antigravity.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [agy-vi] Antigravity dang chay. Dang dong de tiem ban dich...
    taskkill /IM Antigravity.exe /F >NUL 2>&1
    ping -n 3 127.0.0.1 >NUL
)
node "%~dp0patch-antigravity.mjs" --if-needed
if errorlevel 1 (
    echo [agy-vi] Loi khi tiem ban dich!
    exit /b 1
)
echo [agy-vi] Dang khoi dong lai Antigravity...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath \"$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe\""
exit /b 0
