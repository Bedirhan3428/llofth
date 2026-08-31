@echo off
cd /d "%~dp0"
title llofth • Yerel Medya Portalı
cls

:: Node.js kontrolu
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js bilgisayarinizda bulunamadi!
    echo Lutfen https://nodejs.org adresinden Node.js kurun.
    echo.
    pause
    exit /b 1
)

:: Bagimlilik kontrolu
if not exist "node_modules\" (
    echo [*] Gerekli paketler yukleniyor (npm install)...
    call npm install
    echo.
)

:: Build kontrolu
if not exist ".next\" (
    echo [*] Ilk kurulum derlemesi yapiliyor (npm run build)...
    call npm run build
    echo.
)

:: Sunucuyu Baslat
node lib\start.js

if %errorlevel% neq 0 (
    echo.
    echo [Hata olustu veya sunucu kapandi]
    pause
)
