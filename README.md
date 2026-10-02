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

Teknoloji: Vite + TypeScript + Preact, Dexie (IndexedDB), zod/mini (yedek doğrulama), uPlot (grafik), vite-plugin-pwa (Workbox).

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
- `#/rom`: ROM ölçümü (Faz 2)

## Yedekleme rutini

**En büyük risk veri kaybıdır.**

- Veriler telefonda yerel durur. Uygulama silinirse, Safari verileri temizlenirse ya da telefon değişirse veriler **kalıcı olarak gider**.
- iOS, Safari sekmesinde açılan sitelerin verisini ~7 gün kullanılmazsa silebilir. Ana ekran uygulaması bundan muaftır ama bu garanti değildir.
- iCloud yedeği PWA verisini güvenilir şekilde kapsamaz. Buna güvenme.

**Rutin:** Haftada bir **Ayarlar → Yedekle / geri yükle → Sadece veriler (JSON)**. Paylaş menüsünden **Dosyalar → iCloud Drive**'a kaydet. Yedek süresi geçince Bugün ekranında hatırlatma bandı çıkar.

Geri yükleme seçenekleri:
- **Birleştir:** kayıtlar id ile eşleşir, `updatedAt` daha yeni olan kazanır.
- **Değiştir:** mevcut veri önce cihazda otomatik yedeklenir, sonra silinip yedekteki veri yüklenir.

## Gizlilik

- Çalışma anında sıfır harici istek: analytics, CDN, harici font veya ikon yok. Sistem fontu kullanılır.
- `npm run build` çıktıda dış URL arar. `npm run test:e2e` gerçek tarayıcıda tüm istekleri kaydeder.
- Repoya gerçek veri girmez (`.gitignore` yedek dosyalarını dışlar). Seed verisi sadece örnek egzersizlerdir.

## Bilinen sınırlamalar

- iOS'ta zamanlanmış yerel bildirim yok. Hatırlatma için iOS Kısayollar kullanılacak (Faz 2'de kurulum sayfası gelecek).
- `navigator.vibrate` iOS'ta yok, titreşim sessizce atlanır. Wake Lock iOS 16.4+ gerektirir.
- Bip sesi iPhone'un sessiz modunda duyulmayabilir.
- Güncellemeler arka planda iner ama sayfa kendiliğinden yenilenmez. "Güncelleme var → Yenile" bandına dokun. Seans sırasında bant gösterilmez.
- Faz 2'de gelecekler: ROM ölçümü, röntgen/fotoğraf arşivi, yük grafikleri, medyalı ZIP yedek, doktor raporu, Kısayol kurulumu.
