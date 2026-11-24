# GENFY — YouTube Intelligence

Extensão Chrome (Manifest V3) que transforma um dashboard em nova aba com análises do
seu canal do YouTube: desempenho dos vídeos, melhor horário de publicação, público
(YouTube Analytics), tendências, insights, agendador de conteúdo, gerador de ideias e checklist.
Também envia e agenda vídeos diretamente do navegador para o YouTube, sem backend.

## Requisitos

- Node.js 20+ (para build/testes)
- Google Chrome 102+
- Um projeto no Google Cloud com **YouTube Data API v3** e **YouTube Analytics API** ativadas,
  além de um OAuth Client do tipo **Chrome Extension**.
- A tela de consentimento OAuth precisa permitir os escopos usados pela extensão, incluindo
  `https://www.googleapis.com/auth/youtube` para publicação.
- (Opcional) Chave da API Gemini (Google AI Studio) para análises sob demanda de vídeos e do canal.

## Instalação e build

```bash
npm ci
npm run build:css
```

Para acompanhar mudanças de estilo durante o desenvolvimento:

```bash
npm run watch:css
```

## Carregar no Chrome

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a raiz deste projeto
   (a pasta que contém `manifest.json`).

O dashboard abre em uma nova aba. O popup da extensão também permite abrir o dashboard.

## Análise individual com Gemini (opcional)

Em **Configurações > Gemini**, cole sua chave da API (gerada no Google AI Studio), escolha
o modelo e use "Testar conexão" se quiser validar. A chave fica apenas neste navegador
(`chrome.storage.local`); não há backend. Ela é enviada no header `x-goog-api-key`, nunca na
URL. O modelo padrão é `gemini-3.5-flash-lite`; configurações antigas com o alias
`gemini-flash-latest` ou modelos 2.x desativados são migradas automaticamente.

Na seção **Análise Técnica por IA** (logo abaixo de Conteúdo na sidebar), o card
"Análises técnicas por IA" reúne as abas Vídeos/Shorts/Comentários. Cada vídeo mostra os
dados brutos do YouTube (visualizações, curtidas, comentários, duração e ID) ao lado da
opção **Analisar com Gemini** — o Gemini continua sob demanda e inalterado: o texto
aparece em um acordeão com resumo, desempenho, pontos fortes, riscos e próximos passos.
Erros são exibidos no próprio acordeão, com opção de tentar novamente. Falhas transitórias
(503, 429 e rede) são retentadas com backoff; se o 503 persistir, escolha um modelo
Flash-Lite menos demandado em Configurações.

No rodapé dessa seção há a ação
**Analisar canal com Gemini**, que abre um popup com resumo técnico do canal, melhores dias
e horários, melhores vídeos, análise do melhor vídeo, assuntos a seguir e sugestões de
vídeos/ideias; e os botões de exportação consolidada em **CSV, XLS e PDF**. Cada análise de
vídeo pronta também oferece **CSV, XLS e PDF** no fim do acordeão; o popup da análise do
canal tem **XLS** e **PDF** próprios.

Os CSVs usam `;`, BOM UTF-8 e proteção contra fórmulas; as análises ficam em uma linha, com
o texto das seções separado por `|`. Os XLS são SpreadsheetML compatível com Excel e os
PDFs são gerados localmente, sem dependências ou impressão. Não há envio de dados para
serviços de terceiros além da chamada ao próprio Gemini. As exportações incluem apenas
análises da sessão atual (as análises não são persistidas ao trocar período, aba ou sair).

## OAuth e escopos

- O Client ID fica em `manifest.json` → `oauth2.client_id`.
- Login inicial: `https://www.googleapis.com/auth/youtube.readonly`.
- YouTube Analytics: `https://www.googleapis.com/auth/yt-analytics.readonly`, solicitado de forma
  incremental no botão **Conectar YouTube Analytics** (sem segundo login).
- Publicação: `https://www.googleapis.com/auth/youtube`, solicitado de forma incremental no primeiro
  envio/agendamento. Esse escopo permite `videos.insert`, `videos.update`, `videos.delete` e
  `thumbnails.set`.
- O bloco `oauth2` do `manifest.json` mantém apenas o escopo de leitura; os escopos adicionais são
  pedidos em tempo de execução via `chrome.identity.getAuthToken`.
- Se o login não abrir, confirme que o ID de cliente é do tipo *Chrome Extension*, que as APIs estão
  ativas no mesmo projeto do Google Cloud e que o escopo de publicação está configurado na tela de
  consentimento OAuth.

> A extensão funciona apenas no Chrome/Chromium. `chrome.identity.getAuthToken` não possui
> equivalente no Firefox; por isso a compatibilidade com Firefox não é declarada no manifest.

## Scripts

| Comando             | Descrição                                              |
| ------------------- | ------------------------------------------------------ |
| `npm run build:css` | Gera `src/styles/output.css` (Tailwind CSS v4, minificado) |
| `npm run watch:css` | Rebuild contínuo do CSS                                |
| `npm run lint`      | `node --check` em todo JS + validação do manifest      |
| `npm test`          | Testes com o runner nativo do Node (`node --test`)     |
| `npm run validate`  | Lint + testes                                          |

## Arquitetura

```
manifest.json
src/
  pages/
    dashboard.html        # nova aba (entrypoint)
    popup.html
  scripts/
    background.js         # service worker MV3
    popup.js
    constants.js          # chaves de storage, períodos, thresholds
    core/
      analysis.js         # cálculo puro (médias, horários, temas, saúde, tendências…)
      csv.js              # CSV com proteção contra formula injection
      format.js           # formatação e escape de HTML
      i18n.js             # camada de tradução (pt-BR)
      quota.js            # estimativa local de cota diária da YouTube API
    pages/dashboard/
      app.js              # controller/boot e eventos
      state.js            # estado central + persistência
      render.js           # funções de renderização (HTML)
      enhancements.js     # UX (gráfico, exportação, scroll-spy, tema)
    services/
      storage.js          # chrome.storage.local com fallback localStorage
      ai/
        geminiConfig.js       # chave, modelo padrão e modelos válidos
        geminiClient.js       # generateContent + listagem de modelos
        geminiErrors.js       # classificação de erros e mensagens ao usuário
        geminiService.js      # prompt e orquestração da análise individual
      youtube/
        youtubeApi.js         # HTTP + timeout + retry + validação
        youtubeAuth.js        # chrome.identity (login, refresh, Analytics)
        youtubeService.js     # canal + vídeos (amostra paginada de 50)
        youtubeAnalyticsService.js  # relatórios, cache por canal, paginação
    modules/youtube/publishing/
      controller/           # orquestra formulário, upload, cota e ações
      pages/                # formulário de envio + lista de publicações
      services/             # upload resumable, agendamento e metadados
      utils/                # validação de arquivo/dados e formatação da API
    components/sidebar.js
    ui/designSystem.js | theme.js
styles/input.css | output.css
test/                     # testes nativos do Node
scripts/lint.mjs          # lint sem dependências
```

### Decisões relevantes

- **Sem dependências de runtime**: apenas Tailwind como devDependency.
- **Cache do Analytics por canal + período**: trocar de conta não reaproveita dados antigos.
- **Amostra de 50 vídeos** via paginação da playlist de uploads e `videos.list` em lotes de 50.
- **CSV seguro**: células iniciadas por `= + - @ \t \r` recebem prefixo `'`.
- **Erros de API**: apenas status/reason vão para o console; corpos completos não são logados.
- **i18n incremental**: shell, navegação, títulos de seção e mensagens de autenticação já usam
  `t()`; a prosa analítica permanece em pt-BR por enquanto.
- **Publicação sem backend**: o vídeo é enviado do navegador direto para o endpoint resumable do
  YouTube; o GENFY guarda apenas metadados e IDs em `chrome.storage.local`.
- **Agendamento nativo**: usa `status.publishAt`; depois do upload, o YouTube publica no horário
  escolhido mesmo com o Chrome fechado.
- **Cota estimada**: o painel mostra uma estimativa local (limite de 10.000 unidades/dia e
  `videos.insert` = 1.600), reiniciada à meia-noite no horário do Pacífico. A cota real é
  compartilhada pelo projeto do Google Cloud.
- **Gemini sob demanda**: nenhuma análise é disparada automaticamente; cada vídeo só é
  enviado à API quando o usuário clica no botão específico dele.

## Limitações conhecidas

- Dados de idioma e de espectadores novos vs. recorrentes não existem na YouTube Analytics API.
- A análise de horários usa a data/hora de publicação e a amostra recente de vídeos, não o
  histórico completo do canal.
- O Channel Health e os insights são heurísticas experimentais, sinalizadas na interface.
- A aba precisa ficar aberta durante o upload. Se o envio falhar, o arquivo precisa ser selecionado
  novamente; o agendamento já criado continua válido no YouTube.
- A cota exibida é uma estimativa local e pode divergir da cota real do projeto.
- Thumbnail personalizada exige canal verificado no YouTube.
- Agendamento via `publishAt` publica o vídeo como público no horário escolhido.
- A análise com Gemini depende da chave/cota do Google AI Studio; modelos e limites podem variar.

## Testes

```bash
npm test
```

Cobrem funções puras de análise, formatação, CSV, i18n, datas da API, validação de lotes,
validação de upload/agendamento, metadados, cota e atualização de status das publicações.
