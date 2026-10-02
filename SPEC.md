# Rehab Takip PWA — Claude Code için Proje Talimatı

Bu dosyayı repo köküne `SPEC.md` olarak koy ve Claude Code'a şunu söyle:
**"SPEC.md'yi baştan sona oku, belirsiz bir şey varsa başlamadan önce sor, sonra Faz 1'den başlayarak uygula."**

---

## 0. Bağlam

Kişisel kullanım için bir fizik tedavi / rehabilitasyon takip uygulaması yapıyoruz. Kullanıcı tek kişi (ben). Takip edilen bölgeler:
- **Bilek**: skafoid kırığı sonrası, ameliyatlı
- **Ayak bileği**: talus kırığı sonrası, ameliyatlı (fiksasyon)
- **Diz**

Uygulama App Store'a konmayacak. **PWA** olacak: GitHub Pages'te yayınlanacak, iPhone'da Safari → "Ana Ekrana Ekle" ile kurulacak, tam ekran ve offline çalışacak.

**Arayüz dili: Türkçe.** Kod, değişken isimleri ve commit mesajları İngilizce olabilir.

**Temel ilkeler:**
1. Mobil öncelikli. Hedef cihaz iPhone, Safari. Tek elle kullanılabilir olsun: büyük dokunma alanları (min 48px), önemli butonlar ekranın alt yarısında.
2. Tamamen offline. Çalışma anında hiçbir dış sunucuya, CDN'e, analytics'e istek atılmayacak. Her şey bundle'a girecek.
3. Sağlık verisi **sadece cihazda** duracak. Repoya, koda, build çıktısına asla gerçek veri girmeyecek. Repo public olabilir.
4. Bu uygulama tıbbi tavsiye vermez. Uyarı kuralları kullanıcının ayarlayabileceği eşiklerle çalışır. Ayarlar ekranında ve ilk açılışta kısa bir not olsun: "Eşikleri fizyoterapistinle birlikte belirle."

---

## 1. Teknoloji

- **Vite + TypeScript + Preact** (hafif). Router: `preact-iso` ya da basit hash router (GitHub Pages için hash router daha az sorun çıkarır).
- **Stil:** Sade CSS, CSS değişkenleriyle. Açık/koyu tema `prefers-color-scheme`'e göre otomatik.
- **Veri:** **IndexedDB**, `Dexie` ile. `localStorage` sadece küçük UI tercihleri için. Fotoğraf ve video `Blob` olarak IndexedDB'de durur.
- **PWA:** `vite-plugin-pwa` (Workbox). `registerType: 'autoUpdate'`, tüm asset'ler precache. Manifest'te `display: standalone`, Türkçe `name`/`short_name`, 192/512 ikon ve `apple-touch-icon`.
- **Grafik:** `uPlot` (küçük ve hızlı) ya da `Chart.js`. Hangisini seçtiğini gerekçesiyle söyle.
- **PDF rapor:** Kütüphane yerine **print CSS + `window.print()`**. iOS'ta "Yazdır → PDF olarak kaydet / paylaş" ile çalışır, ek bağımlılık yok.
- **Test:** `Vitest`. Kural motoru, veri dönüşümleri, import/export ve açı hesabı için unit test zorunlu.
- **Deploy:** GitHub Actions ile GitHub Pages. `vite.config` içinde `base` doğru ayarlanmalı (`/<repo-adı>/`). Service worker scope'u buna göre çalışmalı.

---

## 2. Veri Modeli (Dexie şeması)

Her tabloda `id` (uuid), `createdAt`, `updatedAt` olsun. Şema versiyonlu olsun (`db.version(n)`), ileride migration yazılabilsin.

```ts
type Region = 'wrist' | 'ankle' | 'knee';
type Side = 'left' | 'right';

interface Exercise {
  id: string;
  name: string;              // "Bilek fleksiyon-ekstansiyon"
  region: Region;
  side?: Side;
  kind: 'reps' | 'hold' | 'timed';   // tekrar / izometrik tutuş / süreli
  defaultSets: number;
  defaultReps?: number;      // kind=reps
  holdSec?: number;          // kind=hold
  durationSec?: number;      // kind=timed
  restSec: number;
  loadKg?: number;           // ağırlık/direnç varsa
  bandLevel?: string;        // direnç bandı rengi vs.
  instructions?: string;     // kısa açıklama
  mediaId?: string;          // Media tablosuna referans (form videosu/fotoğraf)
  active: boolean;
  order: number;
}

interface Session {
  id: string;
  date: string;              // YYYY-MM-DD (yerel saat, Europe/Istanbul)
  startedAt: number;
  endedAt?: number;
  painBefore: Partial<Record<Region, number>>;   // 0–10
  painAfter: Partial<Record<Region, number>>;
  painNextMorning?: Partial<Record<Region, number>>; // ertesi sabah doldurulur
  entries: SessionEntry[];
  notes?: string;
  redFlags?: RedFlag[];
}

interface SessionEntry {
  exerciseId: string;
  sets: { reps?: number; holdSec?: number; durationSec?: number; loadKg?: number; done: boolean }[];
  painDuring?: number;       // opsiyonel, egzersiz sırasında max ağrı
}

type RedFlag = 'sudden_swelling' | 'numbness' | 'night_pain' | 'locking' | 'giving_way' | 'warmth_redness';

interface RomMeasurement {
  id: string;
  date: string;
  region: Region;
  side: Side;
  movement: 'wrist_flexion' | 'wrist_extension' | 'wrist_radial_dev' | 'wrist_ulnar_dev'
          | 'ankle_dorsiflexion' | 'ankle_plantarflexion'
          | 'knee_flexion' | 'knee_extension';
  angleDeg: number;
  method: 'sensor' | 'manual';
  notes?: string;
}

interface Media {
  id: string;
  date: string;
  region?: Region;
  kind: 'xray' | 'photo' | 'exercise_video';
  blob: Blob;
  thumbBlob?: Blob;
  note?: string;
}

interface Settings {   // tek kayıt
  painIncreaseThreshold: number;   // varsayılan 2
  painMaxDuring: number;           // varsayılan 5
  nextMorningMustReturn: boolean;  // varsayılan true
  lastBackupAt?: number;
  backupReminderDays: number;      // varsayılan 7
  schemaVersion: number;
}
```

İlk açılışta **örnek egzersizlerle** seed et (her bölgeden 2–3 tane, açıkça "Örnek — düzenle" etiketiyle). Gerçek programı ben gireceğim, o yüzden program ekranı tam CRUD olmalı.

---

## 3. Ekranlar

Alt tab bar: **Bugün · Seans · İlerleme · Arşiv · Ayarlar**. Program düzenleme Ayarlar'ın içinden ya da Bugün ekranından açılır.

### 3.1 Bugün (ana ekran)
- Büyük "Seansı Başlat" butonu.
- Dünkü seansın ertesi sabah ağrısı girilmemişse üstte kart: "Dünkü seans sonrası bu sabah ağrın?" Tek dokunuşla 0–10 seçilir.
- Son kural motoru sonucu (bkz. §4): yeşil/sarı/kırmızı kart.
- Haftalık mini özet: kaç seans, ortalama ağrı trendi (↑ ↓ →).
- Yedekleme hatırlatma bandı (bkz. §6).

### 3.2 Seans modu
- Bölge seç (çoklu): bilek / ayak bileği / diz. O bölgelerin aktif egzersizleri sırayla gelir.
- Başta **seans öncesi ağrı** (bölge başına 0–10 slider + büyük rakam butonları).
- Her egzersiz tek ekran: isim, açıklama, (varsa) video, set göstergesi.
  - `reps`: büyük "+1" butonu ve "Set bitti" butonu. Hedef tekrara ulaşınca hafif titreşim (`navigator.vibrate` iOS'ta yok, sessizce atla) ve görsel geri bildirim.
  - `hold` / `timed`: büyük geri sayım, başlat/duraklat. Son 3 saniyede sesli bip (Web Audio API, kullanıcı etkileşimiyle başlatılmalı ki iOS engellemesin).
  - Setler arası otomatik **dinlenme sayacı**, "atla" butonuyla.
  - Set için ağırlık/tekrar değiştirilebilir (ilerleme kaydı için).
  - Opsiyonel "egzersiz sırasında max ağrı".
- Ekran kararmasın: **Screen Wake Lock API** (`navigator.wakeLock`). Desteklenmiyorsa sessizce geç.
- Sonda **seans sonrası ağrı** ve **kırmızı bayrak checkbox'ları** (ani şişlik, uyuşma/karıncalanma, gece ağrısı, kilitlenme, boşalma hissi, sıcaklık/kızarıklık) ve not alanı.
- Yarım kalan seans IndexedDB'ye anlık kaydedilsin. Uygulama kapanırsa geri açınca "Devam et / Sil" sorulsun.

### 3.3 İlerleme
- Bölge filtresi ve zaman aralığı (4 hafta / 3 ay / tümü).
- Grafikler:
  1. Ağrı: önce / sonra / ertesi sabah (3 çizgi)
  2. ROM: hareket başına açı trendi
  3. Yük: egzersiz başına toplam hacim (set × tekrar × kg) ya da max tutuş süresi
  4. Seans sıklığı (haftalık bar)
- Grafikler mobilde okunur olmalı: yatay kaydırma yok, dokununca değer gösterilsin.

### 3.4 ROM ölçümü (Faz 2)
Telefonu eğim ölçer (inclinometer) olarak kullanıyoruz.

**Yöntem: yerçekimi vektörü açısı.**
- `devicemotion` olayından `accelerationIncludingGravity` (x, y, z) okunur.
- **iOS izni:** `DeviceMotionEvent.requestPermission()` mutlaka bir buton tıklamasıyla çağrılmalı. HTTPS şart (GitHub Pages zaten HTTPS). İzin reddedilirse manuel giriş moduna düş ve nasıl düzeltileceğini açıkla.
- **Akış:**
  1. Kullanıcı hareketi seçer. Ekranda telefonun nereye ve nasıl konacağı şematik olarak gösterilir (ör. ayak bileği dorsifleksiyon için telefon kaval kemiğinin ön yüzüne, uzun kenar boyunca).
  2. **Sıfırlama:** Nötr pozisyonda "Sıfırla"ya basılır. 1 saniye boyunca örnek toplanır, ortalama vektör `g0` olur.
  3. **Ölçüm:** Hareketin sonuna gidilir, "Ölç"e basılır. 1 saniye örnek alınır, ortalama `g1`.
  4. Açı: `θ = acos( (g0·g1) / (|g0||g1|) )`, dereceye çevir.
- **Stabilite kontrolü:** Örnek penceresinde standart sapma eşiği aşılırsa (titreme/hareket) "Sabit tut" uyarısı ver ve ölçümü reddet.
- 2 saniyelik sesli geri sayımla "eller serbest" ölçüm modu ekle (telefonu koyduktan sonra başlasın).
- Aynı hareket için 3 ölçüm alınsın, medyanı kaydedilsin.
- Ekranda dürüst not: "Doğruluk yaklaşık ±5°. Önemli olan her seferinde aynı pozisyon ve yerleşimle ölçmek."
- Manuel giriş seçeneği her zaman açık olsun (gonyometreyle ölçülen değerler için).
- Açı hesabını saf fonksiyon olarak yaz ve unit test et.

### 3.5 Arşiv (röntgen ve fotoğraf zaman çizelgesi)
- `<input type="file" accept="image/*">` ile hem kameradan hem galeriden yükleme.
- Yüklerken **sıkıştır**: canvas ile uzun kenar max 1600px, JPEG kalite 0.8. Ayrıca ~300px thumbnail üret. EXIF yön sorununa dikkat (`createImageBitmap(file, { imageOrientation: 'from-image' })`).
- Tarih (varsayılan bugün, değiştirilebilir), bölge, tür (röntgen/fotoğraf) ve not.
- Bölgeye göre kronolojik grid. **Yan yana karşılaştırma modu:** iki görsel seç, yan yana ya da kaydırıcıyla üst üste göster. Pinch-zoom olsun.
- Egzersiz form videoları da `Media`'da tutulur ama video dosyaları büyük. Boyut uyarısı ver (ör. >30MB).

### 3.6 Doktor raporu (Faz 2)
- "Rapor oluştur": tarih aralığı seçilir (varsayılan son 4 hafta).
- Ayrı bir print görünümü: özet tablo (seans sayısı, ağrı ortalamaları ve trend, ROM ilk-son değerleri ve farkı, kırmızı bayrak kayıtları tarihleriyle), küçük grafikler, opsiyonel olarak seçili röntgenler.
- `@media print` CSS ile A4 düzeni. Sonra `window.print()`. iOS'ta paylaş menüsünden PDF kaydedilir.

### 3.7 Ayarlar
- Program düzenleme (egzersiz ekle/sil/sırala, aktif/pasif).
- Kural motoru eşikleri.
- Yedekleme / geri yükleme (bkz. §6).
- Depolama kullanımı (`navigator.storage.estimate()`).
- "Tüm verileri sil" (iki aşamalı onay).
- Uygulama sürümü ve son güncelleme.

---

## 4. Kural Motoru (ağrı izleme)

Saf TypeScript modülü olarak yaz (`src/logic/painRules.ts`), UI'dan bağımsız, unit testli. Mantık sporcu rehabilitasyonunda yaygın kullanılan "ağrı izleme modeli"ne dayanır. Eşikler **Settings'ten** gelir, sabit kodlanmaz.

Her seans ve bölge için sonuç üret:

- 🔴 **Kırmızı — "Dur, doktoruna/fizyoterapistine danış"**
  - Herhangi bir kırmızı bayrak işaretlendiyse. Bu her zaman diğer kuralları ezer.
- 🟠 **Turuncu — "Yükü azalt"**
  - Seans sırasındaki/sonrasındaki ağrı `painMaxDuring`'i aştıysa, ya da
  - `painAfter - painBefore >= painIncreaseThreshold` ise, ya da
  - `nextMorningMustReturn` açıkken ertesi sabah ağrısı seans öncesi seviyeye dönmediyse.
  - Ardışık 2 seans turuncuysa ek uyarı: "Üst üste ikinci kez. Programı gözden geçir."
- 🟢 **Yeşil — "Mevcut yük uygun"**
  - Yukarıdakilerin hiçbiri yoksa.
  - Son 3 seans üst üste yeşilse: "Fizyoterapistin onaylarsa ilerletmeyi düşünebilirsin." Kesin "ilerlet" komutu verme.
- ⚪ **Veri eksik** — ertesi sabah ağrısı henüz girilmediyse sonuç "geçici" olarak işaretlensin.

Tüm sonuç metinleri yönlendirici ama tavsiye vermeyen dille yazılmalı. Testlerde her dalı ve sınır değerlerini (eşik tam = threshold) kapsa.

---

## 5. Hatırlatmalar — gerçekçi yaklaşım

**Önemli teknik kısıt:** iOS'ta PWA web push bildirimi alabilir (iOS 16.4+, ana ekrana ekli olmalı) **ama zamanlanmış yerel bildirim API'si yok**. Bildirimi bir sunucunun göndermesi gerekir (VAPID + push servisi). Bu proje sunucusuz, o yüzden:

1. **Ana çözüm: iOS Kısayollar.** Uygulama **deep link** desteklesin:
   - `.../#/session` → seans başlat
   - `.../#/morning-pain` → ertesi sabah ağrı girişi
   - `.../#/rom` → ROM ölçümü
   Ayarlar'da bir **"iOS Kısayol kurulumu"** sayfası olsun. Kişisel otomasyon kurulumunu adım adım anlatsın (ör. "Her gün 09:00 → Bildirim göster → dokununca URL aç"), linkler kopyalanabilir olsun.
   - Dikkat: Kısayoldan URL açmak ana ekran PWA'sını değil Safari'yi açabilir. Bu durumda Safari ile PWA'nın depolaması **ayrıdır** (bkz. §7). Bunu test et ve kurulum sayfasında doğru yöntemi anlat. Gerekirse kısayolda "URL aç" yerine "Uygulamayı aç" (ana ekran ikonu) önerilsin.
2. **Uygulama içi:** Açılışta eksik giriş varsa (dünkü ertesi sabah ağrısı, bu hafta ROM ölçümü yok vs.) Bugün ekranında kart gösterilsin.
3. Web push'u **Faz 3 / opsiyonel** olarak bırak, Faz 1–2'de yapma.

---

## 6. Yedekleme ve Veri Güvenliği

Bu uygulamanın en büyük riski **veri kaybı**. Bunu ciddiye al.

**Riskler (README'ye de yaz):**
- Ana ekran PWA'sının verisi telefonda yerel durur. Uygulama silinir, Safari verileri temizlenir ya da telefon değişirse veri **kalıcı olarak gider**.
- iOS, Safari sekmesinde açılan sitelerin depolamasını ~7 gün kullanılmazsa silebilir. Ana ekrana eklenmiş PWA bundan muaf, ama yine de garanti değil.
- iCloud yedeği PWA verisini güvenilir şekilde kapsamaz, buna güvenme.

**Önlemler:**
1. Açılışta `navigator.storage.persist()` iste, sonucu Ayarlar'da göster.
2. **Dışa aktar:**
   - JSON formatında: `{ app: 'rehab-pwa', schemaVersion, exportedAt, data: {...} }`.
   - İki seçenek: **"Sadece veriler"** (küçük; seans, ROM, ayarlar, program) ve **"Medya dahil tam yedek"** (Blob'lar base64 ya da ZIP; ZIP için `fflate` kullan).
   - Dosya adı: `rehab-yedek-YYYY-MM-DD.json` / `.zip`.
   - iOS'ta **Web Share API** (`navigator.share({ files })`) ile paylaş menüsü açılsın, kullanıcı iCloud Drive / Dosyalar'a kaydetsin. Desteklenmiyorsa `<a download>` fallback.
3. **İçe aktar:**
   - Dosya seç → şema doğrulama (`zod` ile) → önizleme ("X seans, Y ölçüm, Z görsel içeriyor").
   - İki mod: **Birleştir** (id'ye göre, `updatedAt` daha yeni olan kazanır) ve **Değiştir** (önce mevcut veriyi otomatik yedekle, sonra sil ve yükle).
   - Eski `schemaVersion`'dan gelen dosyalar için migration fonksiyonu.
4. **Hatırlatma:** `lastBackupAt` `backupReminderDays`'den eskiyse Bugün ekranında kapatılamayan (sadece ertelenebilen) bir bant göster: "Son yedek X gün önce."
5. Round-trip testi yaz: export → boş DB'ye import → veriler birebir aynı.

**Gizlilik:**
- Çalışma anında sıfır dış istek. Build sonrası bunu doğrula (network sekmesi ya da bir test).
- Analytics, font CDN'i, harici ikon kütüphanesi yok. Fontlar sistem fontu (`-apple-system, system-ui`).
- Repoya `.gitignore` ile örnek dışında hiçbir veri dosyası girmesin. Seed verisi sadece örnek egzersizler.
- (Opsiyonel, Faz 3) Uygulama açılış PIN'i. Bunun gerçek şifreleme olmadığını, sadece göz atma engeli olduğunu arayüzde belirt.

---

## 7. iOS PWA Tuzakları (mutlaka dikkat et)

- Safari'de açılan site ile ana ekrana eklenmiş PWA **ayrı depolama** kullanır. Safari'de girilen veri PWA'da görünmez. Kurulum ekranında bunu açıkça yaz.
- `viewport-fit=cover`. Safe area için `env(safe-area-inset-*)` padding (çentik ve home indicator).
- `apple-mobile-web-app-capable` ve `apple-mobile-web-app-status-bar-style` meta'ları.
- Input'larda font-size ≥ 16px olsun, yoksa iOS otomatik zoom yapar.
- Ses, wake lock ve sensör izinleri kullanıcı jesti gerektirir. Hepsini buton tıklamasına bağla.
- Service worker güncellemesi: yeni sürüm gelince "Güncelleme var, yenile" bandı göster. Kullanıcı seans ortasındaysa otomatik yenileme yapma.
- Hash router kullan ki GitHub Pages'te sayfa yenilemede 404 olmasın.

---

## 8. Fazlar

Her faz sonunda: testler geçsin, `npm run build` hatasız olsun, kısa özet yaz, commit at. Fazlar arasında benden onay bekle.

**Faz 1 — MVP**
- Proje kurulumu, PWA manifest + service worker, GitHub Actions deploy
- Dexie şeması + seed
- Program CRUD
- Seans modu (sayaç, zamanlayıcı, dinlenme, wake lock, yarım seans kurtarma)
- Ağrı girişi (önce/sonra/ertesi sabah) + kırmızı bayraklar
- Kural motoru + testleri
- Bugün ekranı
- İlerleme: ağrı grafiği + seans sıklığı
- Yedekleme: JSON export/import (sadece veriler), persist(), hatırlatma bandı

**Faz 2**
- ROM ölçümü (sensör + manuel) + ROM grafiği
- Arşiv (röntgen/fotoğraf, sıkıştırma, karşılaştırma)
- Yük/hacim grafikleri
- Medya dahil tam yedek (ZIP)
- Doktor raporu (print görünümü)
- iOS Kısayol kurulum sayfası + deep linkler

**Faz 3 (opsiyonel)**
- PIN kilidi
- Web push (ayrı küçük sunucu gerekir, önce bana maliyetini/karmaşıklığını anlat)
- Egzersiz form videoları

---

## 9. Kabul Kriterleri

- iPhone'da ana ekrana eklenip **uçak modunda** tam çalışıyor.
- Bir seans baştan sona tek elle, ekran kararmadan tamamlanabiliyor.
- Uygulama seans ortasında kapatılıp açılınca veri kaybı yok.
- Export → uygulamayı sil → yeniden kur → import sonrası tüm veriler geri geliyor.
- Lighthouse PWA kontrolleri geçiyor. Erişilebilirlikte kontrast ve dokunma alanları uygun.
- Çalışma anında sıfır harici ağ isteği.
- README: kurulum, deploy, iPhone'a ekleme, yedekleme rutini ve bilinen sınırlamalar.

---

Başlamadan önce: seçtiğin kütüphaneleri ve klasör yapısını kısaca öner, belirsiz gördüğün noktaları sor.
