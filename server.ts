import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServerEnv } from './server/config/env.ts';
import { dispatchApiRequest } from './server/core/router.ts';
import type { HttpRequest } from './server/core/http.ts';
import { isDatabaseConfigured, checkPostgresHealth } from './server/database/pool.ts';
import { processDueReminders } from './server/jobs/reminderEngine.ts';
import { getClinicStore } from './server/store/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const env = getServerEnv();
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Forward all /api/* requests through the unified framework-agnostic dispatcher
  app.use('/api', async (req, res) => {
    const httpReq: HttpRequest = {
      method: req.method.toUpperCase(),
      url: req.originalUrl,
      path: `/api${req.path === '/' ? '' : req.path}`,
      query: req.query as Record<string, string | string[] | undefined>,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: req.body,
      rawBody: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
      ip: String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim(),
    };

    const response = await dispatchApiRequest(httpReq);
    if (response.headers) {
      for (const [k, v] of Object.entries(response.headers)) {
        res.setHeader(k, v);
      }
    }
    if (response.cookies && response.cookies.length > 0) {
      res.setHeader('Set-Cookie', response.cookies);
    }
    res.status(response.status).json(response.body);
  });

  // Explicit opt-in dev scheduler ONLY (never active on Vercel / serverless)
  if (env.enableDevScheduler) {
    console.log('[DevScheduler] Opt-in local reminder worker enabled (60s interval).');
    setInterval(() => {
      try {
        const store = getClinicStore();
        processDueReminders(store).catch((err) => {
          console.warn('[DevScheduler] Processing error:', err.message);
        });
      } catch (err: any) {
        console.warn('[DevScheduler] Skipped:', err.message);
      }
    }, 60_000);
  }

  // Frontend Serving: Vite dev middleware in development or built static dist in production
  if (!env.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const dbStatus = isDatabaseConfigured() ? await checkPostgresHealth() : { connected: false, configured: false };
  if (env.isProduction && !dbStatus.connected) {
    console.error('[MyVet Server WARNING] Production mode started without a healthy PostgreSQL connection.');
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log('=======================================================');
    console.log(`  MyVet Cabinet Vétérinaire Server listening on :${env.port}`);
    console.log(`  Mode: ${env.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`  Database: ${dbStatus.connected ? 'PostgreSQL Connected' : 'Dev Sandbox Store (no DATABASE_URL)'}`);
    console.log(`  SMS Mode: ${env.smsProviderMode}`);
    console.log('=======================================================');
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup failure:', err);
  process.exit(1);
});
