import { pool, migrate } from './database.js';
import { seed } from './seed.js';
try {
  if (process.argv[2] === 'migrate') await migrate();
  else if (process.argv[2] === 'seed') await seed();
  else throw new Error('migrate veya seed komutu gerekiyor.');
} finally {
  await pool.end();
}
