// Camada de i18n. As traduções ficam isoladas por locale e o restante do app
// consome apenas t('chave', variaveis). Novos idiomas = novo objeto em LOCALES.
// Observação: a prosa analítica (insights/descrições) ainda está em pt-BR;
// a extração completa é incremental e não afeta a arquitetura abaixo.

const LOCALES = {
  'pt-BR': {
    'app.name': 'GENFY',
    'app.tagline': 'YouTube Intelligence',
    'app.dashboardTitle': 'Dashboard do YouTube',
    'app.intelligence': 'GENFY — YouTube Intelligence Layer',

    'nav.menu': 'Menu',
    'nav.platforms': 'Plataformas',
    'nav.system': 'Sistema',
    'nav.mainDashboard': 'Dashboard Principal',
    'nav.settings': 'Configurações',
    'nav.instagram': 'Instagram',
    'nav.comingSoon': 'Em breve',
    'nav.overview': 'Visão Geral',
    'nav.techAnalysis': 'Análise Técnica por IA',
    'nav.comparisons': 'Comparativos',
    'nav.audience': 'Público',
    'nav.times': 'Horários',
    'nav.trends': 'Tendências',
    'nav.viral': 'Em alta no YouTube',
    'nav.insights': 'Insights',
    'nav.schedule': 'Agendador',
    'nav.ideas': 'Gerador de Ideias',
    'nav.checklist': 'Checklist',

    'sidebar.connectPrompt': 'Conecte sua conta para desbloquear análises de desempenho, agendador e ferramentas de criação.',
    'sidebar.signIn': 'Entrar com Google',
    'sidebar.connected': 'YouTube conectado',
    'sidebar.disconnected': 'Não conectado',
    'sidebar.signOut': 'Sair da conta',
    'sidebar.theme': 'Tema: {theme}',

    'header.connected': 'YouTube conectado',
    'header.refresh': 'Atualizar',
    'header.period': 'Filtro de período',

    'section.overview': 'Visão Geral',
    'section.techAnalysis': 'Análise Técnica por IA',
    'analysis.heading': 'Análises técnicas por IA',
    'analysis.rawData': 'Dados brutos do YouTube',
    'analysis.seoData': 'SEO (dados brutos)',
    'analysis.channelButton': 'Analisar canal com Gemini',
    'analysis.channelModal': 'Análise geral do canal (Gemini)',
    'section.comparisons': 'Conteúdos de maior desempenho',
    'section.audience': 'Público',
    'section.times': 'Melhor horário para publicar',
    'section.schedule': 'Agendador de Conteúdo',
    'section.ideas': 'Gerador de Ideias',
    'section.checklist': 'Checklist de Publicação',
    'section.insights': 'GENFY Insights',
    'section.trends': 'Tendências do canal',
    'section.viral': 'Em alta no YouTube',
    'section.settings': 'Configurações',

    'auth.title': 'Conecte sua conta do YouTube',
    'auth.description': 'O GENFY precisa da sua autorização para ler os dados públicos do seu canal, gerenciar seu agendador e gerar análises avançadas.',
    'auth.signIn': 'Entrar com Google',
    'auth.connecting': 'Conectando ao Google...',
    'error.title': 'Não foi possível carregar os dados.',
    'error.retry': 'Tentar novamente',
    'common.loading': 'Carregando...'
  }
};

const DEFAULT_LOCALE = 'pt-BR';
let currentLocale = DEFAULT_LOCALE;

export function setLocale(locale) {
  currentLocale = LOCALES[locale] ? locale : DEFAULT_LOCALE;
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

export function availableLocales() {
  return Object.keys(LOCALES);
}

export function t(key, vars = {}) {
  const dict = LOCALES[currentLocale] || LOCALES[DEFAULT_LOCALE];
  const template = dict[key] ?? LOCALES[DEFAULT_LOCALE][key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? vars[name] : ''));
}
