import bcrypt from 'bcryptjs';
import { pool } from './dist/database.js';

const email = 'mobiltest@mavimarket.local';
const password = '654321';
const hash = await bcrypt.hash(password, 12);

const business = await pool.query(`
  SELECT id, name
  FROM businesses
  WHERE id = '2aa9f581-f417-47ed-842b-e81c5ce24edd'
  LIMIT 1
`);

if (!business.rowCount) {
  throw new Error('Mavi Market firmasi bulunamadi.');
}

const result = await pool.query(`
  INSERT INTO users (
    business_id,
    name,
    email,
    password_hash,
    role,
    status
  )
  VALUES ($1, $2, $3, $4, 'COUNTER', 'ACTIVE')
  ON CONFLICT (email)
  DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = 'COUNTER',
    status = 'ACTIVE'
  RETURNING id, name, email, role, status, business_id
`, [
  business.rows[0].id,
  'MOBIL TEST',
  email,
  hash
]);

console.table(result.rows);
await pool.end();