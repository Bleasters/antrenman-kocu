import { route } from '../router';
import { IconChart, IconGear, IconHome, IconImage, IconPlay } from './Icons';

const TABS = [
  { path: '/', label: 'Bugün', Icon: IconHome },
  { path: '/session', label: 'Seans', Icon: IconPlay },
  { path: '/progress', label: 'İlerleme', Icon: IconChart },
  { path: '/archive', label: 'Arşiv', Icon: IconImage },
  { path: '/settings', label: 'Ayarlar', Icon: IconGear },
];

export function TabBar() {
  const cur = route.value;
  return (
    <div class="tabbar">
      <nav aria-label="Ana menü">
        {TABS.map(({ path, label, Icon }) => {
          const active = path === '/' ? cur === '/' : cur === path || cur.startsWith(`${path}/`);
          return (
            <a key={path} href={`#${path}`} aria-current={active ? 'page' : undefined}>
              <Icon />
              {label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
