@echo off
chcp 65001 > nul
title llofth • Yerel Medya Portalı
color 0B
cls

echo ===============================================================================
echo            ll      ll                 ffff  tt     hh      
echo            ll      ll        oooo    ff     tt     hh      
echo            ll      ll       oo  oo  ffff  tttttt   hhhhhh  
echo            llllll  llllll    oooo    ff     tt     hh  hh  
echo.
echo                   YEREL MEDYA AG GECIDI ^& SMART TV PORTALI
echo ===============================================================================
echo.

:: 1. Bilgisayarin Yerel Ag IPv4 Adresini Node.js ile Guvenli ve Hizlica Bul
set LOCAL_IP=
for /f "delims=" %%a in ('node -e "const os=require('os'); const nets=os.networkInterfaces(); for(const n of Object.keys(nets)){ for(const net of nets[n]){ if((net.family==='IPv4'||net.family===4)&&!net.internal){ console.log(net.address); process.exit(0); } } }" 2^>nul') do (
    set LOCAL_IP=%%a
)

if "%LOCAL_IP%"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IPv4-Adresi"') do (
        if "%LOCAL_IP%"=="" set LOCAL_IP=%%a
    )
)
set LOCAL_IP=%LOCAL_IP: =%
if "%LOCAL_IP%"=="" set LOCAL_IP=127.0.0.1

:: 2. Bagimliliklari ve Build Durumunu Kontrol Et
if not exist "node_modules\" (
    echo [*] Gerekli paketler yukleniyor (npm install)...
    call npm install
    echo.
)

if not exist ".next\" (
    echo [*] Ilk kurulum derlemesi yapiliyor (npm run build)...
    call npm run build
    echo.
)

:: 3. Baglanti Bilgilerini Ekrana Yazdir
echo -------------------------------------------------------------------------------
echo  [+] SUNUCU BASARIYLA HAZIRLANDI!
echo -------------------------------------------------------------------------------
echo.
echo   💻 Bu Bilgisayardan :  http://localhost:23504
echo   📺 Smart TV'den     :  http://%LOCAL_IP%:23504
echo   📱 Telefondan       :  http://%LOCAL_IP%:23504
echo.
echo -------------------------------------------------------------------------------
echo  🎮 SMART TV KUMANDA NUMARALARI (0-9):
echo    [5] Oynat / Durdur    [4] -10sn Geri    [6] +10sn Ileri
echo    [8] Ses Ac (+10)      [2] Ses Kis (-10) [9] Sessiz (Mute)
echo    [1] Onceki Bolum      [3] Sonraki Bolum [7] Ses Dili (TR/EN)
echo    [0] Tam Ekran Modu (Fullscreen)
echo -------------------------------------------------------------------------------
echo.
echo [*] Sunucu baslatiliyor... (Kapatmak icin bu pencereyi kapatabilir veya CTRL+C yapabilirsiniz)
echo.

:: 4. Next.js Sunucusunu Baslat
call npm start

pause
