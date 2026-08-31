# llofth • Yerel Medya Ağ Geçidi & Akış Oynatıcı

Smart TV ve D-Pad kumanda odaklı, **Next.js 14 (App Router)** ve **HLS.js** tabanlı yerel medya portalı ve akış ağ geçidi.

---

## 🌟 Temel Özellikler

- **Yerel HLS Proxy & Segment Dönüştürücü:** `.jpg` maskeli HLS segmentlerini `video/mp2t` olarak borular, `master.m3u8` manifestlerini ve ses izlerini yeniden yazar.
- **YouTube Tarzı İzleme Sayfası (`/watch`):** Sol tarafta 16:9 gömülü video oynatıcı, sağ tarafta sezon/bölüm çalma listesi.
- **İzlemeye Devam Et (Continue Watching):** İzlenen bölümlerin ilerleme yüzdesini ve saniyesini kaydederek ana sayfada vitrin olarak sunar; tıklandığında kaldığı saniyeden otomatik başlatır.
- **Gerçek Tam Ekran (Native Fullscreen):** `F` tuşu veya buton ile tarayıcı dahil cihazın tüm ekranını kaplar.
- **Çift Ses Dili (Dual Audio):** Türkçe ve Orijinal İngilizce ses parçaları arasında anında geçiş.
- **D-Pad Kumanda & Klavye Kontrolleri:** D-Pad ile gezinme, Space/OK ile duraklatma, ◀/▶ ile 10 sn sarma.
- **Full HD Afiş Çözücü:** Orijinal yüksek çözünürlüklü WebP afişleri ile liste ve detay görselleri.

---

## 📂 Sayfa & Endpoint Rotaları

- **`/home`**: Ana sayfa, öne çıkan vitrin banner'ı, popüler içerikler ve "İzlemeye Devam Et" vitrini.
- **`/search`**: Canlı arama sayfası (`?q=...` parametresi desteğiyle).
- **`/watch`**: YouTube tarzı bölüm izleme ve çalma listesi sayfası (`?url=...&epUrl=...&t=...`).

---

## 🚀 Kurulum ve Çalıştırma

```powershell
# Bağımlılıkları yükleyin
npm install

# Geliştirici modunda başlatın
npm run dev

# veya Üretim modunda derleyip başlatın
npm run build
npm start
```

Tarayıcınızdan veya Smart TV'den erişin:
- **Bilgisayarda:** `http://localhost:3000`
- **Smart TV / Ağdaki Cihazlarda:** `http://192.168.1.13:3000`

---

## 🛠️ Teknoloji Yığını

- **Framework:** Next.js 14 (App Router), React 18
- **Styling:** Tailwind CSS (Koyu minimalist tema)
- **Player:** Custom HTML5 + HLS.js Video Engine
- **Scraper & Parser:** Cheerio, Node.js VM Context, Axios
