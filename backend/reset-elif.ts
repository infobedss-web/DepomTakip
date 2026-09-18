import bcrypt from 'bcryptjs';
import { pool } from './src/database.js';

async function main() {
  const email = 'elif@mavimarket.local';
  const password = '472816';

  const userResult = await pool.query(
    `SELECT id, email, role, status
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );

  if (userResult.rowCount === 0) {
    throw new Error('Elif kullanıcısı bulunamadı.');
  }

  const user = userResult.rows[0];

  if (user.role !== 'COUNTER') {
    throw new Error(`Elif COUNTER değil. Mevcut rol: ${user.role}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2`,
    [passwordHash, user.id]
  );

  await pool.query(
    `DELETE FROM sessions
     WHERE user_id = $1`,
    [user.id]
  );

  console.log('ELIF HAZIR');
  console.log('E-posta :', email);
  console.log('Sifre   :', password);
  console.log('Rol     :', user.role);
  console.log('Durum   :', user.status);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
