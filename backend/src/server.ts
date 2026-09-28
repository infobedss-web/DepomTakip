import { app } from './app.js';
import { migrate, pool } from './database.js';
import { ensureBootstrapAdmin } from './bootstrap-admin.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4000);

async function start() {
  await migrate();
  await ensureBootstrapAdmin();

  const server = app.listen(port, host, () =>
    console.log(`DepomTakip API http://${host}:${port}`),
  );

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () =>
      server.close(() => {
        void pool.end().then(() => process.exit(0));
      }),
    );
  }
}

start().catch(async (error) => {
  console.error('[DEPOMTAKIP STARTUP ERROR]', error);

  try {
    await pool.end();
  } finally {
    process.exit(1);
  }
});

