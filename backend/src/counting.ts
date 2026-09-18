import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { pool, transaction } from './database.js';
import { assert, authenticate, requirePermission, management, tenant } from './security.js';
import { audit, room, warehouse, location, locationTree, rackFor, assertWarehouseAccess, type DB } from './helpers.js';
import type { User } from './security.js';
export const counting = Router();
counting.use(authenticate);
counting.get('/rooms', async (req, res) => {
  const field = ['COUNTER', 'AUDITOR'].includes(req.user.role);
  res.json(
    (
      await pool.query(
        `SELECT r.*,w.name warehouse_name,(SELECT count(*) FROM room_items WHERE room_id=r.id) total,(SELECT count(*) FROM count_entries WHERE room_id=r.id) counted FROM rooms r JOIN warehouses w ON w.id=r.warehouse_id WHERE ${field ? '($1::boolean IS NOT NULL AND EXISTS(SELECT 1 FROM assignments a WHERE a.room_id=r.id AND a.user_id=$2))' : '($1::boolean OR r.business_id=$2::uuid)'} ORDER BY r.created_at DESC`,
        [req.user.role === 'SUPER_ADMIN', field ? req.user.id : req.user.business_id],
      )
    ).rows,
  );
});
counting.post('/rooms', requirePermission('sayim_olustur'), async (req, res) => {
  const b = z
    .object({
      warehouse_id: z.uuid(),
      name: z.string().min(3).max(150),
      count_type: z.enum(['FULL', 'PARTIAL', 'CYCLIC', 'RACK', 'BLIND']),
      method: z.enum(['INTERNAL', 'AUDITOR', 'HYBRID']),
      starts_at: z.iso.datetime(),
      ends_at: z.iso.datetime(),
      stock_ids: z.array(z.uuid()).default([]),
    })
    .parse(req.body);
  const w = await warehouse(req.user, b.warehouse_id);
  /* BEDSS COUNT SCOPE GUARD */
  assert(
    ['FULL', 'BLIND'].includes(b.count_type) ||
      b.stock_ids.length > 0,
    400,
    'Bu sayım türünde en az bir ürün / lokasyon kapsamı seçmelisiniz.',
  );
  assert(
    new Date(b.ends_at) > new Date(b.starts_at),
    400,
    'Bitiş tarihi başlangıçtan sonra olmalı.',
  );
  assert(
    (
      b.count_type === 'FULL' ||
      b.count_type === 'BLIND' ||
      b.stock_ids.length > 0
    ),
    400,
    'Kısmi, döngüsel veya raf sayımında ürün kapsamı seçiniz.',
  );
  res.status(201).json(
    await transaction(async (db) => {
      const r = (
        await db.query(
          'INSERT INTO rooms(business_id,warehouse_id,name,count_type,method,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            w.business_id,
            w.id,
            b.name,
            b.count_type,
            b.method,
            b.starts_at,
            b.ends_at,
            req.user.id,
          ],
        )
      ).rows[0];
      const items = await db.query(
        'INSERT INTO room_items SELECT $1,s.id,s.physical,p.purchase_price FROM stocks s JOIN products p ON p.id=s.product_id JOIN locations l ON l.id=s.location_id WHERE l.warehouse_id=$2 AND ($3::boolean OR s.id=ANY($4::uuid[])) RETURNING stock_id',
        [r.id, w.id, b.count_type === 'FULL' || (b.count_type === 'BLIND' && b.stock_ids.length === 0), b.stock_ids],
      );
      assert(items.rowCount, 400, 'Seçilen kapsamda stok bulunmuyor.');
      assert(
        b.count_type === 'FULL' ||
        (b.count_type === 'BLIND' && b.stock_ids.length === 0) ||
        items.rowCount === new Set(b.stock_ids).size,
        400,
        'Kapsamda başka depoya ait stok var.',
      );
      await audit(db, req.user, 'ROOM_CREATED', 'room', r.id, w.business_id);
      return r;
    }),
  );
});
counting.get('/rooms/:id', async (req, res) => {
  const r = await room(req.user, String(req.params.id));
  const field = ['COUNTER', 'AUDITOR'].includes(req.user.role);
  const assignments = (
    await pool.query(
      `SELECT a.*,u.name user_name,u.role,l.name location_name,l.code location_code FROM assignments a JOIN users u ON u.id=a.user_id JOIN locations l ON l.id=a.location_id WHERE a.room_id=$1 ${field ? 'AND a.user_id=$2' : ''} ORDER BY u.name,l.name`,
      field ? [r.id, req.user.id] : [r.id],
    )
  ).rows;
  const items = field
    ? []
    : (
        await pool.query(
          'SELECT i.stock_id,p.name,p.sku,l.name location_name FROM room_items i JOIN stocks s ON s.id=i.stock_id JOIN products p ON p.id=s.product_id JOIN locations l ON l.id=s.location_id WHERE i.room_id=$1',
          [r.id],
        )
      ).rows;
  res.json({
    ...r,
    assignments,
    items,
    qr: await QRCode.toDataURL(r.code, { width: 240, margin: 2 }),
  });
});
counting.post('/rooms/:id/assignments', requirePermission('sayim_olustur'), async (req, res) => {
  const b = z.object({ user_id: z.uuid(), location_id: z.uuid() }).parse(req.body);
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(['DRAFT', 'OPEN'].includes(r.status), 409, 'Bu oda artık değiştirilemez.');
    const u = (await db.query('SELECT * FROM users WHERE id=$1', [b.user_id])).rows[0];
    assert(
      u?.status === 'ACTIVE' && ['COUNTER', 'AUDITOR'].includes(u.role),
      400,
      'Aktif sayım görevlisi seçin.',
    );
    if (u.role === 'AUDITOR') {
      assert(req.user.role === 'SUPER_ADMIN', 403, 'Bilirkişi atamasını sistem yetkilisi yapar.');
      assert(r.method !== 'INTERNAL', 400, 'Bu oda iç personel yöntemi kullanıyor.');
    } else {
      assert(u.business_id === r.business_id, 400, 'Personel aynı işletmeye ait olmalı.');
      assert(r.method !== 'AUDITOR', 400, 'Bu oda yalnızca bilirkişi kullanıyor.');
    }
    // COUNTER personeli yalnız atanmış olduğu depoda sayıma verilebilir.
    // AUDITOR bağımsız bilirkişi akışıdır ve Super Admin tarafından atanır.
    if (u.role === 'COUNTER') {
      await assertWarehouseAccess(
        {
          id: u.id,
          business_id: u.business_id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          permissions: u.permissions || [],
          denied_permissions: u.denied_permissions || [],
        },
        r.warehouse_id,
        db,
      );
    }
    const l = await location(req.user, b.location_id, db);
    assert(
      l.kind !== 'ZONE',
      400,
      'Personeli bölümün tamamına değil reyon, kat veya hücreye atayın.',
    );
    assert(l.warehouse_id === r.warehouse_id, 400, 'Lokasyon odanın deposunda olmalı.');
    assert(
      (
        await db.query(
          'SELECT 1 FROM room_items i JOIN stocks s ON s.id=i.stock_id WHERE i.room_id=$1 AND s.location_id=ANY($2::uuid[])',
          [r.id, await locationTree(db, l.id)],
        )
      ).rowCount,
      400,
      'Bu lokasyon oda kapsamında değil.',
    );
    await db.query(
      'INSERT INTO assignments(room_id,user_id,location_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [r.id, u.id, l.id],
    );
    await audit(db, req.user, 'PERSON_ASSIGNED', 'room', r.id, r.business_id, b);
  });
  res.json({ ok: true });
});
counting.post('/rooms/:id/open', requirePermission('sayim_onayla'), async (req, res) => {
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(r.status === 'DRAFT', 409, 'Oda taslak durumunda olmalı.');
    assert(
      (await db.query('SELECT 1 FROM assignments WHERE room_id=$1', [r.id])).rowCount,
      400,
      'Önce personel atayın.',
    );
    await db.query(
      'SELECT s.id FROM stocks s JOIN room_items i ON i.stock_id=s.id WHERE i.room_id=$1 ORDER BY s.id FOR UPDATE OF s',
      [r.id],
    );
    assert(
      !(
        await db.query(
          "SELECT 1 FROM room_items a JOIN room_items b ON a.stock_id=b.stock_id AND a.room_id<>b.room_id JOIN rooms r ON r.id=b.room_id WHERE a.room_id=$1 AND r.status = 'OPEN'",
          [r.id],
        )
      ).rowCount,
      409,
      'Kapsamda başka aktif veya onay bekleyen sayıma ait stok var.',
    );
    await db.query(
      'UPDATE room_items i SET expected=s.physical,unit_cost=p.purchase_price FROM stocks s JOIN products p ON p.id=s.product_id WHERE i.stock_id=s.id AND i.room_id=$1',
      [r.id],
    );
    await db.query("UPDATE rooms SET status='OPEN' WHERE id=$1", [r.id]);
    await audit(db, req.user, 'ROOM_OPENED', 'room', r.id, r.business_id);
  });
  res.json({ ok: true });
});
counting.post('/rooms/:id/approve-person', requirePermission('sayim_onayla'), async (req, res) => {
  const b = z.object({ user_id: z.uuid() }).parse(req.body);
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(r.status === 'OPEN', 409, 'Oda açık olmalı.');
    const result = await db.query(
      'UPDATE assignments SET approved=true WHERE room_id=$1 AND user_id=$2 AND joined_at IS NOT NULL RETURNING *',
      [r.id, b.user_id],
    );
    assert(result.rowCount, 400, 'Personel önce oda koduyla giriş yapmalı.');
    await audit(db, req.user, 'PERSON_APPROVED', 'room', r.id, r.business_id, b);
  });
  res.json({ ok: true });
});
counting.post('/count/join', requirePermission('sayim_yap'), async (req, res) => {
  const b = z.object({ code: z.string().min(1).max(80) }).parse(req.body);
  const r = (await pool.query('SELECT id FROM rooms WHERE UPPER(TRIM(code))=$1', [b.code.trim().toUpperCase()])).rows[0];
  assert(r, 404, 'Oda kodu bulunamadı.');
  await transaction(async (db) => {
    const current = await room(req.user, r.id, db, true);
    assert(current.status === 'OPEN', 409, 'Firma yetkilisi odayı henüz açmadı.');
    await db.query(
      'UPDATE assignments SET joined_at=COALESCE(joined_at,now()) WHERE room_id=$1 AND user_id=$2',
      [r.id, req.user.id],
    );
    await audit(db, req.user, 'ROOM_JOINED', 'room', r.id, current.business_id);
  });
  res.json(r);
});
async function ready(db: DB, u: User, id: string) {
  const r = await room(u, id, db, true);
  assert(r.status === 'OPEN', 409, 'Oda sayıma açık değil.');
  assert(
    new Date(r.starts_at) <= new Date() && new Date(r.ends_at) >= new Date(),
    409,
    'Sayım zaman aralığı dışında.',
  );
  const a = await db.query(
    `SELECT 1 FROM assignments WHERE room_id=$1 AND user_id=$2 AND approved AND joined_at IS NOT NULL AND agreement_accepted_at IS NOT NULL AND finished_at IS NULL AND activity_status <> 'BREAK'`,
    [id, u.id],
  );
  assert(a.rowCount, 403, 'Firma yetkilisi onayı bekleniyor veya sayımınızı bitirdiniz.');
  return r;
}
counting.post('/count/location', requirePermission('sayim_yap'), async (req, res) => {
  const b = z.object({ room_id: z.uuid(), code: z.string().min(1).max(80) }).parse(req.body);
  res.json(
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
      const r = await ready(db, req.user, b.room_id);
      const l = (await db.query('SELECT * FROM locations WHERE code=$1', [b.code])).rows[0];
      assert(l, 404, 'Reyon kodu bulunamadı.');
      assert(
        (
          await db.query(
            'SELECT 1 FROM assignments WHERE room_id=$1 AND user_id=$2 AND location_id=$3 AND approved AND finished_at IS NULL',
            [r.id, req.user.id, l.id],
          )
        ).rowCount,
        403,
        'Bu reyona atanmadınız.',
      );
      assert(
        !(await db.query('SELECT 1 FROM count_locks WHERE user_id=$1', [req.user.id])).rowCount,
        409,
        'Önce açık ürün sayımını kaydedin veya iptal edin.',
      );
      await db.query(
        'INSERT INTO active_locations(user_id,room_id,location_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET room_id=$2,location_id=$3,activated_at=now()',
        [req.user.id, r.id, l.id],
      );
      await audit(db, req.user, 'LOCATION_ACTIVATED', 'room', r.id, r.business_id, {
        location_id: l.id,
      });
      return { id: l.id, name: l.name, code: l.code };
    }),
  );
});
counting.post('/count/scan', requirePermission('sayim_yap'), async (req, res) => {
  const b = z
    .object({
      room_id: z.uuid(),
      barcode: z.string().min(1).max(80),
      lot: z.string().max(100).optional(),
      serial: z.string().max(100).optional(),
      location_code: z.string().max(80).optional(),
    })
    .parse(req.body);
  res.json(
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
      const r = await ready(db, req.user, b.room_id);
      const active = (
        await db.query('SELECT * FROM active_locations WHERE user_id=$1 AND room_id=$2', [
          req.user.id,
          r.id,
        ])
      ).rows[0];
      assert(active, 400, 'Önce reyon QR kodunu tarayın.');
      const matches = (
        await db.query(
          'SELECT s.id stock_id,s.location_id,p.id product_id,p.name,p.sku,p.barcode,p.variant,s.lot,s.serial FROM room_items i JOIN stocks s ON s.id=i.stock_id JOIN products p ON p.id=s.product_id WHERE i.room_id=$1 AND s.location_id=ANY($2::uuid[]) AND (p.barcode=$3 OR p.sku=$3) AND ($4::text IS NULL OR s.lot=$4) AND ($5::text IS NULL OR s.serial=$5) AND ($6::text IS NULL OR s.location_id=(SELECT id FROM locations WHERE code=$6))',
          [
            r.id,
            await locationTree(db, active.location_id),
            b.barcode,
            b.lot ?? null,
            b.serial ?? null,
            b.location_code ?? null,
          ],
        )
      ).rows;
      assert(matches.length, 404, 'Ürün aktif reyonda veya sayım kapsamında bulunamadı.');
      assert(
        matches.length === 1,
        400,
        'Birden fazla stok bulundu. Lot, seri ve gerekirse hücre koduyla tekrar tarayın.',
      );
      const p = matches[0];
      assert(
        !(
          await db.query('SELECT 1 FROM count_entries WHERE room_id=$1 AND stock_id=$2', [
            r.id,
            p.stock_id,
          ])
        ).rowCount,
        409,
        'Bu ürün bu odada zaten sayıldı.',
      );
      const existing = (await db.query('SELECT * FROM count_locks WHERE user_id=$1', [req.user.id]))
        .rows[0];
      assert(
        !existing || (existing.stock_id === p.stock_id && existing.room_id === r.id),
        409,
        'Önce açık ürün sayımını tamamlayın.',
      );
      const lock = await db.query(
        'INSERT INTO count_locks(stock_id,room_id,user_id,product_id,location_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(stock_id) DO UPDATE SET stock_id=EXCLUDED.stock_id WHERE count_locks.user_id=EXCLUDED.user_id AND count_locks.room_id=EXCLUDED.room_id RETURNING *',
        [p.stock_id, r.id, req.user.id, p.product_id, await rackFor(db, p.location_id)],
      );
      assert(lock.rowCount, 409, 'Bu ürün başka bir personel tarafından sayılıyor.');
      const units = (
        await db.query(
          'SELECT name,multiplier FROM product_units WHERE product_id=$1 ORDER BY multiplier',
          [p.product_id],
        )
      ).rows;
      await audit(db, req.user, 'COUNT_LOCKED', 'stock', p.stock_id, r.business_id, {
        room_id: r.id,
      });
      return { ...p, units };
    }),
  );
});
counting.post('/count/submit', requirePermission('sayim_yap'), async (req, res) => {
  const b = z
    .object({
      room_id: z.uuid(),
      stock_id: z.uuid(),
      quantity: z.coerce.number().min(0).max(1000000).multipleOf(0.001),
      unit: z.string().min(1).max(30),
      condition: z.enum(['NORMAL', 'DAMAGED', 'RETURNED', 'DISPLAY', 'BROKEN']),
      note: z.string().max(2000).default(''),
      photo_id: z.uuid().nullable().default(null),
    })
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
      const r = await ready(db, req.user, b.room_id);
      assert(
        (
          await db.query(
            'SELECT 1 FROM count_locks c JOIN active_locations a ON a.user_id=c.user_id AND a.room_id=c.room_id WHERE c.stock_id=$1 AND c.room_id=$2 AND c.user_id=$3',
            [b.stock_id, r.id, req.user.id],
          )
        ).rowCount,
        409,
        'Bu ürün için aktif sayım kilidiniz yok.',
      );
      const unit = (
        await db.query(
          'SELECT u.multiplier FROM product_units u JOIN stocks s ON s.product_id=u.product_id WHERE s.id=$1 AND u.name=$2',
          [b.stock_id, b.unit],
        )
      ).rows[0];
      assert(unit, 400, 'Geçersiz birim.');
      if (b.photo_id)
        assert(
          (
            await db.query(
              "SELECT 1 FROM documents WHERE id=$1 AND user_id=$2 AND mime_type LIKE 'image/%'",
              [b.photo_id, req.user.id],
            )
          ).rowCount,
          400,
          'Geçersiz fotoğraf.',
        );
      const result = (
        await db.query(
          'INSERT INTO count_entries(room_id,stock_id,user_id,quantity,unit,base_quantity,condition,note,photo_id) VALUES($1,$2,$3,$4,$5,$4::numeric*$6::numeric,$7,$8,$9) RETURNING id,quantity,unit,base_quantity,condition,note',
          [
            r.id,
            b.stock_id,
            req.user.id,
            b.quantity,
            b.unit,
            unit.multiplier,
            b.condition,
            b.note,
            b.photo_id,
          ],
        )
      ).rows[0];
      await db.query('DELETE FROM count_locks WHERE stock_id=$1 AND user_id=$2', [
        b.stock_id,
        req.user.id,
      ]);
      await audit(db, req.user, 'COUNT_SUBMITTED', 'count', result.id, r.business_id, {
        room_id: r.id,
      });
      return result;
    }),
  );
});

/* ============================================================
   OFFLINE COUNT SNAPSHOT + SAFE SYNC
   ============================================================ */

counting.get(
  '/count/offline-snapshot/:id',
  requirePermission('sayim_yap'),
  async (req, res) => {
    const r = await room(
      req.user,
      String(req.params.id),
    );

    assert(
      r.status === 'OPEN',
      409,
      'Oda sayıma açık değil.',
    );

    const assignment = (
      await pool.query(
        `
        SELECT
          a.location_id,
          a.approved,
          a.joined_at,
          a.agreement_accepted_at,
          a.finished_at,
          l.name location_name,
          l.code location_code
        FROM assignments a
        JOIN locations l
          ON l.id=a.location_id
        WHERE a.room_id=$1
          AND a.user_id=$2
        `,
        [r.id, req.user.id],
      )
    ).rows;

    assert(
      assignment.some(
        (a) =>
          a.approved &&
          a.joined_at &&
          a.agreement_accepted_at &&
          !a.finished_at,
      ),
      403,
      'Offline sayım için aktif onaylı göreviniz yok.',
    );

    const locationIds =
      assignment
        .filter(
          (a) =>
            a.approved &&
            !a.finished_at,
        )
        .map((a) => a.location_id);

    const rows = (
      await pool.query(
        `
        WITH RECURSIVE allowed_locations AS (
          SELECT id
          FROM locations
          WHERE id = ANY($2::uuid[])

          UNION

          SELECT l.id
          FROM locations l
          JOIN allowed_locations p
            ON l.parent_id=p.id
        )
        SELECT
          s.id AS stock_id,
          s.location_id,
          l.name AS location_name,
          l.code AS location_code,
          p.id AS product_id,
          p.name,
          p.sku,
          p.barcode,
          p.variant,
          s.lot,
          s.serial,
          COALESCE(
            json_agg(
              json_build_object(
                'name',u.name,
                'multiplier',u.multiplier
              )
              ORDER BY u.multiplier
            ) FILTER (WHERE u.name IS NOT NULL),
            '[]'::json
          ) AS units
        FROM room_items i
        JOIN stocks s
          ON s.id=i.stock_id
        JOIN products p
          ON p.id=s.product_id
        JOIN locations l
          ON l.id=s.location_id
        LEFT JOIN product_units u
          ON u.product_id=p.id
        WHERE i.room_id=$1
          AND s.location_id IN (
            SELECT id
            FROM allowed_locations
          )
        GROUP BY
          s.id,
          s.location_id,
          l.name,
          l.code,
          p.id,
          p.name,
          p.sku,
          p.barcode,
          p.variant,
          s.lot,
          s.serial
        ORDER BY
          l.name,
          p.name
        `,
        [r.id, locationIds],
      )
    ).rows;

    res.json({
      room: {
        id: r.id,
        name: r.name,
        code: r.code,
        warehouse_id: r.warehouse_id,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      },
      assignments: assignment.map((a) => ({
        location_id: a.location_id,
        location_name: a.location_name,
        location_code: a.location_code,
        approved: a.approved,
        finished_at: a.finished_at,
      })),
      products: rows,
      cached_at: new Date().toISOString(),
    });
  },
);

counting.post(
  '/count/offline-submit',
  requirePermission('sayim_yap'),
  async (req, res) => {
    const b = z
      .object({
        room_id: z.uuid(),
        stock_id: z.uuid(),
        quantity: z.coerce
          .number()
          .min(0)
          .max(1000000)
          .multipleOf(0.001),
        unit: z.string().min(1).max(30),
        condition: z.enum([
          'NORMAL',
          'DAMAGED',
          'RETURNED',
          'DISPLAY',
          'BROKEN',
        ]),
        note: z.string().max(2000).default(''),
        device_created_at: z.iso.datetime(),
        photo_id: z.uuid().nullable().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await transaction(async (db) => {
        await db.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [req.user.id],
        );

        const r =
          await ready(
            db,
            req.user,
            b.room_id,
          );

        const assignment = (
          await db.query(
            `
            SELECT
              a.location_id
            FROM assignments a
            WHERE a.room_id=$1
              AND a.user_id=$2
              AND a.approved
              AND a.joined_at IS NOT NULL
              AND a.agreement_accepted_at IS NOT NULL
              AND a.finished_at IS NULL
            `,
            [r.id, req.user.id],
          )
        ).rows;

        assert(
          assignment.length,
          403,
          'Aktif sayım göreviniz yok.',
        );

        const stock = (
          await db.query(
            `
            SELECT
              s.id,
              s.product_id,
              s.location_id
            FROM stocks s
            JOIN room_items i
              ON i.stock_id=s.id
             AND i.room_id=$2
            WHERE s.id=$1
            FOR UPDATE
            `,
            [b.stock_id, r.id],
          )
        ).rows[0];

        assert(
          stock,
          404,
          'Ürün artık sayım kapsamında değil.',
        );

        let allowed = false;

        for (const a of assignment) {
          const tree =
            await locationTree(
              db,
              a.location_id,
            );

          if (
            tree.includes(
              stock.location_id,
            )
          ) {
            allowed = true;
            break;
          }
        }

        assert(
          allowed,
          403,
          'Ürün atanmış reyonunuzda değil.',
        );

        assert(
          !(
            await db.query(
              `
              SELECT 1
              FROM count_entries
              WHERE room_id=$1
                AND stock_id=$2
              `,
              [r.id, stock.id],
            )
          ).rowCount,
          409,
          'Bu ürün zaten sayıldı.',
        );

        const unit = (
          await db.query(
            `
            SELECT multiplier
            FROM product_units
            WHERE product_id=$1
              AND name=$2
            `,
            [
              stock.product_id,
              b.unit,
            ],
          )
        ).rows[0];

        assert(
          unit,
          400,
          'Geçersiz birim.',
        );

        const baseQuantity =
          Number(b.quantity) *
          Number(unit.multiplier);

        // OFFLINE SUBMIT PHOTO VALIDATION
        if (b.photo_id) {
          assert(
            (
              await db.query(
                `
                SELECT 1
                FROM documents
                WHERE id=$1
                  AND user_id=$2
                  AND mime_type LIKE 'image/%'
                `,
                [
                  b.photo_id,
                  req.user.id,
                ],
              )
            ).rowCount,
            400,
            'Geçersiz fotoğraf.',
          );
        }

        const result = (
          await db.query(
            `
            INSERT INTO count_entries(
              room_id,
              stock_id,
              user_id,
              quantity,
              unit,
              base_quantity,
              condition,
              note,
              photo_id
            )
            VALUES(
              $1,$2,$3,$4,$5,$6,$7,$8,$9
            )
            RETURNING *
            `,
            [
              r.id,
              stock.id,
              req.user.id,
              b.quantity,
              b.unit,
              baseQuantity,
              b.condition,
              b.note,
              b.photo_id ?? null,
            ],
          )
        ).rows[0];

        await audit(
          db,
          req.user,
          'OFFLINE_COUNT_SYNCED',
          'count_entry',
          result.id,
          r.business_id,
          {
            stock_id: stock.id,
            device_created_at:
              b.device_created_at,
          },
        );

        return {
          ok: true,
          entry_id: result.id,
          stock_id: stock.id,
        };
      }),
    );
  },
);
counting.post('/count/release', requirePermission('sayim_yap'), async (req, res) => {
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
    await db.query('DELETE FROM count_locks WHERE user_id=$1', [req.user.id]);
    await audit(db, req.user, 'COUNT_RELEASED', 'user', req.user.id);
  });
  res.json({ ok: true });
});
counting.get('/count/progress/:id', requirePermission('sayim_yap'), async (req, res) => {
  const r = await room(req.user, String(req.params.id));
  const entries = (
    await pool.query(
      'SELECT c.id,c.quantity,c.unit,c.condition,c.note,c.created_at,p.name,p.sku,l.name location_name FROM count_entries c JOIN stocks s ON s.id=c.stock_id JOIN products p ON p.id=s.product_id JOIN locations l ON l.id=s.location_id WHERE c.room_id=$1 AND c.user_id=$2 ORDER BY c.created_at DESC',
      [r.id, req.user.id],
    )
  ).rows;
  const active = (
    await pool.query(
      'SELECT a.location_id,l.name,l.code FROM active_locations a JOIN locations l ON l.id=a.location_id WHERE a.room_id=$1 AND a.user_id=$2',
      [r.id, req.user.id],
    )
  ).rows[0];
  res.json({ entries, active: active || null });
});
counting.post('/count/incident', requirePermission('sayim_yap'), async (req, res) => {
  const b = z
    .object({
      room_id: z.uuid(),
      kind: z.enum(['BREAK', 'DAMAGE', 'ACCIDENT']),
      note: z.string().min(3).max(2000),
    })
    .parse(req.body);
  await transaction(async (db) => {
    const r = await ready(db, req.user, b.room_id);
    const i = (
      await db.query(
        'INSERT INTO incidents(room_id,user_id,kind,note) VALUES($1,$2,$3,$4) RETURNING id',
        [r.id, req.user.id, b.kind, b.note],
      )
    ).rows[0];
    await audit(db, req.user, 'INCIDENT_REPORTED', 'incident', i.id, r.business_id, {
      kind: b.kind,
    });
  });
  res.status(201).json({ ok: true });
});
counting.post('/count/finish', requirePermission('sayim_yap'), async (req, res) => {
  const b = z.object({ room_id: z.uuid() }).parse(req.body);
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
    const r = await ready(db, req.user, b.room_id);
    assert(
      !(await db.query('SELECT 1 FROM count_locks WHERE user_id=$1', [req.user.id])).rowCount,
      409,
      'Önce açık ürün sayımını tamamlayın.',
    );
    await db.query('UPDATE assignments SET finished_at=now() WHERE room_id=$1 AND user_id=$2', [
      r.id,
      req.user.id,
    ]);
    await db.query('DELETE FROM active_locations WHERE room_id=$1 AND user_id=$2', [
      r.id,
      req.user.id,
    ]);
    await audit(db, req.user, 'PERSON_FINISHED', 'room', r.id, r.business_id);
  });
  res.json({ ok: true });
});
counting.post('/rooms/:id/complete', requirePermission('sayim_onayla'), async (req, res) => {
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(r.status === 'OPEN', 409, 'Oda açık olmalı.');
    assert(
      !(
        await db.query(
          'SELECT 1 FROM room_items i LEFT JOIN count_entries c ON c.room_id=i.room_id AND c.stock_id=i.stock_id WHERE i.room_id=$1 AND c.id IS NULL',
          [r.id],
        )
      ).rowCount,
      409,
      'Kapsamdaki tüm ürünler sayılmadan oda tamamlanamaz.',
    );
    assert(
      !(await db.query('SELECT 1 FROM count_locks WHERE room_id=$1', [r.id])).rowCount,
      409,
      'Açık ürün kilidi var.',
    );
    await db.query("UPDATE rooms SET status='COMPLETED' WHERE id=$1", [r.id]);
    await db.query('DELETE FROM active_locations WHERE room_id=$1', [r.id]);
    await audit(db, req.user, 'ROOM_COMPLETED', 'room', r.id, r.business_id);
  });
  res.json({ ok: true });
});
counting.post(
  '/rooms/:id/second-blind',
  requirePermission('sayim_olustur'),
  async (req, res) => {
    const b = z
      .object({
        name: z.string().min(3).max(150).optional(),
        starts_at: z.iso.datetime(),
        ends_at: z.iso.datetime(),
      })
      .parse(req.body);

    assert(
      new Date(b.ends_at) >
        new Date(b.starts_at),
      400,
      'Bitiş tarihi başlangıçtan sonra olmalı.',
    );

    res.status(201).json(
      await transaction(async (db) => {
        const parent = await room(
          req.user,
          String(req.params.id),
          db,
          true,
        );

        assert(
          parent.count_type === 'BLIND',
          400,
          'İkinci kör sayım yalnız kör sayımdan oluşturulabilir.',
        );

        assert(
          parent.blind_round === 1,
          400,
          'Yalnızca ilk kör sayım için ikinci tur oluşturulabilir.',
        );

        assert(
          ['COMPLETED', 'REJECTED'].includes(
            parent.status,
          ),
          409,
          'İlk kör sayım tamamlanmadan ikinci tur oluşturulamaz.',
        );

        const existing = (
          await db.query(
            `SELECT id,code,status
             FROM rooms
             WHERE parent_room_id=$1
               AND blind_round=2`,
            [parent.id],
          )
        ).rows[0];

        assert(
          !existing,
          409,
          'Bu kör sayım için ikinci tur zaten oluşturuldu.',
        );

        const differences = (
          await db.query(
            `
            SELECT
              i.stock_id
            FROM room_items i
            JOIN count_entries c
              ON c.room_id=i.room_id
             AND c.stock_id=i.stock_id
            WHERE i.room_id=$1
              AND c.base_quantity<>i.expected
            ORDER BY i.stock_id
            `,
            [parent.id],
          )
        ).rows;

        assert(
          differences.length > 0,
          409,
          'Fark bulunmadığı için ikinci kör sayıma gerek yok.',
        );

        const second = (
          await db.query(
            `
            INSERT INTO rooms(
              business_id,
              warehouse_id,
              name,
              count_type,
              method,
              starts_at,
              ends_at,
              created_by,
              parent_room_id,
              blind_round
            )
            VALUES(
              $1,$2,$3,'BLIND',$4,$5,$6,$7,$8,2
            )
            RETURNING *
            `,
            [
              parent.business_id,
              parent.warehouse_id,
              b.name ||
                parent.name +
                  ' - 2. Kör Sayım',
              parent.method,
              b.starts_at,
              b.ends_at,
              req.user.id,
              parent.id,
            ],
          )
        ).rows[0];

        const stockIds =
          differences.map(
            (x) => x.stock_id,
          );

        await db.query(
          `
          INSERT INTO room_items(
            room_id,
            stock_id,
            expected,
            unit_cost
          )
          SELECT
            $1,
            s.id,
            s.physical,
            p.purchase_price
          FROM stocks s
          JOIN products p
            ON p.id=s.product_id
          WHERE s.id=ANY($2::uuid[])
          `,
          [
            second.id,
            stockIds,
          ],
        );

        await audit(
          db,
          req.user,
          'SECOND_BLIND_ROOM_CREATED',
          'room',
          second.id,
          parent.business_id,
          {
            parent_room_id:
              parent.id,
            stock_count:
              stockIds.length,
          },
        );

        return second;
      }),
    );
  },
);

counting.get(
  '/rooms/:id/blind-comparison',
  requirePermission('rapor_izle'),
  async (req, res) => {
    management(req.user);

    const selected =
      await room(
        req.user,
        String(req.params.id),
      );

    assert(
      selected.count_type === 'BLIND',
      400,
      'Bu oda kör sayım değildir.',
    );

    const parentId =
      selected.blind_round === 2
        ? selected.parent_room_id
        : selected.id;

    const parent =
      await room(
        req.user,
        String(parentId),
      );

    const second = (
      await pool.query(
        `
        SELECT *
        FROM rooms
        WHERE parent_room_id=$1
          AND blind_round=2
        LIMIT 1
        `,
        [parent.id],
      )
    ).rows[0] || null;

    const rows = (
      await pool.query(
        `
        SELECT
          i.stock_id,
          p.name,
          p.sku,
          l.name AS location_name,
          i.expected AS system_quantity,
          c1.base_quantity AS first_count,
          c2.base_quantity AS second_count,
          c1.base_quantity-i.expected
            AS first_difference,
          CASE
            WHEN c2.id IS NULL
              THEN NULL
            ELSE
              c2.base_quantity-i.expected
          END AS second_difference,
          CASE
            WHEN c2.id IS NULL
              THEN NULL
            ELSE
              c2.base_quantity-c1.base_quantity
          END AS rounds_difference
        FROM room_items i
        JOIN stocks s
          ON s.id=i.stock_id
        JOIN products p
          ON p.id=s.product_id
        JOIN locations l
          ON l.id=s.location_id
        JOIN count_entries c1
          ON c1.room_id=i.room_id
         AND c1.stock_id=i.stock_id
        LEFT JOIN count_entries c2
          ON c2.room_id=$2
         AND c2.stock_id=i.stock_id
        WHERE i.room_id=$1
        ORDER BY
          l.name,
          p.name
        `,
        [
          parent.id,
          second?.id || null,
        ],
      )
    ).rows;

    res.json({
      parent_room: parent,
      second_room: second,
      rows,
    });
  },
);
counting.get('/rooms/:id/report', requirePermission('rapor_izle'), async (req, res) => {
  management(req.user);
  const r = await room(req.user, String(req.params.id));
  assert(
    ['COMPLETED', 'APPROVED', 'REJECTED'].includes(r.status),
    409,
    'Rapor sayım tamamlandıktan sonra açılır.',
  );
  const rows = (
    await pool.query(
      'SELECT i.stock_id,p.name,p.sku,l.name location_name,u.name user_name,i.expected,c.base_quantity counted,c.base_quantity-i.expected difference,(c.base_quantity-i.expected)*i.unit_cost value_difference,c.condition,c.note,c.photo_id,c.id entry_id FROM room_items i JOIN stocks s ON s.id=i.stock_id JOIN products p ON p.id=s.product_id JOIN locations l ON l.id=s.location_id JOIN count_entries c ON c.room_id=i.room_id AND c.stock_id=i.stock_id JOIN users u ON u.id=c.user_id WHERE i.room_id=$1 ORDER BY l.name,p.name',
      [r.id],
    )
  ).rows;
  const performance = (
    await pool.query(
      'SELECT u.name,count(c.id) counted,min(c.created_at) first_count,max(c.created_at) last_count FROM count_entries c JOIN users u ON u.id=c.user_id WHERE c.room_id=$1 GROUP BY u.id',
      [r.id],
    )
  ).rows;
  const incidents = (
    await pool.query(
      'SELECT i.*,u.name user_name FROM incidents i JOIN users u ON u.id=i.user_id WHERE i.room_id=$1 ORDER BY i.created_at',
      [r.id],
    )
  ).rows;
  res.json({ room: r, rows, performance, incidents });
});
counting.post('/rooms/:id/review', requirePermission('sayim_onayla'), async (req, res) => {
  const b = z
    .object({ action: z.enum(['APPROVE', 'REJECT']), reason: z.string().min(3).max(1000) })
    .parse(req.body);
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(r.status === 'COMPLETED', 409, 'Yalnızca tamamlanan oda değerlendirilebilir.');
    if (b.action === 'APPROVE') {
      if (r.count_type === 'BLIND' && Number(r.blind_round || 1) === 1) {
        const diff = await db.query(
          "SELECT 1 FROM room_items i JOIN count_entries c ON c.room_id=i.room_id AND c.stock_id=i.stock_id WHERE i.room_id=$1 AND c.base_quantity<>i.expected LIMIT 1",
          [r.id],
        );

        assert(
          !diff.rowCount,
          409,
          'Ilk kor sayimda fark bulundu. Stok guncellenemez. Ikinci kor sayimi baslatin.',
        );
      }

      await db.query(
        'SELECT s.id FROM stocks s JOIN room_items i ON i.stock_id=s.id WHERE i.room_id=$1 ORDER BY s.id FOR UPDATE OF s',
        [r.id],
      );
      assert(
        !(
          await db.query(
            'SELECT 1 FROM room_items i JOIN stocks s ON s.id=i.stock_id JOIN count_entries c ON c.room_id=i.room_id AND c.stock_id=i.stock_id WHERE i.room_id=$1 AND (s.physical<>i.expected OR c.base_quantity<s.reserved)',
            [r.id],
          )
        ).rowCount,
        409,
        'Stok değişti veya sayım rezerve miktarının altında; önce inceleyin.',
      );
      await db.query(
        "UPDATE stocks s SET physical=c.base_quantity,damaged=CASE WHEN c.condition IN ('DAMAGED','BROKEN') THEN c.base_quantity ELSE 0 END,returned=CASE WHEN c.condition='RETURNED' THEN c.base_quantity ELSE 0 END,last_count_at=now() FROM count_entries c WHERE c.stock_id=s.id AND c.room_id=$1",
        [r.id],
      );
    }
    await db.query('UPDATE rooms SET status=$1 WHERE id=$2', [
      b.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      r.id,
    ]);
    await audit(
      db,
      req.user,
      b.action === 'APPROVE' ? 'ROOM_APPROVED' : 'ROOM_REJECTED',
      'room',
      r.id,
      r.business_id,
      { reason: b.reason },
    );
  });
  res.json({ ok: true });
});
counting.patch('/rooms/:id/entries/:entry', requirePermission('stok_duzelt'), async (req, res) => {
  const b = z
    .object({
      quantity: z.coerce.number().min(0).max(1000000).multipleOf(0.001),
      reason: z.string().min(5).max(1000),
    })
    .parse(req.body);
  await transaction(async (db) => {
    const r = await room(req.user, String(req.params.id), db, true);
    assert(r.status === 'COMPLETED', 409, 'Yalnızca onay bekleyen sayım düzeltilebilir.');
    const old = (
      await db.query('SELECT * FROM count_entries WHERE id=$1 AND room_id=$2', [
        req.params.entry,
        r.id,
      ])
    ).rows[0];
    assert(old, 404, 'Sayım bulunamadı.');
    await db.query(
      "UPDATE count_entries SET quantity=$1,base_quantity=$1,unit='Adet' WHERE id=$2",
      [b.quantity, old.id],
    );
    await audit(db, req.user, 'COUNT_CORRECTED', 'count', old.id, r.business_id, {
      before: old.base_quantity,
      after: b.quantity,
      reason: b.reason,
    });
  });
  res.json({ ok: true });
});


/* ============================================================
   COUNT SESSION SAFETY / HEARTBEAT
   ============================================================ */

counting.post(
  '/count/agreement',
  requirePermission('sayim_yap'),
  async (req, res) => {

    const body = z.object({
      room_id: z.uuid(),
      accepted: z.literal(true),
    }).parse(req.body);

    await transaction(async (db) => {

      const r = await room(
        req.user,
        body.room_id,
        db,
        true,
      );

      assert(
        r.status === 'OPEN',
        409,
        'Sayim odasi acik degil.',
      );

      const result = await db.query(
        `
        UPDATE assignments
        SET
          agreement_accepted_at =
            COALESCE(
              agreement_accepted_at,
              now()
            ),
          activity_status = 'ACTIVE',
          last_heartbeat_at = now()

        WHERE room_id=$1
          AND user_id=$2
          AND approved=true
          AND joined_at IS NOT NULL
          AND finished_at IS NULL

        RETURNING *
        `,
        [
          r.id,
          req.user.id,
        ],
      );

      assert(
        result.rowCount,
        403,
        'Oda onayi tamamlanmamis.',
      );

      await audit(
        db,
        req.user,
        'COUNT_AGREEMENT_ACCEPTED',
        'room',
        r.id,
        r.business_id,
      );
    });

    res.json({
      ok: true,
    });
  },
);


counting.post(
  '/count/heartbeat',
  requirePermission('sayim_yap'),
  async (req, res) => {

    const body = z.object({
      room_id: z.uuid(),

      visibility:
        z.enum([
          'VISIBLE',
          'HIDDEN',
        ]),

    }).parse(req.body);

    const result = await pool.query(
      `
      UPDATE assignments

      SET
        last_heartbeat_at = now(),

        visibility_state = $1,

        activity_status =
          CASE
            WHEN activity_status='BREAK'
              THEN 'BREAK'
            ELSE 'ACTIVE'
          END

      WHERE room_id=$2
        AND user_id=$3
        AND approved=true
        AND joined_at IS NOT NULL
        AND finished_at IS NULL
        AND agreement_accepted_at IS NOT NULL

      RETURNING
        last_heartbeat_at,
        visibility_state,
        activity_status
      `,
      [
        body.visibility,
        body.room_id,
        req.user.id,
      ],
    );

    assert(
      result.rowCount,
      403,
      'Aktif sayim oturumu bulunamadi.',
    );

    res.json(
      result.rows[0],
    );
  },
);


counting.post(
  '/count/break/start',
  requirePermission('sayim_yap'),
  async (req, res) => {

    const body = z.object({
      room_id: z.uuid(),

      reason:
        z.string()
          .trim()
          .min(3)
          .max(500),

    }).parse(req.body);

    const result =
      await transaction(async (db) => {

        const r = await room(
          req.user,
          body.room_id,
          db,
          true,
        );

        const assignment =
          (
            await db.query(
              `
              SELECT *
              FROM assignments

              WHERE room_id=$1
                AND user_id=$2
                AND approved=true
                AND joined_at IS NOT NULL
                AND finished_at IS NULL

              FOR UPDATE
              `,
              [
                r.id,
                req.user.id,
              ],
            )
          ).rows[0];

        assert(
          assignment,
          403,
          'Aktif sayim oturumu bulunamadi.',
        );

        assert(
          assignment.agreement_accepted_at,
          403,
          'Once sayim kurallarini onaylamalisiniz.',
        );

        assert(
          assignment.activity_status !== 'BREAK',
          409,
          'Zaten moladasiniz.',
        );

        const br =
          (
            await db.query(
              `
              INSERT INTO count_breaks(
                room_id,
                user_id,
                reason
              )
              VALUES($1,$2,$3)
              RETURNING *
              `,
              [
                r.id,
                req.user.id,
                body.reason,
              ],
            )
          ).rows[0];

        await db.query(
          `
          UPDATE assignments
          SET
            activity_status='BREAK',
            break_started_at=now(),
            last_heartbeat_at=now()
          WHERE room_id=$1
            AND user_id=$2
          `,
          [
            r.id,
            req.user.id,
          ],
        );

        await audit(
          db,
          req.user,
          'COUNT_BREAK_STARTED',
          'count_break',
          br.id,
          r.business_id,
          {
            room_id:
              r.id,

            reason:
              body.reason,
          },
        );

        return br;
      });

    res.status(201).json(
      result,
    );
  },
);


counting.post(
  '/count/break/end',
  requirePermission('sayim_yap'),
  async (req, res) => {

    const body = z.object({
      room_id: z.uuid(),
    }).parse(req.body);

    const result =
      await transaction(async (db) => {

        const r = await room(
          req.user,
          body.room_id,
          db,
          true,
        );

        const br =
          (
            await db.query(
              `
              SELECT *
              FROM count_breaks

              WHERE room_id=$1
                AND user_id=$2
                AND ended_at IS NULL

              ORDER BY started_at DESC

              LIMIT 1

              FOR UPDATE
              `,
              [
                r.id,
                req.user.id,
              ],
            )
          ).rows[0];

        assert(
          br,
          409,
          'Acik mola bulunamadi.',
        );

        const updated =
          (
            await db.query(
              `
              UPDATE count_breaks
              SET ended_at=now()
              WHERE id=$1
              RETURNING *
              `,
              [
                br.id,
              ],
            )
          ).rows[0];

        await db.query(
          `
          UPDATE assignments

          SET
            activity_status='ACTIVE',
            break_started_at=NULL,
            last_heartbeat_at=now()

          WHERE room_id=$1
            AND user_id=$2
          `,
          [
            r.id,
            req.user.id,
          ],
        );

        await audit(
          db,
          req.user,
          'COUNT_BREAK_ENDED',
          'count_break',
          br.id,
          r.business_id,
          {
            room_id:
              r.id,
          },
        );

        return updated;
      });

    res.json(
      result,
    );
  },
);


counting.get(
  '/rooms/:id/live-status',
  requirePermission('rapor_izle'),
  async (req, res) => {

    const roomId =
      z.string()
        .uuid()
        .parse(
          req.params.id,
        );

    const r =
      await room(
        req.user,
        roomId,
      );

    const result =
      await pool.query(
        `
        SELECT
          a.user_id,
          u.name,
          u.email,
          u.role,

          a.location_id,
          l.name AS location_name,
          l.code AS location_code,

          a.approved,
          a.joined_at,
          a.finished_at,

          a.agreement_accepted_at,

          a.activity_status,
          a.visibility_state,
          a.last_heartbeat_at,
          a.break_started_at,

          CASE
            WHEN a.last_heartbeat_at IS NULL
              THEN false

            WHEN a.last_heartbeat_at >
              now() - interval '15 seconds'
              THEN true

            ELSE false
          END AS online,

          (
            SELECT count(*)
            FROM count_entries ce
            WHERE ce.room_id=a.room_id
              AND ce.user_id=a.user_id
          )::integer AS counted_items

        FROM assignments a

        JOIN users u
          ON u.id=a.user_id

        LEFT JOIN locations l
          ON l.id=a.location_id

        WHERE a.room_id=$1

        ORDER BY
          u.name,
          l.name
        `,
        [
          r.id,
        ],
      );

    res.json(
      result.rows,
    );
  },
);





