const os = require('os');
const { spawn } = require('child_process');
const path = require('path');

// 1. Konsolu Temizle ve Başlığı Ayarla
if (process.stdout.isTTY) {
  process.stdout.write('\x1Bc');
}

// 2. Yerel Ağ IPv4 Adresini Bul
function getLocalIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
          return net.address;
        }
      }
    }
  } catch (e) {}
  return '127.0.0.1';
}

const localIp = getLocalIp();
const PORT = 23504;

// 3. Şık ASCII Banner ve Bağlantı Bilgilerini Renkli Yazdır
console.log('\x1b[36m===============================================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m');
console.log('  ██╗     ██╗      ██████╗ ███████╗████████╗██╗  ██╗');
console.log('  ██║     ██║     ██╔═══██╗██╔════╝╚══██╔══╝██║  ██║');
console.log('  ██║     ██║     ██║   ██║█████╗     ██║   ███████║');
console.log('  ██║     ██║     ██║   ██║██╔══╝     ██║   ██╔══██║');
console.log('  ███████╗███████╗╚██████╔╝██║        ██║   ██║  ██║');
console.log('  ╚══════╝╚══════╝ ╚═════╝ ╚═╝        ╚═╝   ╚═╝  ╚═╝');
console.log('\x1b[0m');
console.log('                  \x1b[1m\x1b[37mYEREL MEDYA AĞ GEÇİDİ & SMART TV PORTALI\x1b[0m');
console.log('\x1b[36m===============================================================================\x1b[0m\n');

console.log('\x1b[32m-------------------------------------------------------------------------------\x1b[0m');
console.log('  \x1b[1m\x1b[32m[+] SUNUCU BAŞARIYLA BAŞLATILIYOR...\x1b[0m');
console.log('\x1b[32m-------------------------------------------------------------------------------\x1b[0m\n');

console.log(`  💻 \x1b[1m\x1b[37mBu Bilgisayardan :\x1b[0m  \x1b[33mhttp://localhost:${PORT}\x1b[0m`);
console.log(`  📺 \x1b[1m\x1b[37mSmart TV'den     :\x1b[0m  \x1b[33mhttp://${localIp}:${PORT}\x1b[0m`);
console.log(`  📱 \x1b[1m\x1b[37mTelefondan       :\x1b[0m  \x1b[33mhttp://${localIp}:${PORT}\x1b[0m\n`);

console.log('\x1b[36m-------------------------------------------------------------------------------\x1b[0m');
console.log('  \x1b[1m\x1b[36m🎮 SMART TV KUMANDA NUMARALARI (0-9):\x1b[0m');
console.log('    \x1b[1m[5]\x1b[0m Oynat / Durdur    \x1b[1m[4]\x1b[0m -10sn Geri    \x1b[1m[6]\x1b[0m +10sn İleri');
console.log('    \x1b[1m[8]\x1b[0m Ses Aç (+10)      \x1b[1m[2]\x1b[0m Ses Kıs (-10) \x1b[1m[9]\x1b[0m Sessiz (Mute)');
console.log('    \x1b[1m[1]\x1b[0m Önceki Bölüm      \x1b[1m[3]\x1b[0m Sonraki Bölüm \x1b[1m[7]\x1b[0m Ses Dili (TR/EN)');
console.log('    \x1b[1m[0]\x1b[0m Tam Ekran Modu (Fullscreen)');
console.log('\x1b[36m-------------------------------------------------------------------------------\x1b[0m\n');

console.log('\x1b[90m[*] Sunucu aktif... (Kapatmak için CTRL + C yapabilirsiniz)\x1b[0m\n');

// 4. Next.js Bin Dosyasını Doğrudan Node ile Çalıştır
const nextBinPath = path.resolve(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBinPath, 'start', '-p', PORT.toString(), '-H', '0.0.0.0'], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

child.on('error', (err) => {
  console.error('Sunucu başlatma hatası:', err.message);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
