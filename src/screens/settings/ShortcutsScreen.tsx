import { useState } from 'preact/hooks';
import { IconBell, IconPhone } from '../../components/Icons';
import { PageHeader } from '../../components/PageHeader';
import { isStandalone } from '../../platform/storage';

const LINKS = [
  { hash: '#/session', label: 'Seans başlat' },
  { hash: '#/morning-pain', label: 'Sabah ağrısı girişi' },
  { hash: '#/rom', label: 'ROM ölçümü' },
];

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="stack" style={{ marginTop: '8px' }}>
      <strong>{label}</strong>
      <div class="row">
        <input type="text" readOnly value={url} aria-label={`${label} linki`} onFocus={(e) => (e.target as HTMLInputElement).select()} />
        <button
          class="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* user can select the field manually */
            }
          }}
        >
          {copied ? '✓' : 'Kopyala'}
        </button>
      </div>
    </div>
  );
}

export function ShortcutsScreen() {
  const base = `${location.origin}${location.pathname}`;
  return (
    <div class="stack">
      <PageHeader title="iOS Kısayol kurulumu" back={{ href: '#/settings', label: 'Ayarlar' }} />
      <p>
        iOS, ana ekran uygulamalarına zamanlanmış bildirim gönderme imkânı vermiyor. Hatırlatmalar için iPhone'daki <strong>Kısayollar</strong> uygulamasının
        kişisel otomasyonlarını kullanıyoruz.
      </p>

      <section class="card orange callout">
        <strong>Önemli: Safari ile uygulama ayrı depolama kullanır.</strong> Kısayoldaki "URL'yi Aç" eylemi genellikle ana ekran uygulamasını değil{' '}
        <strong>Safari'yi</strong> açar. Safari'de girdiğin veriler RehabFlow uygulamasında <strong>görünmez</strong>. Bu yüzden aşağıdaki yöntemde kısayol sadece
        hatırlatır, uygulamayı sen ana ekran ikonundan açarsın.
        {!isStandalone() && <div style={{ marginTop: '6px' }}>Şu an bu sayfayı tarayıcı sekmesinde görüyorsun.</div>}
      </section>

      <section class="card stack">
        <h2 class="card-title">
          <IconBell aria-hidden="true" />
          Önerilen: bildirim otomasyonu
        </h2>
        <ol style={{ margin: '0px', paddingLeft: '20px' }}>
          <li>
            <strong>Kısayollar</strong> uygulamasını aç → alttan <strong>Otomasyon</strong> → <strong>+</strong> (Yeni Otomasyon).
          </li>
          <li>
            <strong>Günün Saati</strong> seç → örneğin <strong>09:00</strong>, <strong>Her Gün</strong> → <strong>Hemen Çalıştır</strong> → İleri.
          </li>
          <li>
            <strong>Yeni Boş Otomasyon</strong> → eylem ara: <strong>Bildirim Göster</strong>.
          </li>
          <li>
            Metin: <em>"Sabah ağrını gir — RehabFlow"</em> → Bitti.
          </li>
          <li>Bildirim gelince ana ekrandaki RehabFlow ikonuna dokun. Bugün ekranı eksik girişi kartla gösterir.</li>
        </ol>
        <p class="small muted" style={{ margin: '0px' }}>
          Aynı adımlarla ikinci bir otomasyon kur: örneğin 18:00'de <em>"Seans zamanı"</em>. Haftalık ROM ölçümü için Pazar 10:00'da <em>"ROM ölç"</em>.
        </p>
      </section>

      <section class="card stack">
        <h2 class="card-title">
          <IconPhone aria-hidden="true" />
          Deep linkler
        </h2>
        <p class="small muted" style={{ margin: '0px' }}>
          Bu linkler uygulamanın ilgili ekranını doğrudan açar. Kısayoldan açtığında Safari açılıyorsa (yukarıdaki uyarı) bunları kullanma; verilerin ana ekran
          uygulamasında kalsın. Davranış iOS sürümüne göre değişebilir; kendi telefonunda bir kez dene.
        </p>
        {LINKS.map((l) => (
          <CopyLink key={l.hash} url={`${base}${l.hash}`} label={l.label} />
        ))}
      </section>

      <section class="card small muted">
        Uygulama içi hatırlatmalar: Bugün ekranı açılışta dünkü sabah ağrısı girilmemişse ve son 7 günde ROM ölçümü yoksa kart gösterir.
      </section>
    </div>
  );
}
