import { boot } from './dashboard/app.js';

boot().catch((err) => {
  console.error('[GENFY] Falha ao iniciar o dashboard:', err);
});
