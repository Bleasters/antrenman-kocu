# RehabFlow

Kişisel fizik tedavi / rehabilitasyon takip uygulaması (bilek, ayak bileği, diz). Bir **PWA**: GitHub Pages'te yayınlanır, iPhone'da ana ekrana eklenir, tamamen **offline** çalışır. Sağlık verisi **sadece cihazda** durur.

> Bu uygulama tıbbi tavsiye vermez. Uyarılar senin ayarladığın eşiklerle çalışır. **Eşikleri fizyoterapistinle birlikte belirle.**

Ayrıntılı gereksinimler: [SPEC.md](SPEC.md).

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173/antrenman-kocu/
npm test           # Vitest unit testleri (kural motoru, istatistik, yedekleme, seans akışı)
npm run build      # typecheck + production build + "dış URL yok" kontrolü
npm run test:e2e   # build sonrası: Chromium'da uçtan uca seans + harici istek yok + offline yeniden yükleme
```

Teknoloji: Vite + TypeScript + Preact, Dexie (IndexedDB), zod/mini (yedek doğrulama), uPlot (grafik), fflate (ZIP yedek), vite-plugin-pwa (Workbox).

## Özellikler

- **Seans modu:** tekrar sayacı, tutuş/süre zamanlayıcısı (son 3 sn bip), dinlenme sayacı, ekran kararmaz, yarım seans kurtarma.
- **Ağrı izleme:** önce / sonra / ertesi sabah + kırmızı bayraklar; eşikleri Ayarlar'dan gelen kural motoru (yeşil/turuncu/kırmızı).
- **ROM ölçümü** (`#/rom`): telefon eğim ölçer olarak kullanılır (yerçekimi vektörleri arasındaki açı). Sıfırla → Ölç, titreşim/hareket varsa reddedilir, 3 ölçümün medyanı kaydedilir, 2 sn sesli geri sayımlı eller serbest modu var. Doğruluk yaklaşık ±5°. Manuel (gonyometre) giriş her zaman açık.
- **Arşiv:** röntgen/fotoğraf yükleme (uzun kenar 1600 px, JPEG 0.8, 300 px küçük resim, EXIF yönü düzeltilir), bölgeye göre kronolojik grid, pinch-zoom, yan yana ya da kaydırıcıyla üst üste karşılaştırma.
- **İlerleme:** ağrı, ROM (sol/sağ), yük (set × tekrar × kg ya da en uzun tutuş) ve haftalık seans grafikleri.
- **Doktor raporu** (`#/report`): tarih aralığı, özet tablolar, ROM ilk/son/fark, kırmızı bayraklar, mini grafikler, isteğe bağlı röntgenler. A4 print CSS; iPhone'da Yazdır → PDF.
- **Yedek:** sadece veriler (JSON) ya da medya dahil tam yedek (ZIP).

**Neden uPlot?** Chart.js'in yaklaşık dörtte biri boyutunda (~45 KB). Zaman serisi odaklı ve çok hızlı. Dokunarak ya da parmakla kaydırarak değer gösterme kolayca eklendi.

## Deploy (GitHub Pages)

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions** (bir kez yapılır).
2. `main`'e her push'ta `.github/workflows/deploy.yml` testleri çalıştırır, build alır ve yayınlar.
3. Adres: `https://<kullanıcı>.github.io/antrenman-kocu/`. Repo adı değişirse `vite.config.ts` içindeki `BASE` değerini güncelle.

## iPhone'a kurulum

1. Safari'de sayfayı aç → **Paylaş → Ana Ekrana Ekle**.
2. Uygulamayı her zaman **ana ekran ikonundan** aç.
   ⚠️ Safari sekmesi ile ana ekran uygulaması **ayrı depolama** kullanır. Safari'de girilen veri uygulamada görünmez.
3. İlk açılışta bir kez internet gerekir (dosyalar önbelleğe alınır). Sonrasında uçak modunda da çalışır.

## Deep linkler

- `#/session`: seans başlat
- `#/morning-pain`: ertesi sabah ağrı girişi
- `#/rom`: ROM ölçümü

**Hatırlatmalar:** Ayarlar → *iOS Kısayol kurulumu* sayfası adım adım anlatır. Kısayollar'dan bir URL açmak genellikle ana ekran uygulamasını değil Safari'yi açar, Safari'nin depolaması da ayrıdır. Bu yüzden önerilen yöntem şudur: otomasyon sadece bildirim gösterir, uygulamayı sen ikondan açarsın.

## Yedekleme rutini

**En büyük risk veri kaybıdır.**

- Veriler telefonda yerel durur. Uygulama silinirse, Safari verileri temizlenirse ya da telefon değişirse veriler **kalıcı olarak gider**.
- iOS, Safari sekmesinde açılan sitelerin verisini ~7 gün kullanılmazsa silebilir. Ana ekran uygulaması bundan muaftır ama bu garanti değildir.
- iCloud yedeği PWA verisini güvenilir şekilde kapsamaz. Buna güvenme.

**Rutin:**
- Haftada bir **Ayarlar → Yedekle / geri yükle → Sadece veriler (JSON)**. Paylaş menüsünden **Dosyalar → iCloud Drive**'a kaydet.
- Yeni röntgen/fotoğraf ekledikten sonra (ya da ayda bir) **Medya dahil tam yedek (ZIP)** al.
- Yedek süresi geçince Bugün ekranında hatırlatma bandı çıkar.
- İçe aktarma ekranı hem `.json` hem `.zip` kabul eder.

Geri yükleme seçenekleri:
- **Birleştir:** kayıtlar id ile eşleşir, `updatedAt` daha yeni olan kazanır.
- **Değiştir:** mevcut veri önce cihazda otomatik yedeklenir, sonra silinip yedekteki veri yüklenir. Sadece-veri yedeği görsellere dokunmaz; ZIP yedeği görselleri de değiştirir.

## Gizlilik

- Çalışma anında sıfır harici istek: analytics, CDN, harici font veya ikon yok. Sistem fontu kullanılır.
- `npm run build` çıktıda dış URL arar. `npm run test:e2e` gerçek tarayıcıda tüm istekleri kaydeder.
- Repoya gerçek veri girmez (`.gitignore` yedek dosyalarını dışlar). Seed verisi sadece örnek egzersizlerdir.

## Bilinen sınırlamalar

- iOS'ta zamanlanmış yerel bildirim yok. Hatırlatma için iOS Kısayollar otomasyonu kullanılır (yukarıya bak). Web push Faz 3'te, opsiyonel.
- iOS'ta hareket sensörü izni (`DeviceMotionEvent.requestPermission`) butona basınca istenir. Reddedilirse uygulamayı kapatıp açınca tekrar sorulur; bu arada manuel giriş kullanılabilir.
- Eğim ölçer sadece yerçekimine göre eğimi ölçer. Hareket yatay düzlemdeyse (ör. bilek radial/ulnar deviasyon) uzvu dik konuma getirmek gerekir; ekrandaki yerleşim notları bunu anlatır.
- `navigator.vibrate` iOS'ta yok, titreşim sessizce atlanır. Wake Lock iOS 16.4+ gerektirir.
- Bip sesi iPhone'un sessiz modunda duyulmayabilir.
- Güncellemeler arka planda iner ama sayfa kendiliğinden yenilenmez. "Güncelleme var → Yenile" bandına dokun. Seans sırasında bant gösterilmez.
- Egzersiz form videoları Faz 3'te.
