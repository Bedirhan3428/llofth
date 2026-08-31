# llofth • Yerel Medya Ağ Geçidi & Akış Portalı

Smart TV, Mobil (Telefon/Tablet) ve Masaüstü cihazlar için özel olarak tasarlanmış, **Next.js 14 (App Router)** ve **HLS.js** tabanlı yeni nesil yerel medya akış portalı.

---

## 🌟 Öne Çıkan Özellikler

- 🎬 **YouTube Tarzı İki Kolonlu İzleme Sayfası (`/watch`):** Sol tarafta 16:9 gömülü video oynatıcı, sağ tarafta dikey sezon ve bölüm çalma listesi.
- 📱 **Tam Mobil Uyumluluk (Mobile-First):** Telefonlarda ekranın altına sabitlenen modern alt menü çubuğu (Bottom Navigation Bar) ve kenardan kenara (Edge-to-Edge) tam oturan video oynatıcı.
- ⏱️ **Kaldığın Yerden Devam Et (Continue Watching):** Yarım bıraktığınız bölümler ana sayfada vitrin olarak listelenir ve tıklandığında kaldığı tam saniyeden otomatik devam eder.
- 📺 **Smart TV & D-Pad Kumanda Desteği:** TV kumandaları ve klavye ile tam uyumlu gezinme, odaklanma efektleri ve kısayollar.
- 🔊 **Çift Ses Dili (Dual Audio):** Türkçe Dublaj ve Orijinal İngilizce ses kanalları arasında anında geçiş.
- 🖼️ **Full HD Afiş Çözücü:** Orijinal yüksek çözünürlüklü WebP afişleri ile akıcı içerik ızgarası.
- 🚀 **Yerel HLS Proxy & Segment Dönüştürücü:** `.jpg` maskeli HLS video parçalarını `video/mp2t` olarak borulayan akıllı proxy motoru.

---

## 📋 Gereksinimler

Projenin çalışması için bilgisayarınızda şunların kurulu olması yeterlidir:
- **Node.js** (v18.17.0 veya daha yeni bir sürüm) -> [nodejs.org](https://nodejs.org/)
- **Git** -> [git-scm.com](https://git-scm.com/)

---

## 🛠️ Sıfırdan Kurulum ve Çalıştırma Rehberi

Projeyi GitHub'dan indirip çalıştırmak için terminalinizde (Komut İstemi veya PowerShell) aşağıdaki adımları sırasıyla uygulayın:

### 1. Depoyu Klonlayın (İndirin)
```bash
git clone https://github.com/Bedirhan3428/llofth.git
```

### 2. Proje Klasörüne Girin
```bash
cd llofth
```

### 3. Bağımlılıkları Yükleyin
```bash
npm install
```

### 4. Projeyi Derleyin (Üretim Modu)
```bash
npm run build
```

### 5. Sunucuyu Başlatın
```bash
npm start
```
*(Geliştirme modunda anlık kod değişiklikleri ile çalıştırmak isterseniz: `npm run dev`)*

---

## 🌐 Yayına Erişim Adresleri

Sunucu başarıyla başladığında terminalde şu çıktıyı göreceksiniz:
```text
  ▲ Next.js 14.2.35
  - Local:        http://localhost:23504
  - Network:      http://0.0.0.0:23504
```

### 💻 Bilgisayarınızdan İzlemek İçin:
Tarayıcınızda açın:
👉 **[`http://localhost:23504`](http://localhost:23504)**

---

### 📺 Smart TV, Telefon veya Tabletten İzlemek İçin:
1. Telefonunuzun veya Smart TV'nizin bilgisayarınızla **aynı Wi-Fi ağına** bağlı olduğundan emin olun.
2. Bilgisayarınızın yerel IP adresini öğrenin:
   - **Windows:** Terminalde `ipconfig` yazın -> `IPv4 Address` değerine bakın (Örn: `192.168.1.13`).
   - **Mac / Linux:** Terminalde `ifconfig` veya `ip a` yazın.
3. TV veya telefonunuzun tarayıcısını açıp şu adrese girin:
   👉 **`http://<BILGISAYAR_IP_ADRESINIZ>:23504`**  
   *(Örnek: `http://192.168.1.13:23504`)*

---

## ⌨️ Klavye ve Smart TV Kumanda Kısayolları

| Tuş | Eylem |
|---|---|
| **`Space` / `K` / `OK Tuşu`** | Videoyu Oynat / Duraklat |
| **`▶ Sağ Ok`** | 10 Saniye İleri Sar |
| **`◀ Sol Ok`** | 10 Saniye Geri Sar |
| **`▲ Yukarı Ok`** | Sesi Aç (+10%) |
| **`▼ Aşağı Ok`** | Sesi Kıs (-10%) |
| **`F`** | Gerçek Tam Ekran (Tarayıcıyı kaplar) |
| **`M`** | Sesi Kapat / Aç (Mute) |
| **`N`** | Sonraki Bölüme Geç |
| **`P`** | Önceki Bölüme Geç |

---

## 📁 Sayfa ve Rota Mimarisi

- **`/home`**: Ana sayfa, öne çıkan vitrin banner'ı, popüler içerikler ve "İzlemeye Devam Et" vitrini.
- **`/search`**: Canlı arama sayfası (`?q=...` desteğiyle).
- **`/watch`**: YouTube tarzı video ve bölüm oynatıcı (`?url=...&epUrl=...&t=...`).

---

## 📄 Lisans
MIT License.
