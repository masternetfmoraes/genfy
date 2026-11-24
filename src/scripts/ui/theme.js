// src/scripts/ui/theme.js
// GENFY — gerenciamento de tema (system | light | dark).
// Não conhece o resto do app: expõe funções puras + watcher do SO.

export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABEL = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };

let mql = null;
let changeListener = null;
let attached = false;

function getMql() {
  if (!mql) mql = window.matchMedia('(prefers-color-scheme: dark)');
  return mql;
}

export function systemPrefersDark() {
  return getMql().matches;
}

/**
 * Aplica o tema ao <html>. Adiciona:
 *  - class "dark" (usada pelo @custom-variant do Tailwind)
 *  - data-theme        → 'system' | 'light' | 'dark'
 *  - data-theme-resolved → 'light' | 'dark' (tema efetivo)
 *  - color-scheme (formulários nativos seguem o tema)
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.classList.toggle('dark', dark);
  root.dataset.theme = theme;
  root.dataset.themeResolved = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  return dark;
}

export function nextTheme(theme) {
  const idx = THEMES.indexOf(theme);
  return THEMES[(idx + 1) % THEMES.length];
}

/**
 * Observa mudanças no tema do SO. Só reaplica quando o tema atual é 'system'.
 * Idempotente: pode ser chamada várias vezes sem acumular listeners.
 *
 * @param {() => string} getTheme  retorna o tema atual ('system' | 'light' | 'dark')
 * @param {() => void}   [onChange] callback opcional após reaplicar
 */
export function watchSystemTheme(getTheme, onChange) {
  const m = getMql();
  if (attached && changeListener) m.removeEventListener('change', changeListener);

  changeListener = () => {
    const current = typeof getTheme === 'function' ? getTheme() : getTheme;
    if (current === 'system') {
      applyTheme('system');
      if (typeof onChange === 'function') onChange();
    }
  };

  m.addEventListener('change', changeListener);
  attached = true;

  return () => {
    m.removeEventListener('change', changeListener);
    attached = false;
  };
}