export const CACHE_KEY = 'genfy_channel_cache';
export const PREFS_KEY = 'genfy_prefs';
export const SCHEDULER_KEY = 'genfy_scheduler_cache';
export const CHECKLIST_KEY = 'genfy_checklist_cache';
export const PUBLICATIONS_KEY = 'genfy_publications_cache';
export const QUOTA_KEY = 'genfy_youtube_quota';
export const METADATA_CACHE_KEY = 'genfy_youtube_metadata_cache';
export const TRENDING_CACHE_KEY = 'genfy_trending_cache';
export const GEMINI_KEY_STORAGE = 'genfy_gemini_api_key';
export const GEMINI_SETTINGS_STORAGE = 'genfy_gemini_settings';
export const MOCK_ENTITLEMENT_KEY = 'genfy_mock_entitlement';

export const APP_VERSION = '1.0.0';

export const PERIOD_DAYS = { '7d': 7, '28d': 28, '90d': 90, all: null };
export const PERIOD_LABELS = { '7d': '7 dias', '28d': '28 dias', '90d': '90 dias', all: 'Tudo' };

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export const HOUR_BLOCKS = [
  { key: 'madrugada', label: 'Madrugada', range: '00h–05h', start: 0, end: 5 },
  { key: 'manha', label: 'Manhã', range: '06h–11h', start: 6, end: 11 },
  { key: 'tarde', label: 'Tarde', range: '12h–17h', start: 12, end: 17 },
  { key: 'noite', label: 'Noite', range: '18h–23h', start: 18, end: 23 }
];

export const STOPWORDS = new Set([
  'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'para', 'com', 'em',
  'um', 'uma', 'uns', 'umas', 'que', 'como', 'seu', 'sua', 'seus', 'suas', 'no',
  'na', 'nos', 'nas', 'por', 'se', 'ou', 'é', 'são', 'foi', 'ser', 'ao', 'aos',
  'à', 'às', 'mais', 'mas', 'também', 'já', 'só', 'tem', 'têm', 'esse', 'essa',
  'isso', 'este', 'esta', 'isto', 'pelo', 'pela', 'entre', 'sem', 'até', 'sobre',
  'vs', 'parte', 'ep', 'episódio', 'aula'
]);

export const MIN_FOR_TIME_ANALYSIS = 5;
export const MIN_FOR_TOPICS = 3;
export const MIN_FOR_TREND = 4;
export const MIN_FOR_CONSISTENCY = 3;
export const TOPIC_MIN_OCCURRENCES = 2;

export const DEFAULT_CHECKLIST = {
  seoTitle: false,
  thumbnail: false,
  description: false,
  tags: false,
  endScreen: false,
  cards: false
};

export const CHECKLIST_ITEMS = [
  { key: 'seoTitle', label: 'Título otimizado para SEO (palavra-chave no início)' },
  { key: 'thumbnail', label: 'Thumbnail de alta qualidade e legível em mobile' },
  { key: 'description', label: 'Descrição com resumo, links e timestamps' },
  { key: 'tags', label: 'Tags relevantes preenchidas' },
  { key: 'endScreen', label: 'Tela final (End Screen) configurada' },
  { key: 'cards', label: 'Cards (informações) adicionados em pontos estratégicos' }
];

export const SCHEDULER_STATUS_LABELS = {
  ideia: '💡 Ideia',
  roteiro: '📝 Roteiro',
  agendado: '📅 Agendado',
  publicado: '✅ Publicado'
};

export const QUOTA_LIMIT = 10000;
export const QUOTA_COSTS = {
  videosInsert: 1600,
  videosUpdate: 50,
  videosDelete: 50,
  thumbnailsSet: 50,
  videosList: 1,
  videoCategoriesList: 1,
  i18nLanguagesList: 1,
  searchList: 1
};
export const VIDEO_UPLOAD_COST = QUOTA_COSTS.videosInsert + QUOTA_COSTS.thumbnailsSet;
export const QUOTA_TIMEZONE = 'America/Los_Angeles';

export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
export const UPLOAD_TIMEOUT_MS = 120000;
export const MAX_VIDEO_BYTES = 256 * 1024 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAGS_LENGTH = 500;
export const MIN_SCHEDULE_LEAD_MS = 60 * 1000;

export const DEFAULT_VIDEO_CATEGORY_ID = '22';
export const DEFAULT_LANGUAGE = 'pt-BR';
export const DEFAULT_REGION_CODE = 'BR';

export const PUBLICATION_STATUS = {
  UPLOADING: 'uploading',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  CANCELED: 'canceled',
  FAILED: 'failed',
  PRIVATE: 'private'
};

export const PUBLICATION_STATUS_LABELS = {
  uploading: 'Enviando',
  scheduled: '📅 Agendado',
  published: '✅ Publicado',
  canceled: 'Cancelado',
  failed: 'Falhou',
  private: '🔒 Privado'
};

export const PUBLICATION_PRIVACY_LABELS = {
  public: 'Público',
  unlisted: 'Não listado',
  private: 'Privado'
};

export const TRENDING_MODES = {
  charts: 'charts',
  rising: 'rising'
};

export const DEFAULT_TRENDING_MODE = 'charts';
export const TRENDING_REGIONS = [
  { code: 'BR', label: 'Brasil' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'PT', label: 'Portugal' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'ES', label: 'Espanha' },
  { code: 'MX', label: 'México' },
  { code: 'AR', label: 'Argentina' },
  { code: 'FR', label: 'França' },
  { code: 'DE', label: 'Alemanha' },
  { code: 'JP', label: 'Japão' }
];

export const FALLBACK_CATEGORIES = [
  { id: '1', title: 'Film & Animation' },
  { id: '2', title: 'Autos & Vehicles' },
  { id: '10', title: 'Music' },
  { id: '15', title: 'Pets & Animals' },
  { id: '17', title: 'Sports' },
  { id: '19', title: 'Travel & Events' },
  { id: '20', title: 'Gaming' },
  { id: '22', title: 'People & Blogs' },
  { id: '23', title: 'Comedy' },
  { id: '24', title: 'Entertainment' },
  { id: '25', title: 'News & Politics' },
  { id: '26', title: 'Howto & Style' },
  { id: '27', title: 'Education' },
  { id: '28', title: 'Science & Technology' },
  { id: '29', title: 'Nonprofits & Activism' }
];

export const FALLBACK_LANGUAGES = [
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'en', name: 'Inglês' },
  { code: 'es', name: 'Espanhol' }
];
