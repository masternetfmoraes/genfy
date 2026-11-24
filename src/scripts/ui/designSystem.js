// src/scripts/ui/designSystem.js
// GENFY — design system. TODAS as classes Tailwind reutilizáveis vivem aqui.
// Trocar a identidade visual do GENFY = editar este arquivo + `styles/input.css`.
//
// Convenção: UI.<slot> é uma string de classes pronta para uso em template literals.

export const UI = {
  // ---- Tipografia Base ----
  font: 'font-[\'Inter\',_system-ui,_sans-serif]',

  // ---- Superfícies ----
  card: 'bg-white dark:bg-gray-800 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-100 dark:border-gray-700 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600',
  surface: 'bg-white dark:bg-gray-800',
  pageBg: 'bg-gray-50/80 dark:bg-gray-900',
  border: 'border-gray-200 dark:border-gray-700',
  divider: 'border-gray-100 dark:border-gray-700',

  // ---- Texto ----
  text: 'text-gray-700 dark:text-gray-200',
  textStrong: 'text-gray-900 dark:text-white font-semibold',
  textBody: 'text-gray-600 dark:text-gray-300',
  muted: 'text-gray-400 dark:text-gray-500',
  textXS: 'text-xs text-gray-500 dark:text-gray-400',

  // ---- Estados / Cores Semânticas ----
  primary: 'text-indigo-600 dark:text-indigo-400',
  primaryBg: 'bg-indigo-600 dark:bg-indigo-500',
  primaryBgHover: 'hover:bg-indigo-700 dark:hover:bg-indigo-600',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',

  // ---- Botões ----
  buttonBase: 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonPrimary: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-4 py-2 text-sm shadow-sm',
  buttonDanger: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 text-white px-4 py-2 text-sm shadow-sm',
  buttonSecondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-sm',
  buttonGhost: 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 px-4 py-2 text-sm rounded-xl',
  buttonPill: 'px-3 py-1 text-xs font-semibold rounded-full transition-colors',
  buttonPillActive: 'bg-indigo-600 text-white dark:bg-indigo-500',
  buttonPillIdle: 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',

  // ---- Inputs ----
  input: 'text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all',

  // ---- Badges Base ----
  badgeBase: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border',

  // Badges de Prioridade
  badgePriorityHigh: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
  badgePriorityMedium: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  badgePriorityLow: 'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',

  // Badges de Status
  badgeStatusActive: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  badgeStatusPlanning: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  badgeStatusCompleted: 'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  badgeStatusOnHold: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',

  // Badges de Desempenho
  badgeCalc: 'text-indigo-700 bg-indigo-50 border-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-800',
  badgeAbove: 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800',
  badgeBelow: 'text-rose-700 bg-rose-50 border-rose-100 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800',
  badgeAverage: 'text-gray-600 bg-gray-50 border-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700',

  // ---- Barra de Progresso ----
  progressTrack: 'h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden',
  progressFill: 'h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500 ease-out',

  // ---- Avatares ----
  avatar: 'flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-xs border-2 border-white dark:border-gray-800',
  avatarGroup: 'flex -space-x-2', // Faz os avatares se sobreporem levemente

  // ---- Navegação ----
  navActive: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-semibold',
  navIdle: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',

  // ---- Layout de Seção ----
  section: 'space-y-4 pt-2',
  sectionTitle: 'text-lg font-bold text-gray-900 dark:text-white tracking-tight',
  sectionSubtitle: 'text-sm text-gray-500 dark:text-gray-400 mt-1'
};

/** Junta partes de className ignorando falsy. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Badge de desempenho (acima / abaixo / na média). */
export function performanceBadgeClass(key) {
  if (key === 'above') return UI.badgeAbove;
  if (key === 'below') return UI.badgeBelow;
  return UI.badgeAverage;
}

/** Badge de Prioridade (high / medium / low). */
export function priorityBadgeClass(level) {
  const l = level?.toLowerCase();
  if (l === 'high' || l === 'alta') return UI.badgePriorityHigh;
  if (l === 'medium' || l === 'media' || l === 'média') return UI.badgePriorityMedium;
  return UI.badgePriorityLow;
}

/** Badge de Status (active, planning, completed, on-hold). */
export function statusBadgeClass(status) {
  const s = status?.toLowerCase().replace(/\s+/g, '');
  if (s === 'active' || s === 'ativo') return UI.badgeStatusActive;
  if (s === 'planning' || s === 'planejamento') return UI.badgeStatusPlanning;
  if (s === 'completed' || s === 'concluído') return UI.badgeStatusCompleted;
  if (s === 'onhold' || s === 'pausado') return UI.badgeStatusOnHold;
  return UI.badgeStatusCompleted; // fallback
}

/** Badge "Calculado pelo GENFY" pronto para inserir via innerHTML. */
export const CALC_BADGE_TITLE = 'Este valor não vem diretamente do YouTube — foi calculado pelo GENFY a partir dos dados disponíveis.';
export const CALC_BADGE_HTML = `<span class="${cx(UI.badgeBase, UI.badgeCalc)}" title="${CALC_BADGE_TITLE}">✨ Calculado pelo GENFY</span>`;