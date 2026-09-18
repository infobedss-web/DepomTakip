import bcrypt from 'bcryptjs';
import { pool } from './database.js';

export async function ensureBootstrapAdmin() {
  const existing = await pool.query(
    `
      SELECT id
      FROM users
      WHERE role='SUPER_ADMIN'
      LIMIT 1
    `,
  );

  if (existing.rowCount) return;

  const email =
    process.env.BEDSS_BOOTSTRAP_ADMIN_EMAIL ||
    'admin@bedss.local';

  const password =
    process.env.BEDSS_BOOTSTRAP_ADMIN_PASSWORD ||
    'BedssDemo!2026';

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `
      INSERT INTO users(
        business_id,
        name,
        email,
        password_hash,
        role,
        status
      )
      VALUES(
        NULL,
        $1,
        $2,
        $3,
        'SUPER_ADMIN',
        'ACTIVE'
      )
    `,
    [
      'Sistem Yetkilisi',
      email.toLowerCase().trim(),
      passwordHash,
    ],
  );

  console.log('BEDSS ilk Super Admin hazirlandi.');
}
