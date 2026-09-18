import assert from 'node:assert/strict';
import type { Pool } from 'pg';

// Arrange existing inventory only; production POST /stocks stays closed.
export async function stockFixture(pool: Pool, input: {
  product_id: string; location_id: string; physical: number;
  reserved?: number; damaged?: number; lot?: string; serial?: string;
}) {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /_test$/);
  const result = await pool.query(
    `INSERT INTO stocks(product_id,location_id,physical,reserved,damaged,lot,serial)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [input.product_id, input.location_id, input.physical, input.reserved ?? 0,
      input.damaged ?? 0, input.lot ?? '', input.serial ?? ''],
  );
  return result.rows[0];
}
