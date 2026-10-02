import { useEffect, useState } from 'preact/hooks';
import { Modal } from './components/Modal';
import { TabBar } from './components/TabBar';
import { discardActiveSession, getActiveProgress } from './db/repo';
import { applyUpdate, needRefresh } from './platform/pwa';
import { match, navigate, route } from './router';
import { Archive } from './screens/Archive';
import { MorningPain } from './screens/MorningPain';
import { Progress } from './screens/Progress';
import { SessionScreen } from './screens/session/SessionScreen';
import { BackupScreen } from './screens/settings/BackupScreen';
import { ExerciseForm } from './screens/settings/ExerciseForm';
import { ProgramList } from './screens/settings/ProgramList';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { Today } from './screens/Today';
import { prefs, sessionActive } from './state';

function Screen({ path }: { path: string }) {
  if (path === '/') return <Today />;
  if (path === '/session') return <SessionScreen />;
  if (path === '/morning-pain') return <MorningPain />;
  if (path === '/progress') return <Progress />;
  if (path === '/archive') return <Archive />;
  if (path === '/settings') return <SettingsScreen />;
  if (path === '/settings/program') return <ProgramList />;
  if (path === '/settings/backup') return <BackupScreen />;
  const ex = match('/settings/program/:id', path);
  if (ex) return <ExerciseForm id={ex.id} />;
  return (
    <div class="card">
      <h1>Sayfa bulunamadı</h1>
      <a class="btn" href="#/">
        Bugün'e dön
      </a>
    </div>
  );
}

export function App() {
  const path = route.value;
  const hideChrome = path === '/session' && sessionActive.value;
  const [onboarding, setOnboarding] = useState(!prefs.onboarded);
  const [resumePrompt, setResumePrompt] = useState(false);

  // An unfinished session from a previous run: ask "Devam et / Sil".
  useEffect(() => {
    void getActiveProgress().then((p) => {
      if (p && route.value !== '/session') setResumePrompt(true);
    });
  }, []);

  return (
    <>
      <main class={`app${hideChrome ? ' no-tabs' : ''}`}>
        {needRefresh.value && !sessionActive.value && (
          <div class="banner info" role="status">
            <span class="grow">Güncelleme var.</span>
            <button class="btn primary" onClick={applyUpdate}>
              Yenile
            </button>
          </div>
        )}
        <Screen path={path} />
      </main>
      {!hideChrome && <TabBar />}

      {onboarding && (
        <Modal title="RehabFlow'a hoş geldin">
          <p>
            <strong>Bu uygulama tıbbi tavsiye vermez.</strong> Uyarılar senin ayarladığın eşiklere göre çalışır.{' '}
            <strong>Eşikleri fizyoterapistinle birlikte belirle.</strong>
          </p>
          <p>Tüm veriler sadece bu cihazda durur. Uygulama silinirse veriler de gider; düzenli yedek al.</p>
          <p class="small muted">
            iPhone'da Safari → Paylaş → <em>Ana Ekrana Ekle</em> ile kur. Safari sekmesinde girilen veriler ana ekran
            uygulamasında görünmez (ayrı depolama kullanırlar).
          </p>
          <div class="actions">
            <button
              class="btn primary big block"
              onClick={() => {
                prefs.setOnboarded();
                setOnboarding(false);
              }}
            >
              Anladım
            </button>
          </div>
        </Modal>
      )}

      {resumePrompt && !onboarding && (
        <Modal
          title="Yarım kalan seans var"
          actions={
            <>
              <button
                class="btn primary big block"
                onClick={() => {
                  setResumePrompt(false);
                  navigate('/session');
                }}
              >
                Devam et
              </button>
              <button
                class="btn danger block"
                onClick={async () => {
                  await discardActiveSession();
                  setResumePrompt(false);
                }}
              >
                Sil
              </button>
            </>
          }
        >
          <p>Uygulama seans sırasında kapanmış. Kaldığın yerden devam edebilir ya da seansı silebilirsin.</p>
        </Modal>
      )}
    </>
  );
}
