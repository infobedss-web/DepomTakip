import { pool } from './database.js';
import { assert, tenant, type User } from './security.js';
import type pg from 'pg';
export type DB = Pick<pg.PoolClient, 'query'>;
export async function locationTree(db: DB, id: string): Promise<string[]> {
  return (
    await db.query(
      'WITH RECURSIVE tree AS (SELECT id FROM locations WHERE id=$1 UNION ALL SELECT l.id FROM locations l JOIN tree t ON l.parent_id=t.id) SELECT id FROM tree',
      [id],
    )
  ).rows.map((r) => r.id);
}
export async function rackFor(db: DB, id: string): Promise<string> {
  return (
    (
      await db.query(
        "WITH RECURSIVE parents AS (SELECT id,parent_id,kind FROM locations WHERE id=$1 UNION ALL SELECT l.id,l.parent_id,l.kind FROM locations l JOIN parents p ON p.parent_id=l.id) SELECT id FROM parents WHERE kind='RACK' LIMIT 1",
        [id],
      )
    ).rows[0]?.id || id
  );
}
export async function audit(
  db: DB,
  u: User,
  action: string,
  type: string,
  id: string | null,
  business: string | null = u.business_id,
  details: unknown = {},
) {
  await db.query(
    'INSERT INTO audit_logs(business_id,actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [business, u.id, action, type, id, JSON.stringify(details)],
  );
}
export async function assertWarehouseAccess(
  u: User,
  warehouseId: string,
  db: DB = pool,
) {
  const w = (
    await db.query(
      'SELECT id,business_id FROM warehouses WHERE id=$1',
      [warehouseId],
    )
  ).rows[0];

  assert(w, 404, 'Depo bulunamadı.');
  tenant(u, w.business_id);

  // Sistem yöneticisi ve firma yönetim rolleri
  // tenant içindeki tüm depoları yönetebilir.
  if (['SUPER_ADMIN', 'OWNER', 'FIRM_ADMIN'].includes(u.role)) {
    return w;
  }

  // Saha personeli yalnız kendisine atanmış depolarda çalışabilir.
  const assigned = await db.query(
    `
    SELECT 1
    FROM user_warehouse_assignments
    WHERE user_id=$1
      AND warehouse_id=$2
    `,
    [u.id, warehouseId],
  );

  assert(
    assigned.rowCount,
    403,
    'Bu depoya atanmadınız.',
  );

  return w;
}
export async function warehouse(u: User, id: string, db: DB = pool) {
  const r = await db.query('SELECT * FROM warehouses WHERE id=$1', [id]);
  assert(r.rowCount, 404, 'Depo bulunamadı.');
  tenant(u, r.rows[0].business_id);
  return r.rows[0];
}
export async function location(u: User, id: string, db: DB = pool) {
  const r = await db.query(
    'SELECT l.*,w.business_id FROM locations l JOIN warehouses w ON w.id=l.warehouse_id WHERE l.id=$1',
    [id],
  );
  assert(r.rowCount, 404, 'Lokasyon bulunamadı.');
  tenant(u, r.rows[0].business_id);
  return r.rows[0];
}
export async function room(u: User, id: string, db: DB = pool, lock = false) {
  const r = await db.query('SELECT * FROM rooms WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id]);
  assert(r.rowCount, 404, 'Sayım odası bulunamadı.');
  if (u.role === 'COUNTER') {
    await assertWarehouseAccess(u, r.rows[0].warehouse_id, db);
  }
  if (['COUNTER', 'AUDITOR'].includes(u.role)) {
    assert(
      (await db.query('SELECT 1 FROM assignments WHERE room_id=$1 AND user_id=$2', [id, u.id]))
        .rowCount,
      403,
      'Bu odaya atanmadınız.',
    );
  } else tenant(u, r.rows[0].business_id);
  return r.rows[0];
}

