import { render } from 'preact';
import './styles/base.css';
import { App } from './app';
import { db } from './db/db';
import { ensureSeeded } from './db/seed';
import { setupPwa } from './platform/pwa';
import { requestPersistence } from './platform/storage';

async function boot() {
  try {
    await ensureSeeded(db);
  } catch (e) {
    console.error('seed failed', e);
  }
  void requestPersistence();
  render(<App />, document.getElementById('app')!);
  setupPwa();
}

void boot();
