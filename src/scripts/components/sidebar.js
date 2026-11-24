import { t } from '../core/i18n.js';

const DASHBOARD_NAV = [
  { id: 'overview', key: 'nav.overview', icon: '📊' },
  { id: 'techAnalysis', key: 'nav.techAnalysis', icon: '🔬' },
  { id: 'viral', key: 'nav.viral', icon: '🔥' },
  { id: 'comparisons', key: 'nav.comparisons', icon: '⚖️' },
  { id: 'audience', key: 'nav.audience', icon: '👥' },
  { id: 'times', key: 'nav.times', icon: '🕐' },
  { id: 'trends', key: 'nav.trends', icon: '📈' },
  { id: 'insights', key: 'nav.insights', icon: '💡' },
  { id: 'schedule', key: 'nav.schedule', icon: '📅' },
  { id: 'ideas', key: 'nav.ideas', icon: '🧠' },
  { id: 'checklist', key: 'nav.checklist', icon: '✅' }
];

export function renderSidebar(container, {
  activeSection = 'overview',
  theme = 'system',
  themeLabel = {},
  isConnected = false,
  onNavigate = () => {},
  onToggleTheme = () => {},
  onSignOut = () => {},
  onSignIn = () => {}
} = {}) {
  if (!container) return;

  const navBtn = (item) => `
    <li>
      <button data-section="${item.id}"
        class="genfy-nav-btn w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition text-left ${
          activeSection === item.id
            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
        }">
        <span class="w-5 text-center flex-shrink-0">${item.icon}</span>
        <span class="truncate">${t(item.key)}</span>
      </button>
    </li>
  `;

  const youtubeSubmenu = isConnected
    ? `<ul class="space-y-1 mt-2">${DASHBOARD_NAV.map(navBtn).join('')}</ul>`
    : `
        <div class="mt-2 px-3 py-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 space-y-3">
          <p class="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            ${t('sidebar.connectPrompt')}
          </p>
          <button id="btn-sidebar-signin"
            class="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2.5 rounded-lg transition shadow-sm">
            <span>▶️</span> ${t('sidebar.signIn')}
          </button>
        </div>
      `;

  container.innerHTML = `
    <style>
      .genfy-youtube-details > summary .genfy-chevron {
        transition: transform 200ms ease;
      }
      .genfy-youtube-details[open] > summary .genfy-chevron {
        transform: rotate(90deg);
      }
      .genfy-youtube-details > summary::-webkit-details-marker { display: none; }
      .genfy-youtube-details > summary { list-style: none; }
    </style>

    <div class="flex flex-col h-full">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">${t('app.name')}</div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">${t('app.tagline')}</p>
      </div>

      <nav class="flex-1 overflow-y-auto py-4 px-4 space-y-6 custom-scrollbar">
        <div>
          <p class="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">${t('nav.menu')}</p>
          <ul class="space-y-1">
            <li>
              <a href="dashboard.html" class="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-300">
                <span class="w-5 text-center flex-shrink-0">🏠</span>
                <span class="truncate">${t('nav.mainDashboard')}</span>
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p class="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">${t('nav.platforms')}</p>
          <ul class="space-y-1">
            <li>
              <details class="genfy-youtube-details" ${isConnected ? 'open' : ''}>
                <summary class="flex items-center space-x-3 px-3 py-2 rounded-lg cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-300">
                  <span class="w-5 text-center flex-shrink-0">▶️</span>
                  <span class="flex-1 truncate font-medium">YouTube</span>
                  <span class="genfy-chevron text-gray-400 text-lg leading-none">›</span>
                </summary>
                <div class="w-full pl-4 pr-2 py-2 border-l-2 border-gray-200 dark:border-gray-700 ml-4 mt-1">
                  ${youtubeSubmenu}
                </div>
              </details>
            </li>

            <li>
              <a href="#" class="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-400 dark:text-gray-500 cursor-not-allowed" title="${t('nav.comingSoon')}">
                <span class="w-5 text-center flex-shrink-0">📸</span>
                <span class="truncate">${t('nav.instagram')} <span class="text-[10px] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded ml-1">${t('nav.comingSoon')}</span></span>
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p class="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">${t('nav.system')}</p>
          <ul class="space-y-1">
            ${navBtn({ id: 'settings', key: 'nav.settings', icon: '⚙️' })}
          </ul>
        </div>
      </nav>

      <div class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3 bg-gray-50 dark:bg-gray-800/50">
        <div class="flex items-center gap-2 text-xs px-1">
          <span class="w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}"></span>
          <span class="text-gray-500 dark:text-gray-400 font-medium">
            ${isConnected ? t('sidebar.connected') : t('sidebar.disconnected')}
          </span>
        </div>

        <button id="btn-theme"
          class="w-full text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg py-2 hover:bg-white dark:hover:bg-gray-700 transition flex items-center justify-center gap-2">
          <span>🎨</span> ${t('sidebar.theme', { theme: themeLabel[theme] || theme })}
        </button>

        ${isConnected ? `
          <button id="btn-sidebar-signout"
            class="w-full text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg py-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex items-center justify-center gap-2">
            <span>🚪</span> ${t('sidebar.signOut')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  container.querySelectorAll('.genfy-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onNavigate(btn.dataset.section);
    });
  });

  const themeBtn = container.querySelector('#btn-theme');
  if (themeBtn) themeBtn.addEventListener('click', onToggleTheme);

  const signOutBtn = container.querySelector('#btn-sidebar-signout');
  if (signOutBtn) signOutBtn.addEventListener('click', onSignOut);

  const signInBtn = container.querySelector('#btn-sidebar-signin');
  if (signInBtn) signInBtn.addEventListener('click', onSignIn);
}
