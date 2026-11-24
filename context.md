# GENFY — Contexto do Projeto (context.md)

> Arquivo de referência para retomar o trabalho após parada inesperada.
> Projeto: extensão Chrome MV3 "GENFY — YouTube Intelligence".
> Raiz: `/home/fabiano/Documentos/genfy`.
> Git (desde 24/11/2026): remote `https://github.com/masternetfmoraes/genfy.git`;
> `main` e `feature/genfy-dashboard` publicadas; projeto em `84da52e`.

## 1. Visão geral

Dashboard de inteligência para YouTube que abre em uma **nova aba** (override de newtab).
Funcionalidades: desempenho dos vídeos, melhor horário de publicação, público (YouTube
Analytics), tendências, insights, agendador de conteúdo, gerador de ideias, checklist e
publicação/agendamento de vídeos diretamente no navegador (sem backend).

- Runtime: apenas Chrome/Chromium (usa `chrome.identity.getAuthToken`).
- Sem dependências de runtime; Tailwind v4 como devDependency.
- OAuth incremental: leitura → Analytics → publicação.

### Estado de monetização (retomada rápida)

- **Já temos**: modelo Free/Pro, cota de 5 análises IA/mês por conta Google, bloqueio de
  XLS/PDF no Free e backend **simulado** de entitlements, com painel para testar troca de
  plano, reset de contador e reembolso (`src/scripts/config.js:1` → `BACKEND_MODE = 'mock'`).
- **Ainda não temos**: cobrança real, checkout Paddle, webhooks, Firebase/backend em produção.
  Paddle é a decisão registrada, mas não está integrado.
- **Limite atual**: o mock não é fronteira de segurança; a chave Gemini continua no cliente.
  Vira monetização real quando o backend validar token/`sub` e cota, e o Gemini passar a ser
  chamado pelo backend.
- **Próximo passo natural**: backend de entitlements + webhook Paddle; depois mover o Gemini
  para esse backend e trocar `BACKEND_MODE` para `'http'`. Detalhes na seção 23.

## 2. Stack e comandos

- Node.js >= 20 (testado 20+). Chrome 102+.
- `npm ci`
- `npm run build:css` — gera `src/styles/output.css` (Tailwind v4 minificado).
- `npm run watch:css` — rebuild contínuo.
- `npm run lint` — `node --check` em todos JS/MJS + validação do manifest/imports.
- `npm test` — runner nativo do Node (`node --test`), 101 testes, 0 falhas.
- `npm run validate` — lint + testes.
- CI: `.github/workflows/ci.yml` (Node 22, lint, test, build:css).

Estado atual verificado: **lint OK (61 arquivos)**, **101/101 testes passando**.

## 3. Manifest (MV3)

`manifest.json` v1.0.0. Permissões: `identity`, `storage`. Host: googleapis/youtubeanalytics
e `generativelanguage.googleapis.com` (Gemini, reintroduzido na seção 16).
OAuth client_id Chrome Extension. Scopes iniciais: `youtube.readonly`. Escopos adicionais
(Analytics, publish) pedidos em runtime. `chrome_url_overrides.newtab` → dashboard.html.
Service worker: `src/scripts/background.js`. CSP: `script-src 'self'`.

## 4. Estrutura de pastas

```
src/
  pages/dashboard.html, popup.html
  scripts/
    background.js, popup.js, constants.js, config.js
     core/           analysis.js, comments.js, csv.js, format.js, i18n.js, quota.js
    pages/dashboard/ app.js (boot/controller), state.js, render.js, enhancements.js, charts.js
    services/       storage.js
    services/entitlement/  entitlementClient.js, mockAdapter.js, httpAdapter.js, plans.js, errors.js
    services/youtube/ youtubeApi.js, youtubeAuth.js, youtubeService.js, youtubeAnalyticsService.js
    modules/youtube/publishing/  controller, pages, services, utils
    components/sidebar.js
    ui/ designSystem.js, theme.js
  styles/ input.css, output.css, genfy-theme.css
  assets/icons/
test/  (16 arquivos *.test.js)
scripts/lint.mjs
```

## 5. Módulos principais e responsabilidades

- `core/analysis.js`: funções puras (filtros por período, médias/medianas, melhor dia/hora/combo,
  tópicos, consistência, saúde do canal, tendência, insights, recomendações, calendário, ideias).
- `core/csv.js`: CSV com proteção contra formula injection (prefixo `'`).
- `core/format.js`: escape HTML, formatação pt-BR, safeViews, isValidVideo.
- `core/i18n.js`: dicionário pt-BR + `t(key, vars)`. Prosas analíticas ainda pt-BR.
- `core/quota.js`: cota diária estimada (10.000/dia, Pacific Time), persistida.
- `services/storage.js`: chrome.storage.local com fallback localStorage.
- `services/youtube/youtubeApi.js`: HTTP (timeout 15s, retry 3x, validação, MAX 50 IDs).
- `services/youtube/youtubeAuth.js`: chrome.identity, escopos incrementais, sessão persistida,
  restore/silent/refresh, clearToken.
- `services/youtube/youtubeService.js`: canal + amostra paginada de 50 vídeos + stats.
- `services/youtube/youtubeAnalyticsService.js`: reports.query, cache por canal+período (30min),
  demografia/países/dispositivos/daily, transformação.
- `pages/dashboard/app.js`: boot, auth, load data, render connected, analytics, publishing mount,
  atalhos de teclado, exportações.
- `pages/dashboard/state.js`: estado central + persistência (prefs, scheduler, checklist, publications).
- `pages/dashboard/render.js`: HTML de seções.
- `modules/youtube/publishing/*`: formulário de upload, upload resumable em chunks, agendamento
  (publishAt), metadados, categorias/idiomas, status refresh, cancelar/remarcar/excluir.

## 6. Fluxo de boot

1. `boot()` em `app.js`: `loadPersistedState()` (prefs, scheduler, publications, checklist).
2. Aplica tema. Atalhos de teclado.
3. Se `wasSignedIn()`:
   - Se cache de canal existe, exibe conectado (cache) e status loading.
   - `render()`.
   - `restoreSession()` (silent token maior escopo → degradação progressiva).
   - Se token: `loadData(token, {silent})` (canal + 50 vídeos, cache em storage).
   - Se não: limpa cache, signed-out.
4. Senão: render signed-out.

Login manual: `handleSignIn` → `signIn()` (interactive, escopo readonly) → `loadData`.

## 7. Autenticação e escopos

- `SCOPE_YOUTUBE` = youtube.readonly (login base).
- `SCOPE_ANALYTICS` = yt-analytics.readonly (incremental via `authorizeAnalytics`).
- `SCOPE_PUBLISH` = youtube (incremental via `authorizePublish`).
- `SCOPE_COMMENTS` = youtube.force-ssl (incremental via `authorizeComments`, necessário para `commentThreads.list`).
- Sessão persistida em `genfy_session` (signedIn, analytics, publish, comments).
- Tokens emitidos rastreados em `issuedTokens` para limpeza.
- 401/403 tratados com refresh; 403 `insufficientPermissions` em comentários marca `commentsGranted = false`.
- O `manifest.json` mantém apenas `youtube.readonly`; escopos extras são pedidos em runtime.
- A tela de consentimento do Cloud Console precisa incluir `youtube.force-ssl` (senão: `invalid_scope`).

## 8. Storage keys (constants.js)

- `genfy_channel_cache`, `genfy_prefs`, `genfy_scheduler_cache`, `genfy_checklist_cache`,
  `genfy_publications_cache`, `genfy_youtube_quota`, `genfy_youtube_metadata_cache`,
  `genfy_session`, `genfy_analytics_<channel>_<period>`, `genfy_trending_cache`,
  `genfy_gemini_api_key`, `genfy_gemini_settings`, `genfy_mock_entitlement` (somente modo simulado).


## 9. Publicação (detalhes)

- Upload resumable direto para `googleapis.com/upload/youtube/v3`.
- Chunk size 8 MB, timeout 120s, max 256 GB vídeo, thumbnail max 2 MB.
- Agendamento via `status.publishAt` (YouTube publica no horário mesmo com Chrome fechado).
- Cota estimada: `videos.insert` = 1600 + thumbnail 50; limite 10.000/dia PT.
- Status: uploading, scheduled, published, canceled, failed, private.
- Guarda `beforeunload` durante upload.
- Publicações filtradas por canal (channelId).

## 10. Análise (heurísticas)

- Amostra de 50 vídeos recentes (playlist uploads + videos.list em lotes de 50).
- Mínimos: time analysis 5, topics 3, trend 4, consistency 3, topic min occurrences 2.
- Channel Health experimental (recência, frequência, consistência, volume), com gráficos
  SVG de colunas (pontos x máximo), pizza (composição do score) e linha (intervalos entre
  publicações) no card da Visão geral (seção 24).
- Insights em pt-BR.

## 11. Testes

16 arquivos em `test/`: analysis, charts, comments, csv, dateRange, engagement, entitlement,
exporters, format, geminiAi, i18n, modules, publishing, youtubeApi, youtubeService,
youtubeTrending. Cobrem funções puras, validação, upload, metadados, cota, status de
publicações, módulos, classificação de erros do Gemini, retry/migração de modelo,
CSV/XLS/PDF de análise, tendências, comentários (agrupamento/ordenação/paginação),
`withReplies`, o backend simulado de assinaturas, a ordenação de conteúdo e os gráficos do
Channel Health. Todos passando (101).

## 12. Limitações conhecidas

- Idioma e novos vs. recorrentes não existem na Analytics API.
- Análise de horários usa data/hora de publicação + amostra recente.
- Channel Health/insights heurísticos experimentais.
- Upload exige aba aberta; falha exige reselecionar arquivo.
- Cota exibida é estimativa local.
- Thumbnail personalizada exige canal verificado.
- `publishAt` publica como público no horário.

## 13. Observações de retomada

> Atualização: o "Agendador de Conteúdo" manual (formulário local, calendário e exportação CSV)
> foi removido. O agendamento agora ocorre exclusivamente pelo módulo de publicação
> (`modules/youtube/publishing`), via `status.publishAt`. O mount point
> `#genfy-publication-root` permanece na seção "schedule" (renomeada para "Publicação no YouTube").

- Git ativo desde 24/11/2026 (`main` + `feature/genfy-dashboard`); `node_modules/` ignorado.
- Antes de mudanças grandes, crie branch e faça commit; backup antigo em `/tmp/opencode/genfy-rollback/`.
- `output.css` é gerado; não editar manualmente (rebuild via script).
- Lint não cobre estilo/unused; apenas sintaxe + imports + manifest.
- Tests importam módulos ESM; rodar com Node 20+.
- Ao alterar escopos OAuth, limpar sessão (`clearToken`) para reconsentimento.
- Cache do Analytics é por canal+período; troca de conta não reaproveita.
- Se adicionar novos arquivos JS, lint os valida automaticamente.

## 14. Próximos passos sugeridos (não iniciados)

- Extrair mais strings para i18n (prosa analítica).
- Se quiser métricas do YouTube Analytics **por vídeo** além dos dados brutos da Data API,
  ampliar `youtubeAnalyticsService.js` com `dimensions: 'video'` (cota extra).
- Testes de UI/DOM (atualmente apenas funções puras).
- Melhorar tratamento de erro de upload (retomada).
- Documentar endpoints/contratos da publishing API.
- Adicionar CHANGELOG (Git já versionado; histórico em `git log`).
- Validar no Chrome o fluxo de comentários após aceitar `youtube.force-ssl` e a nova posição de "Em alta".

## 15. Histórico: integração Gemini removida em 17/11/2026

Decisão: a integração implementada em 16/11/2026 foi retirada porque "não ficou boa".
Ela foi **reintroduzida no mesmo dia com escopo menor** (seção 16). Este registro serve
de histórico: como não há Git, não há como recuperar a versão antiga automaticamente.

### Motivo e lição

- UX/style inadequado e modelos configurable manualmente geravam falhas (ex.: ID padrão
  `gemini-3.8-flash` não é um modelo real). Antes de reimplementar, definir a UX e validar
  os modelos contra a lista oficial da API; considerar proxy/backend para não expor a chave.

### Arquivos que existiam e foram excluídos

- `src/scripts/services/ai/geminiConfig.js` — constantes, storage keys e lista de modelos.
- `src/scripts/services/ai/geminiClient.js` — HTTP: `POST .../v1beta/models/{model}:generateContent?key=...`
  e `GET .../v1beta/models?key=...` (filtrava modelos com `generateContent`).
- `src/scripts/services/ai/geminiErrors.js` — classificação de erros (INVALID_KEY, RATE_LIMIT,
  MODEL_UNAVAILABLE, cota diária, 429/503/5xx), retry/backoff e `Retry-After`.
- `src/scripts/services/ai/geminiService.js` — `generateGeminiContent`, `testGeminiConnection`,
  `detectGeminiModels`, `getGeminiUsageSnapshot`; retry + fallback de modelo.
- `src/scripts/services/ai/geminiStats.js` — contadores locais de uso/tokens/erros/testes.
- `test/geminiAi.test.js` e `docs/gemini-ai.md`.

### Pontos que precisam ser recriados

- Storage: `genfy_gemini_api_key`, `genfy_gemini_settings`, `genfy_gemini_stats`.
- Defaults: principal `gemini-3.8-flash`, alternativo `gemini-2.5-flash-lite`, fallback
  automático ligado, 3 tentativas. (Trocar por modelo válido ao reimplementar.)
- Host permission em `manifest.json`: `https://generativelanguage.googleapis.com/*`.
- `constants.js`: `GEMINI_KEY_STORAGE`.
- `state.js`: `contentAi`, `videoAi`, `geminiSettings`, `geminiStats` + carga via
  `getGeminiUsageSnapshot()` em `loadPersistedState()`.
- `app.js`: helpers de modal (`#genfy-ai-modal`), handlers de análise (canal/aba/vídeo),
  salvamento de chave/configuração, detecção/teste de conexão e os `else if` de delegamento
  de cliques em `boot()`.
- `render.js`: botão "Analisar canal com IA (Gemini)" em Insights, botões por vídeo e na
  aba de conteúdo, e painel "INTELIGÊNCIA ARTIFICIAL" em Configurações.
- `dashboard.html`: modal `#genfy-ai-modal` (`#genfy-ai-backdrop`, `#genfy-ai-close`, `#genfy-ai-body`).

Estado após remoção validado com `npm run validate`: lint OK (39 JS) e 47/47 testes.

## 16. Gemini reintroduzido em 17/11/2026 — análise individual por vídeo

Escopo atual (dialogado com o usuário): **sem análise automática de canal**. Ações:

1. Em **Configurações > Gemini**, o usuário cola a chave da API (`genfy_gemini_api_key`,
   `chrome.storage.local`) e escolhe o modelo (`genfy_gemini_settings`). Há botões
   "Detectar modelos" (lista modelos com `generateContent`) e "Testar conexão".
2. Na seção **Conteúdo** (abas Vídeos/Shorts/Comentários), cada linha de vídeo/short
   ganhou o botão "Analisar com Gemini". O clique é sob demanda; o resultado abre em
   um **acordeão abaixo daquele vídeo**, com estado por `video.id` em `state.videoGemini`.
3. Erros aparecem dentro do acordeão em vermelho, com mensagens específicas:
   chave inválida/ausente, API desabilitada, modelo indisponível, cota diária, limite
   por minuto, timeout, rede, sobrecarga/falha do serviço e filtro de segurança.
   Há botão "Tentar novamente"/"Reanalisar".

Arquivos da nova implementação (isolados para facilitar reversão):

- `src/scripts/services/ai/geminiConfig.js` — chave/storage, modelo padrão `gemini-3.5-flash-lite`,
  lista de modelos atuais e migração de IDs legados (`gemini-flash-latest`, 2.x).
- `src/scripts/services/ai/geminiClient.js` — `generateContent` (POST) e listagem (GET) com
  chave no header `x-goog-api-key`, 3 tentativas com backoff para 503/429/rede (60s no total).
- `src/scripts/services/ai/geminiErrors.js` — classificação de erros e mensagens pt-BR.
- `src/scripts/services/ai/geminiService.js` — prompt da análise individual, `analyzeVideo`,
  `testGeminiConnection`, `detectGeminiModels`.
- `test/geminiAi.test.js` — 9 testes de erros, prompt, migração de modelo e retry.
- `manifest.json` — host `https://generativelanguage.googleapis.com/*`.
- `constants.js` — `GEMINI_KEY_STORAGE` e `GEMINI_SETTINGS_STORAGE`.
- `state.js` — `gemini` e `videoGemini` (limpos em troca de período/aba e sign-out).
- `render.js` — botão/acordeão em `renderMediaRow` e painel em `renderSettings`.
- `app.js` — imports, helpers de análise/configuração e listeners em `wireConnectedListeners`.

Se o usuário pedir para **voltar etapa anterior** (sem Gemini): apagar a pasta
`src/scripts/services/ai/`, `test/geminiAi.test.js`, remover os imports/helpers/listeners
de `app.js` e `render.js`, os campos de `state.js`, as duas keys de `constants.js`, o host
do Gemini no `manifest.json` e o painel de Configurações. `dashboard.html` **não** foi
alterado nesta reintrodução (não há modal). Estado final esperado: lint OK (39 JS) e
47 testes — igual ao registrado no fim da seção 15.

## 17. Correção do 503 do Gemini (17/11/2026)

Sintoma: `POST .../models/gemini-flash-latest:generateContent?key=...` retornava 503.

Causa: 503 `UNAVAILABLE` é alta demanda/capacidade no servidor do Google, não erro do código.
O alias `gemini-flash-latest` aponta para o lançamento mais recente (hot-swap) e costuma
cair em modelos com fila; a lista fixa também continha modelos 2.x desativados em 2026.
Além disso, a chave ia na URL, aparecendo no console do Chrome.

Mudanças:
- `geminiConfig.js`: padrão `gemini-3.5-flash-lite`; lista com 3.5/3.6/3.8 e 3.1 Flash-Lite;
  `normalizeGeminiModel`/`isLegacyGeminiModel` migram automaticamente `gemini-flash-latest`
  e modelos 2.x salvos.
- `geminiClient.js`: chave no header `x-goog-api-key`; até 3 tentativas com backoff para
  503/429/5xx/rede (limite total 60s, 20s por tentativa); `generationConfig` removido
  (sampling é ignorado/não recomendado em Gemini 3.x e `maxOutputTokens` baixo cortava a
  resposta com pensamento ligado).
- `geminiErrors.js`: mensagem de 503 orienta a usar Flash-Lite se o retry esgotar.
- `app.js`: "Detectar modelos" filtra IDs legados e prefere Flash-Lite.
- `test/geminiAi.test.js`: 3 testes novos (migração, mensagem 503 e retry com header).

Se o 503 persistir mesmo no Flash-Lite, é indisponibilidade do lado do Google; conferir
status page e trocar de projeto/chave. A chave usada no log do usuário deve ser rotacionada.

Validação após a correção: `npm run validate` → lint OK (44 JS) e 56/56 testes.

## 18. Análise Técnica por IA — extensões de UI/export (17/11/2026)

Pedido do usuário: **não mexer no Gemini que já funciona**, apenas acrescentar:
1. Título "Análises técnicas por IA" acima das abas Vídeos/Shorts/Comentários no card de
   Conteúdo (`render.js`, `renderAiAnalysisCard`, dentro de `renderTechAnalysis`).
2. Novo item na sidebar, logo abaixo de "Conteúdo": "Análise Técnica por IA"
   (`sidebar.js` → `DASHBOARD_NAV`, id `techAnalysis`; `i18n.js` → `nav.techAnalysis`,
   `section.techAnalysis`, `analysis.heading`, `analysis.rawData`).
3. Nova seção `genfy-section-techAnalysis`, renderizada imediatamente após a seção
   `content` em `renderConnected()` (`app.js`). Ela reusa `renderContentList`, então
   mostra vídeos e shorts com os mesmos botões/estado de análise do card original
   (`state.videoGemini` compartilhado), mais botão "Exportar análises (CSV)".
4. Em cada linha de vídeo, linha "Dados brutos do YouTube" com visualizações, curtidas,
   comentários, duração e ID (`renderVideoDataLine`). Fonte: YouTube Data API (campos
   já presentes em `youtubeService.mapVideo`); **não** foram feitas novas chamadas à API,
   não há métricas por vídeo vindas do YouTube Analytics.
5. No fim do acordeão de análise pronta, botão "Exportar análise (CSV)" por vídeo.
   Exportação usa `toAnalysisCsv` (`core/csv.js`: cabeçalho fixo, dados brutos + texto da
   análise em uma linha, proteção contra formula injection) e `downloadFile`
   (`enhancements.js`: BOM UTF-8, delimitador `;`, nome `genfy-analise-<id>.csv` e
   `genfy-analises-<periodo>.csv`). Decisão: CSV por análise + CSV consolidado.
6. `state.videoGemini` passa a guardar `model` e `analyzedAt` quando a análise termina;
   isso é só metadado adicional — prompt, retry, chave e fluxo do Gemini seguem intactos.

Limitação: `videoGemini` continua não persistido e é limpo ao trocar período/aba/sair,
comportamento preservado de propósito. Assim, os exports só incluem análises da sessão
atual. Se o usuário quiser exportar depois, o próximo passo seria persistir o campo.

Validação final: `npm run validate` → lint OK (44 JS) e 58/58 testes.

## 19. Análise geral do canal em popup + XLS/PDF (17/11/2026)

Pedido do usuário: acrescentar, sem alterar o fluxo existente do Gemini por vídeo:
1. Botão **Analisar canal com Gemini** no rodapé do card `genfy-section-techAnalysis`,
   abrindo modal `#genfy-channel-ai-modal` com relatório técnico geral do canal.
2. O popup deve cobrir: resumo geral, análise técnica, melhores dias/horários, melhores
   vídeos, análise do melhor vídeo, assuntos a seguir, sugestões de vídeos/ideias e
   próximos passos; também permite reanalisar e exportar XLS/PDF.
3. Exportação de cada análise de vídeo e do consolidado em **XLS e PDF**, além do CSV
   já existente; a análise geral do popup também em XLS/PDF.

Implementação:
- `geminiService.js`: `buildChannelAnalysisPrompt(ctx)` + `analyzeChannel(ctx)`, usando
  `generateGeminiText` com o mesmo modelo/chave/retry da análise individual. O prompt é
  montado somente com heurísticas já existentes em `core/analysis.js` e dados brutos do
  YouTube Data API; não há nova chamada à API do YouTube.
- `state.js`: `state.channelGemini` (`open`, `status`, `text`, `error`, `model`,
  `analyzedAt`), limpo em troca de período, troca de aba Vídeos/Shorts/Comentários e
  sign-out, igual a `videoGemini` (não persistido).
- `render.js`: exporta `renderChannelModalBody`, renderiza o modal dentro da seção
  techAnalysis e adiciona botões CSV/XLS/PDF por vídeo e XLS/PDF consolidados no rodapé.
  `app.js` faz update incremental do modal (loading/ready/error), abre/fecha por botão,
  backdrop e `Escape`, e reconstrói o contexto de análise sob demanda.
- `core/exporters.js` (novo): `toXls`, `analysisXls`, `channelXls`, `toPdf`,
  `analysisPdf`, `channelPdf`. XLS é SpreadsheetML 2003 (`.xls`, BOM UTF-8,
  `application/vnd.ms-excel`), com escape XML e nome de aba sanitizado (<=31 caracteres).
  PDF é gerado localmente (A4, Helvetica/WinAnsi, xref, quebra de linhas, escape de
  parênteses/backslash), sem dependências e sem `window.print()`.
- `core/csv.js`: `analysisTable(entries)` extraído para reuso entre CSV/XLS/PDF,
  mantendo `toAnalysisCsv` e a proteção contra formula injection.
- `enhancements.js`: wrappers `exportAnalysisXls/Pdf`, `exportAnalysesXls/Pdf`,
  `exportChannelXls/Pdf`; `latin1Bytes` converte o PDF para `Uint8Array` no Blob.
- `i18n.js`: `analysis.channelButton`, `analysis.channelModal`.
- Testes novos: 1 em `geminiAi.test.js` (prompt do canal) e 7 em `test/exporters.test.js`
  (XLS, escape, paginação e estrutura do PDF).

Limitação: a análise geral também não é persistida; ela é refeita a cada período/aba e
depende da chave/cota do Gemini. Se o usuário quiser histórico entre sessões, o próximo
passo é persistir `channelGemini` (e provavelmente `videoGemini`) com chave por período/canal.

Validação final: `npm run lint` → OK (46 JS), `npm test` → 66/66, `npm run build:css` → OK.

## 20. Remoção do card "Performance do conteúdo" (18/11/2026)

Pedido do usuário: retirar o card "Performance do conteúdo" (estatísticas Média/Mediana/Maior/Menor
e gráfico de distribuição de visualizações) e atualizar o contexto.

Mudanças:
- `render.js`: removida a função `renderPerformance` (seção `content`) e o import de
  `calculateMedianViews`; `lineChartSvg` não é mais importado em `render.js`.
- `app.js`: removida a chamada `${view.renderPerformance(videos, perf)}` em `renderConnected()`.
- `sidebar.js`: removido o item de navegação `content` ("Conteúdo").
- `i18n.js`: removidas as chaves `nav.content` e `section.content`.
- `calculatePerformance` e `calculateMedianViews` permanecem em `core/analysis.js` (usados em
  outros lugares); `lineChartSvg` permanece em `enhancements.js`.

Seção "Análise Técnica por IA" (`techAnalysis`) continua exibindo as abas Vídeos/Shorts/
Comentários e os dados brutos do YouTube.

Validação: `npm run lint` → OK (46 JS), `npm test` → 66/66.

## 21. Paginação e ordenação na seção "Análise Técnica por IA" (18/11/2026)

Pedido do usuário: na seção "Análise Técnica por IA", adicionar paginação acima de 10
vídeos e permitir organizar por data de publicação ou melhor audiência, mantendo a base.

Mudanças:
- `state.js`: novos campos `contentSort` ('audience' padrão) e `contentPage` (1), persistidos
  em prefs e resetados em troca de período/aba/sessão.
- `render.js`: `renderContentList` agora ordena por `contentSort` (audiência desc ou data desc),
  pagina 10 por página, com controles Anterior/Próxima e indicador "Página X de Y".
  `renderAiAnalysisCard` ganhou `<select id="genfy-content-sort">` (Melhor audiência / Data de
  publicação).
- `app.js`: listeners para o select (reseta página, salva prefs, re-renderiza) e para os botões
  de paginação; reset de `contentPage` na troca de aba e de período.
- Miniatura de vídeo em `renderMediaRow` virou link para o YouTube (abre em nova aba).

Validação: `npm run lint` → OK (46 JS), `npm test` → 66/66.

Atualização (20/11/2026): o select passou a ter quatro opções — **Mais recente** (`newest`),
**Mais antigo** (`oldest`), **Melhor audiência** (`best`) e **Pior audiência** (`worst`).
Os valores antigos `date` e `audience` são convertidos em `newest`/`best` por
`normalizeContentSort` (`state.js`), então prefs já salvas continuam válidas. A lógica pura
de ordenação ficou em `sortVideosForContent` (`core/analysis.js`), com 3 testes novos.

## 22. Análise SEO por vídeo + sinais SEO nos dados brutos (19/11/2026)

Pedido: na análise individual da seção "Análise Técnica por IA", pedir ao Gemini uma análise de SEO
e mostrar esses sinais também nos dados brutos para dar visão geral ao usuário.

Mudanças:
- `core/seo.js` (novo): `getSeoSignals` (título/descrição/tags/categoria + contagens) e
  `truncateSeoText` para limitar o trecho enviado ao modelo.
- `youtubeService.mapVideo`: passa a guardar `description`, `tags` e `categoryId` do `snippet`
  de `videos.list` (com fallback de descrição para o `playlistItems`). **Nenhuma chamada nova**
  à API: `snippet` já era solicitado em `getVideosByIds`.
- `geminiService.buildVideoAnalysisPrompt`: nova seção `SEO:` entre `DESEMPENHO:` e
  `PONTOS FORTES:`; envia contagem de caracteres do título, trecho de até 300 caracteres da
  descrição, até 10 tags e categoria, com instrução explícita para não inventar dados nem
  avaliar a miniatura (só a URL está disponível). Campos ausentes aparecem como "indisponível".
- `render.js`: nova linha "SEO (dados brutos)" abaixo da linha de métricas, com comprimento do
  título e da descrição, quantidade de tags e categoria; chave `analysis.seoData` em `i18n.js`.
- `csv.js`/`exporters.js`: colunas `titulo_caracteres`, `descricao_caracteres`, `tags` e
  `categoria` nos exports CSV/XLS e linha de SEO no PDF. Caches antigos sem esses campos
  renderizam "indisponível"/0 normalmente.

Validação: `npm run validate` → lint OK (50 JS) e 77/77 testes.

## 23. Backend simulado de assinaturas (20/11/2026)

Objetivo: testar o modelo freemium antes de criar Firebase/Paddle reais, sem segredos no
código e com a troca posterior concentrada em um arquivo. Relatório decisório salvo em
`relatorio-decisoes-genfy.pdf` (5 páginas).

Decisões de negócio/produto:
- Gateway escolhido: **Paddle** (Merchant of Record, 200+ países, Brasil, BRL/Pix e
  Pix Automático, checkout/portal/license keys, ~5% + US$ 0,50). Stripe fica adiado;
  Lemon Squeezy foi descartado (encerramento em 16/11/2026, pagamentos até 31/03/2027);
  BTC futuro deve usar processador separado.
- Identidade canônica: `sub` do Google obtido via `chrome.identity`. O backend valida o
  access token com `tokeninfo`, extrai o `sub` e descarta o token. **Não usar Firebase Auth
  na extensão**; Firebase Auth fica apenas no painel admin interno.
- Next.js será painel administrativo separado, fora da extensão.
- Limite X = **5 análises Gemini por mês**, por conta Google. Contam análise de vídeo,
  análise geral do canal e reanálise; "Testar conexão" não conta; reset mensal em UTC.
- Gratuito: heurística ilimitada + 5 análises IA + CSV + amostra 50. Pro: análises
  ilimitadas + amostra 100 + CSV/XLS/PDF + histórico + futura chave gerenciada.
- O mock **não é fronteira de segurança**: a chave Gemini continua no cliente. A cota vira
  controle real somente quando a chamada ao Gemini passar pelo backend próprio.
- Painel administrativo: acesso **restrito apenas à equipe**. Fora do modelo de ameaças da
  extensão; não precisa ser tratado nesta camada.

Modelo de ameaças (acordado):
- Cliente não é confiável: JS, `localStorage` e botões podem ser alterados pelo usuário.
  Backend é a única autoridade para plano e cota.
- Riscos restantes mesmo com tudo implementado: token Google vazado/replay, criação de
  várias contas grátis, webhook Paddle falso, corrida no consumo da última cota e abuso
  de volume/custo nos prompts.
- Mitigações: validar token/`sub` no backend, webhook assinado e idempotente, atualização
  atômica da cota, limites por conta/IP e Gemini chamado exclusivamente pelo backend.

Implementação:
- `src/scripts/config.js`: `BACKEND_MODE = 'mock'`, `ENTITLEMENT_API_URL = ''`,
  `MOCK_LATENCY_MS = 120`, `ENTITLEMENT_TIMEOUT_MS = 10000`.
- `src/scripts/services/entitlement/`: `entitlementClient.js` escolhe o adapter;
  `mockAdapter.js` persiste uso em `genfy_mock_entitlement`, deriva um pseudo-`sub` do
  token, reseta o contador quando o mês muda e lança `QUOTA_EXHAUSTED` na 6ª análise;
  `httpAdapter.js` prepara `POST /api/entitlement` e `/api/usage/consume` com Bearer token,
  timeout de 10s e erros `NOT_CONFIGURED`, `UNAUTHORIZED`, `QUOTA_EXHAUSTED`,
  `REQUEST_FAILED`, `TIMEOUT`, `NETWORK`; ações de teste retornam `DEV_ONLY`.
  `plans.js` centraliza limites e `canExport`; `errors.js` define `EntitlementError`.
- `constants.js`: `MOCK_ENTITLEMENT_KEY = 'genfy_mock_entitlement'`.
- `state.js`: `state.entitlement` com `status`, `data` e `error`, limpo no sign-out.
- `render.js`: banner no topo de "Análise Técnica por IA" e painel "BACKEND SIMULADO" em
  Configurações, com botões Ativar Pro / Voltar ao Gratuito / Zerar contador /
  Simular reembolso. Botões XLS/PDF ficam desabilitados no plano Gratuito.
- `app.js`: `ensureEntitlement(token)` após `render()` em `loadData`, `hasAnalysisQuota()`
  antes das análises, `chargeAnalysis()` após sucesso do Gemini e `exportAllowed()` nos
  handlers de exportação. A UI é atualizada em `updateEntitlementUi()`.
- `test/entitlement.test.js`: 10 testes de plano, cota mensal, contas separadas, Pro,
  reembolso e exports.

Troca para o backend real:
1. Em `src/scripts/config.js`, mudar `BACKEND_MODE` para `'http'` e preencher
   `ENTITLEMENT_API_URL`.
2. Adicionar a host permission da API em `manifest.json`.
3. O painel simulado desaparece automaticamente (`isMockBackend()` false).
4. O backend deve validar o token Google, extrair `sub`, devolver o JSON de entitlement e
   consumir a cota de forma atômica.
5. Integrar Paddle: checkout/portal de assinatura e webhooks de transação/assinatura
   (concluída, atualizada, cancelada/reembolsada) para atualizar o plano do `sub`.
6. Mover a chamada ao Gemini para o backend, retirando a chave da extensão.

Validação histórica: `npm run validate` → lint OK (59 JS) e 95/95 testes.

## 24. Gráficos no card "GENFY Channel Health" (21/11/2026)

Pedido: colocar gráficos de linhas, colunas, pizzas etc. no card de saúde do canal da
Visão geral, mantendo o score e a lista de critérios existentes.

Mudanças:
- `src/scripts/pages/dashboard/charts.js` (novo): gráficos em **SVG inline puro**, sem
  dependências de runtime e compatível com a CSP da MV3 (`script-src 'self'`).
  - `healthColumnsSvg(criteria)` — colunas com pontos conquistados x máximo (25) por
    critério; cor por faixa (verde/índigo/âmbar/cinza), valor `pontos/máximo` e `<title>`
    para tooltip.
  - `healthCompositionHtml(criteria, score)` — rosca (pizza) com a participação de cada
    critério nos pontos do score, centro com o total e legenda com percentuais.
  - `publicationGapChartSvg(videos)` — linha com área e média tracejada dos intervalos
    entre publicações consecutivas (últimos 12 intervalos, ordenados por data); fallback
    amigável quando há menos de dois intervalos.
- `render.js`: card `healthBlock` agora organiza ring + barra de progresso (como antes),
  grade com os gráficos de colunas e pizza, bloco full-width do gráfico de linha e, por
  fim, a lista detalhada dos critérios (mantida).
- `core/analysis.js`: critérios de `calculateChannelHealth` ganharam o campo `short`
  (`Atividade`, `Frequência`, `Consistência`, `Volume`) para rótulos compactos nos gráficos;
  rótulos longos originais permanecem na lista e em `detail`.
- `test/charts.test.js` (novo): 4 testes (colunas, pizza/legenda, linha/fallback e presença
  dos três gráficos no HTML de `renderOverview`).
- `src/styles/output.css` reconstruído com `npm run build:css` para incluir as novas
  classes Tailwind das cores/legendas; não editar esse arquivo manualmente.

Validação histórica: `npm run validate` → lint OK (59 JS) e 95/95 testes; `npm run build:css` → OK.

## 25. Comentários completos na Análise Técnica (24/11/2026)

Pedido: na aba **Comentários** da Análise Técnica, carregar todos os comentários dos vídeos,
agrupados por vídeo, com paginação e modal para listas grandes. Decisão explícita do usuário:
**"Não quero que o Gemini analise os comentários!!"** — os prompts do Gemini seguem sem comentários.

Mudanças:
- `src/scripts/core/comments.js` (novo): normalização de snippet, agrupamento por vídeo,
  ordenação `newest`/`most`, paginação; constantes `COMMENTS_PAGE_SIZE = 5`,
  `COMMENTS_MODAL_PAGE_SIZE = 10`, `COMMENTS_MAX_PAGES_PER_VIDEO = 20`.
- `state.js`: `commentsSort`, `commentsPage`, `commentsModal`, `commentsLoadedAt`; valores
  legados `time`/`relevance` convertidos para `newest`/`most`.
- `youtubeApi.js`: `getCommentThreads(..., { withReplies = false })` passa
  `part=snippet,replies` quando solicitado.
- `app.js`: `fetchAllVideoComments()` pagina `commentThreads.list` com `maxResults=100` (até
  20 páginas/vídeo), deduplica, mantém respostas inline, trata `401` com refresh, aborta em
  esgotamento de cota e mostra erros parciais. `loadContentComments()` pede o escopo de
  comentários antes de buscar e trata `403 insufficientPermissions` com mensagem para
  clicar em "Carregar comentários" novamente.
- `render.js`: painel com preview de 5 comentários, botão "Ver todos os N comentários",
  5 vídeos por página e modal `#genfy-comments-modal` com 10 comentários por página.
- `youtubeAuth.js`: `SCOPE_COMMENTS = https://www.googleapis.com/auth/youtube.force-ssl`,
  `commentsGranted`, `scopesFor(withAnalytics, withPublish, withComments)`,
  `applyToken(..., requestedComments)`, `hasCommentsScope()`, `authorizeComments()` e
  `markCommentsNotGranted()`; restore/refresh preservam a flag. O discovery doc confirma que
  `commentThreads.list` exige `force-ssl`, não `youtube.readonly`.

Validação: smoke `open-all-ok`, `preview-5-ok`, `modal-ok`, `reply-ok`, `sort-ok`, `button-ok`;
`npm run validate` → lint OK (61 JS) e 101/101 testes. Se aparecer `invalid_scope`, incluir
`youtube.force-ssl` na tela de consentimento OAuth do Cloud Console.

## 26. Em alta no YouTube — posição final e tentativas revertidas (24/11/2026)

Pedido final: a seção **Em alta no YouTube** deve ficar logo abaixo da área de Vídeos da
Análise Técnica (onde fica a ordenação "Melhor desempenho"), antes de "Comparações".

- `app.js`: `${view.renderTrending()}` saiu de depois de `renderTrends()` e agora fica
  logo após `renderTechAnalysis(videos, perf)`.
- `sidebar.js`: item `viral` reordenado para depois de `techAnalysis`, acompanhando a ordem
  do DOM usada pelo scroll-spy.
- Tentativas **revertidas** (não devem ser reintroduzidas sem novo pedido): degustação com
  3 dados reais (`TRENDING_TASTE_RESULTS`, `useCache`, `state.trending.sample`) e prévia Pro
  com IA (`TRENDING_AI_PREVIEW_KEY`, `analyzeTrending`, `buildTrendingAnalysisPrompt`,
  `renderTrendingAi*`, handlers e modal `#genfy-trending-ai-modal`). Nada disso permanece.
- Validação: `npm run validate` → lint OK (61 JS) e 101/101 testes; `npm run build:css` → OK.

## 27. Git e publicação no GitHub (24/11/2026)

- `git init -b main`; commit inicial `aa0755e` ("first commit") com o README **existente**
  e `.gitignore`. O `# genfy` das instruções genéricas do GitHub **não** foi acrescentado
  para não duplicar o título já documentado.
- Branch `feature/genfy-dashboard` criada antes do commit do projeto; commit `84da52e`
  ("feat: add GENFY dashboard and integrations") com 76 arquivos, sem `node_modules`.
- Push da branch com `git push -u origin feature/genfy-dashboard`.
- Merge local com `git merge --ff-only feature/genfy-dashboard` em `main` e push com
  `git push -u origin main`.
- Remote: `https://github.com/masternetfmoraes/genfy.git`. `main` e
  `feature/genfy-dashboard` publicadas; merge fast-forward concluído em `84da52e`.
- `gh` não estava instalado, então não houve PR: o merge foi feito diretamente com Git.
  Identidade dos commits: `masternetfmoraes <masternetfmoraes@users.noreply.github.com>`
  (passada por variáveis de ambiente, sem alterar `git config`).
