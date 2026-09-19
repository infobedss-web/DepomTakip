import { operations } from './operations.js';
import { licensing, requireActiveLicense } from './licensing.js';
import express from 'express';
import helmetModule from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { pool } from './database.js';
import { HttpError, authenticate } from './security.js';
import { clientOperationGuard } from './idempotency.js';
import { auth } from './auth.js';
import { counting } from './counting.js';
import { manage } from './management.js';
import { mobilePairing } from './mobile-pairing.js';
import { mobileDevices } from './mobile-devices.js';
const helmet = helmetModule as unknown as (options?: any) => express.RequestHandler;

export const app = express();
app.disable('x-powered-by');
app.use(
  helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'] } } }),
);
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowed = process.env.APP_ORIGIN;

  if (requestOrigin) {
    const origin = new URL(requestOrigin);
    const sameHost = origin.host === req.headers.host;
    const localDevelopment =
      process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '192.168.1.11'].includes(origin.hostname);

    const configuredAllowed =
      Boolean(allowed) &&
      requestOrigin === allowed;

    if (sameHost || localDevelopment || configuredAllowed) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Vary', 'Origin');
    } else {
      res.status(403).json({ error: 'Geçersiz istek kaynağı.' });
      return;
    }
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', application: 'BEDSS', database: 'PostgreSQL' });
});


app.use(
  '/api',
  auth,
  mobilePairing,
  authenticate,
  mobileDevices,
  clientOperationGuard,
  licensing,
  requireActiveLicense,
  operations,
  counting,
  manage,

);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API bulunamadı.' }));
const web = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(web)) {
  app.use(express.static(web));
  app.get('/{*path}', (_req, res) => res.sendFile(web + 'index.html'));
}
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.status === 413) {
    res.status(413).json({ error: 'İstek boyutu sınırı aşıldı. Partiyi küçültün.', errors: [{row: 0, field: 'rows', type: 'PAYLOAD_TOO_LARGE', message: 'JSON sınırı 8 MB; aktarım partisi en fazla 6 MB olmalı.'}] });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: 'Alanları kontrol edin.',
      details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  if (error.code === '23505') {
    const constraint = String(error.constraint || '').toLowerCase();

    if (
      constraint.includes('products_business_sku') ||
      constraint.includes('products_business_sku_canonical')
    ) {
      res.status(409).json({
        error: 'Bu SKU bu firmada zaten kayıtlı.',
        field: 'sku',
      });
      return;
    }

    if (
      constraint.includes('products_business_barcode') ||
      constraint.includes('products_business_barcode_canonical')
    ) {
      res.status(409).json({
        error: 'Bu barkod bu firmada zaten kayıtlı.',
        field: 'barcode',
      });
      return;
    }

    res.status(409).json({
      error: 'Bu kayıt zaten mevcut.',
    });
    return;
  }
  if (['23503', '23514', '22P02', '22003'].includes(error.code)) {
    res.status(400).json({ error: 'İlişkili kayıt veya girilen değer geçersiz.' });
    return;
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Dosya en fazla 5 MB olabilir.' });
    return;
  }
  if (error.status === 400) {
    res.status(400).json({ error: 'Geçersiz istek.' });
    return;
  }
  console.error('[BEDSS API ERROR]', error);

  const detail =
    process.env.NODE_ENV !== 'production'
      ? String(error?.message || error)
      : undefined;

  res.status(500).json({
    error: 'İşlem tamamlanamadı.',
    ...(detail ? { detail } : {}),
  });
});

export default app;
