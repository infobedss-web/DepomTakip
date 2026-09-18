import { pool } from './dist/database.js';

const result = await pool.query(`
  SELECT id, name, tax_number
  FROM businesses
  ORDER BY name
`);

console.table(result.rows);
await pool.end();