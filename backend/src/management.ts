import {bulkProducts,listImports,importStatus} from './product-import.js';
import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { pool, transaction } from './database.js';
import { assert, authenticate, management, requirePermission, tenant } from './security.js';
import { audit, warehouse, location } from './helpers.js';
export const manage = Router();
manage.use(authenticate, (req, _res, next) => {
  try {
    management(req.user);
    next();
  } catch (e) {
    next(e);
  }
});
manage.get('/businesses', async (req, res) =>
  res.json(
    (
      await pool.query('SELECT * FROM businesses WHERE ($1::boolean OR id=$2) ORDER BY name', [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ])
    ).rows,
  ),
);
manage.post('/businesses', requirePermission('bayi_yonet'), async (req, res) => {
  assert(
    req.user.role === 'SUPER_ADMIN',
    403,
    'Firma oluşturma yalnızca BEDSS sistem yöneticisine aittir.',
  );

  const b = z
    .object({
      name: z.string().trim().min(2).max(150),
      code: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9._-]+$/),
      legal_name: z.string().trim().max(200).default(''),
      tax_number: z.string().regex(/^\d{10,11}$/),
      tax_office: z.string().trim().max(150).default(''),
      phone: z.string().trim().max(50).default(''),
      email: z.string().email().or(z.literal('')).default(''),
      city: z.string().trim().max(100).default(''),
      district: z.string().trim().max(100).default(''),
      address: z.string().trim().max(500).default(''),
      authorized_person: z.string().trim().max(150).default(''),
      status: z.enum(['ACTIVE', 'PASSIVE']).default('ACTIVE'),
    })
    .parse(req.body);

  const result = await transaction(async (db) => {
    const row = (
      await db.query(
        `
          INSERT INTO businesses(
            name,
            code,
            legal_name,
            tax_number,
            tax_office,
            phone,
            email,
            city,
            district,
            address,
            authorized_person,
            status
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING *
        `,
        [
          b.name,
          b.code.toUpperCase(),
          b.legal_name,
          b.tax_number,
          b.tax_office,
          b.phone,
          b.email,
          b.city,
          b.district,
          b.address,
          b.authorized_person,
          b.status,
        ],
      )
    ).rows[0];

    await audit(
      db,
      req.user,
      'CREATED',
      'business',
      row.id,
      row.id,
    );

    return row;
  });

  res.status(201).json(result);
});

manage.get('/businesses/:id', async (req, res) => {
  const row = (
    await pool.query(
      `
        SELECT
          b.*,
          (
            SELECT count(*)::integer
            FROM warehouses w
            WHERE w.business_id=b.id
          ) AS warehouse_count,
          (
            SELECT count(*)::integer
            FROM users u
            WHERE u.business_id=b.id
          ) AS personnel_count
        FROM businesses b
        WHERE b.id=$1
      `,
      [String(req.params.id)],
    )
  ).rows[0];

  assert(row, 404, 'Firma bulunamadı.');
  tenant(req.user, row.id);

  res.json(row);
});

manage.put(
  '/businesses/:id',
  requirePermission('bayi_yonet'),
  async (req, res) => {
    assert(
      req.user.role === 'SUPER_ADMIN',
      403,
      'Firma ana bilgilerini yalnızca BEDSS sistem yöneticisi değiştirebilir.',
    );

    const b = z
      .object({
        name: z.string().trim().min(2).max(150),
        legal_name: z.string().trim().max(200).default(''),
        tax_number: z.string().regex(/^\d{10,11}$/),
        tax_office: z.string().trim().max(150).default(''),
        phone: z.string().trim().max(50).default(''),
        email: z.string().email().or(z.literal('')).default(''),
        city: z.string().trim().max(100).default(''),
        district: z.string().trim().max(100).default(''),
        address: z.string().trim().max(500).default(''),
        authorized_person: z.string().trim().max(150).default(''),
        status: z.enum(['ACTIVE', 'PASSIVE']),
      })
      .parse(req.body);

    const result = await transaction(async (db) => {
      const current = (
        await db.query(
          `
            SELECT *
            FROM businesses
            WHERE id=$1
            FOR UPDATE
          `,
          [String(req.params.id)],
        )
      ).rows[0];

      assert(current, 404, 'Firma bulunamadı.');

      const row = (
        await db.query(
          `
            UPDATE businesses
            SET
              name=$2,
              legal_name=$3,
              tax_number=$4,
              tax_office=$5,
              phone=$6,
              email=$7,
              city=$8,
              district=$9,
              address=$10,
              authorized_person=$11,
              status=$12
            WHERE id=$1
            RETURNING *
          `,
          [
            current.id,
            b.name,
            b.legal_name,
            b.tax_number,
            b.tax_office,
            b.phone,
            b.email,
            b.city,
            b.district,
            b.address,
            b.authorized_person,
            b.status,
          ],
        )
      ).rows[0];

      await audit(
        db,
        req.user,
        'UPDATED',
        'business',
        row.id,
        row.id,
        {
          before: current,
          after: row,
        },
      );

      return row;
    });

    res.json(result);
  },
);
manage.get(
  '/users/:id/warehouses',
  requirePermission('kullanici_yonet'),
  async (req, res) => {
    const target = (
      await pool.query(
        'SELECT id,business_id,role,name FROM users WHERE id=$1',
        [String(req.params.id)],
      )
    ).rows[0];

    assert(target, 404, 'Kullanıcı bulunamadı.');
    tenant(req.user, target.business_id);

    assert(
      ['WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST'].includes(target.role),
      400,
      'Bu rol için depo ataması kullanılmaz.',
    );

    const rows = (
      await pool.query(
        `
        SELECT
          w.id,
          w.name,
          w.address,
          (uwa.user_id IS NOT NULL) AS assigned
        FROM warehouses w
        LEFT JOIN user_warehouse_assignments uwa
          ON uwa.warehouse_id=w.id
         AND uwa.user_id=$1
        WHERE w.business_id=$2
        ORDER BY w.name
        `,
        [target.id, target.business_id],
      )
    ).rows;

    res.json(rows);
  },
);

manage.put(
  '/users/:id/warehouses',
  requirePermission('kullanici_yonet'),
  async (req, res) => {
    const body = z
      .object({
        warehouse_ids: z.array(z.uuid()).max(100),
      })
      .parse(req.body);

    const result = await transaction(async (db) => {
      const target = (
        await db.query(
          'SELECT id,business_id,role,name FROM users WHERE id=$1 FOR UPDATE',
          [String(req.params.id)],
        )
      ).rows[0];

      assert(target, 404, 'Kullanıcı bulunamadı.');
      tenant(req.user, target.business_id);

      assert(
        ['WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST'].includes(target.role),
        400,
        'Bu rol için depo ataması kullanılmaz.',
      );

      // Firma yöneticisi bağımsız bilirkişi atayamaz.
      if (target.role === 'AUDITOR') {
        assert(
          req.user.role === 'SUPER_ADMIN',
          403,
          'Bilirkişi depo atamasını yalnız sistem yöneticisi yapabilir.',
        );
      }

      const uniqueIds = [...new Set(body.warehouse_ids)];

      if (uniqueIds.length) {
        const warehouses = await db.query(
          `
          SELECT id
          FROM warehouses
          WHERE id=ANY($1::uuid[])
            AND business_id=$2
          `,
          [uniqueIds, target.business_id],
        );

        assert(
          warehouses.rowCount === uniqueIds.length,
          400,
          'Depolar aynı firmaya ait olmalıdır.',
        );
      }

      await db.query(
        'DELETE FROM user_warehouse_assignments WHERE user_id=$1',
        [target.id],
      );

      for (const warehouseId of uniqueIds) {
        await db.query(
          `
          INSERT INTO user_warehouse_assignments(
            user_id,
            warehouse_id,
            assigned_by
          )
          VALUES($1,$2,$3)
          `,
          [target.id, warehouseId, req.user.id],
        );
      }

      await audit(
        db,
        req.user,
        'WAREHOUSES_ASSIGNED',
        'user',
        target.id,
        target.business_id,
        { warehouse_ids: uniqueIds },
      );

      return {
        user_id: target.id,
        warehouse_ids: uniqueIds,
      };
    });

    res.json(result);
  },
);
manage.get('/warehouses', async (req, res) =>
  res.json(
    (
      await pool.query(
        'SELECT w.*,b.name business_name FROM warehouses w JOIN businesses b ON b.id=w.business_id WHERE ($1::boolean OR w.business_id=$2) ORDER BY w.name',
        [req.user.role === 'SUPER_ADMIN', req.user.business_id],
      )
    ).rows,
  ),
);
manage.post('/warehouses', requirePermission('depo_yonet'), async (req, res) => {
  const b = z
    .object({
      business_id: z.uuid(),
      name: z.string().trim().min(2).max(150),
      code: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9._-]+$/),
      city: z.string().trim().max(100).default(''),
      district: z.string().trim().max(100).default(''),
      address: z.string().trim().max(500).default(''),
      responsible_person: z.string().trim().max(150).default(''),
      phone: z.string().trim().max(50).default(''),
      status: z.enum(['ACTIVE', 'PASSIVE']).default('ACTIVE'),
    })
    .parse(req.body);

  tenant(req.user, b.business_id);

  if (req.user.role !== 'SUPER_ADMIN') {
    const license = (
      await pool.query(
        `
          SELECT
            max_warehouses,
            (
              SELECT count(*)
              FROM warehouses
              WHERE business_id=$1
            )::integer AS warehouse_count
          FROM business_licenses
          WHERE business_id=$1
        `,
        [b.business_id],
      )
    ).rows[0];

    assert(
      license,
      403,
      'Firma lisansı bulunamadı.',
    );

    assert(
      Number(license.warehouse_count) <
        Number(license.max_warehouses),
      409,
      'Lisans depo limiti doldu.',
    );
  }

  const result = await transaction(async (db) => {
    const row = (
      await db.query(
        `
          INSERT INTO warehouses(
            business_id,
            name,
            code,
            city,
            district,
            address,
            responsible_person,
            phone,
            status
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `,
        [
          b.business_id,
          b.name,
          b.code.toUpperCase(),
          b.city,
          b.district,
          b.address,
          b.responsible_person,
          b.phone,
          b.status,
        ],
      )
    ).rows[0];

    await db.query(
      `
        INSERT INTO locations(
          warehouse_id,
          parent_id,
          name,
          kind
        )
        VALUES($1,NULL,$2,'BUFFER')
      `,
      [
        row.id,
        'Kabul Alanı',
      ],
    );

    await audit(
      db,
      req.user,
      'CREATED',
      'warehouse',
      row.id,
      b.business_id,
    );

    return row;
  });

  res.status(201).json(result);
});

manage.get('/warehouses/:id', async (req, res) => {
  const row = (
    await pool.query(
      `
        SELECT
          w.*,
          b.name AS business_name,
          (
            SELECT count(*)::integer
            FROM locations l
            WHERE l.warehouse_id=w.id
          ) AS location_count,
          (
            SELECT count(*)::integer
            FROM user_warehouse_assignments uwa
            WHERE uwa.warehouse_id=w.id
          ) AS personnel_count,
          (
            SELECT count(*)::integer
            FROM stocks s
            JOIN locations l
              ON l.id=s.location_id
            WHERE l.warehouse_id=w.id
          ) AS stock_record_count
        FROM warehouses w
        JOIN businesses b
          ON b.id=w.business_id
        WHERE w.id=$1
      `,
      [String(req.params.id)],
    )
  ).rows[0];

  assert(row, 404, 'Depo bulunamadı.');
  tenant(req.user, row.business_id);

  res.json(row);
});

manage.put(
  '/warehouses/:id',
  requirePermission('depo_yonet'),
  async (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(150),
        city: z.string().trim().max(100).default(''),
        district: z.string().trim().max(100).default(''),
        address: z.string().trim().max(500).default(''),
        responsible_person: z.string().trim().max(150).default(''),
        phone: z.string().trim().max(50).default(''),
        status: z.enum(['ACTIVE', 'PASSIVE']),
      })
      .parse(req.body);

    const result = await transaction(async (db) => {
      const current = (
        await db.query(
          `
            SELECT *
            FROM warehouses
            WHERE id=$1
            FOR UPDATE
          `,
          [String(req.params.id)],
        )
      ).rows[0];

      assert(current, 404, 'Depo bulunamadı.');
      tenant(req.user, current.business_id);

      const row = (
        await db.query(
          `
            UPDATE warehouses
            SET
              name=$2,
              city=$3,
              district=$4,
              address=$5,
              responsible_person=$6,
              phone=$7,
              status=$8
            WHERE id=$1
            RETURNING *
          `,
          [
            current.id,
            b.name,
            b.city,
            b.district,
            b.address,
            b.responsible_person,
            b.phone,
            b.status,
          ],
        )
      ).rows[0];

      await audit(
        db,
        req.user,
        'UPDATED',
        'warehouse',
        row.id,
        row.business_id,
        {
          before: current,
          after: row,
        },
      );

      return row;
    });

    res.json(result);
  },
);
manage.get('/locations', async (req, res) =>
  res.json(
    (
      await pool.query(
        'SELECT l.*,w.name warehouse_name,w.business_id,p.name parent_name FROM locations l JOIN warehouses w ON w.id=l.warehouse_id LEFT JOIN locations p ON p.id=l.parent_id WHERE ($1::boolean OR w.business_id=$2) ORDER BY w.name,l.code',
        [req.user.role === 'SUPER_ADMIN', req.user.business_id],
      )
    ).rows,
  ),
);
manage.post('/locations', requirePermission('depo_yonet'), async (req, res) => {
  const b = z
    .object({
      warehouse_id: z.uuid(),
      parent_id: z.uuid().nullable().default(null),
      name: z.string().trim().min(2).max(150),
      kind: z.enum(['ZONE', 'RACK', 'FLOOR', 'BIN', 'BUFFER', 'QUARANTINE']),
    })
    .parse(req.body);
  const w = await warehouse(req.user, b.warehouse_id);
  if (b.parent_id) {
    const p = await location(req.user, b.parent_id);
    assert(p.warehouse_id === w.id, 400, 'Üst lokasyon aynı depoda olmalı.');
    assert(
      ({ RACK: 'ZONE', FLOOR: 'RACK', BIN: 'FLOOR' } as Record<string, string>)[b.kind] === p.kind,
      400,
      'Hiyerarşi Bölüm → Reyon → Kat → Hücre olmalı.',
    );
  } else
    assert(
      ['ZONE', 'BUFFER', 'QUARANTINE'].includes(b.kind),
      400,
      'Bu lokasyon türü için üst lokasyon seçin.',
    );
  res.status(201).json(
    await transaction(async (db) => {
      const r = (
        await db.query(
          'INSERT INTO locations(warehouse_id,parent_id,name,kind) VALUES($1,$2,$3,$4) RETURNING *',
          [b.warehouse_id, b.parent_id, b.name, b.kind],
        )
      ).rows[0];
      await audit(db, req.user, 'CREATED', 'location', r.id, w.business_id);
      return r;
    }),
  );
});
manage.get('/locations/:id/qr', requirePermission('qr_yonet'), async (req, res) => {
  const l = await location(req.user, String(req.params.id));
  res.json({ code: l.code, image: await QRCode.toDataURL(l.code, { width: 280, margin: 2 }) });
});
manage.get('/products', async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT p.*,COALESCE((SELECT json_agg(json_build_object('name',u.name,'multiplier',u.multiplier)) FROM product_units u WHERE u.product_id=p.id),'[]') units FROM products p WHERE ($1::boolean OR p.business_id=$2) ORDER BY p.name",
        [req.user.role === 'SUPER_ADMIN', req.user.business_id],
      )
    ).rows,
  ),
);
const amount = z.coerce.number().min(0).max(999999999).multipleOf(0.001);
const productSchema = z
  .object({
    business_id: z.uuid(),
    sku: z.string().trim().min(1).max(80),
    barcode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(200),
    category: z.string().trim().max(100).default(''),
    subcategory: z.string().trim().max(100).default(''),
    brand: z.string().trim().max(100).default(''),
    model: z.string().trim().max(100).default(''),
    variant: z.string().trim().max(150).default(''),
    purchase_price: amount.default(0),
    sale_price: amount.default(0),
    vat: z.coerce.number().min(0).max(100).default(20),
    supplier: z.string().trim().max(150).default(''),
    min_stock: amount.default(0),
    max_stock: amount.default(1000),
    abc: z.enum(['A', 'B', 'C']).default('C'),
    box_size: z.coerce.number().positive().max(100000).default(12),
    pallet_size: z.coerce.number().positive().max(1000000).default(144),
  })
  .refine((x) => x.max_stock >= x.min_stock, { message: 'Maksimum stok minimumdan küçük olamaz.' });
manage.post('/products/bulk', requirePermission('urun_yonet'), bulkProducts);
manage.get('/products/bulk/jobs', requirePermission('urun_yonet'), listImports);
manage.get('/products/bulk/jobs/:id', requirePermission('urun_yonet'), importStatus);
manage.post('/products', requirePermission('urun_yonet'), async (req, res) => {
  const b = productSchema.parse(req.body);
  tenant(req.user, b.business_id);
  res.status(201).json(
    await transaction(async (db) => {
      const { box_size, pallet_size, ...fields } = b;
      const keys = Object.keys(fields);
      const r = (
        await db.query(
          `INSERT INTO products(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
          Object.values(fields),
        )
      ).rows[0];
      await db.query(
        "INSERT INTO product_units(product_id,name,multiplier) VALUES($1,'Adet',1),($1,'Koli',$2),($1,'Palet',$3)",
        [r.id, box_size, pallet_size],
      );
      await audit(db, req.user, 'CREATED', 'product', r.id, b.business_id);
      return r;
    }),
  );
});
manage.get('/stocks', async (req, res) =>
  res.json(
    (
      await pool.query(
        'SELECT s.*,p.name,p.sku,p.barcode,p.variant,p.min_stock,p.purchase_price,p.sale_price,p.abc,p.business_id,l.name location_name,l.code location_code,w.name warehouse_name,l.kind FROM stocks s JOIN products p ON p.id=s.product_id JOIN locations l ON l.id=s.location_id JOIN warehouses w ON w.id=l.warehouse_id WHERE ($1::boolean OR p.business_id=$2) ORDER BY p.name',
        [req.user.role === 'SUPER_ADMIN', req.user.business_id],
      )
    ).rows,
  ),
);
manage.post('/stocks', requirePermission('stok_duzelt'), (_req, res) => {
  res.status(405).json({
    error:
      'Doğrudan stok girişi kapalıdır. Yeni stok için Mal Kabul veya Başlangıç Stoğu kullanın.',
  });
});
manage.patch('/stocks/:id', requirePermission('stok_duzelt'), async (req, res) => {
  const b = z.object({ physical: amount, reason: z.string().min(5).max(1000) }).parse(req.body);
  res.json(
    await transaction(async (db) => {
      const r = await db.query(
        'SELECT s.*,p.business_id FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.id=$1 FOR UPDATE OF s',
        [req.params.id],
      );
      assert(r.rowCount, 404, 'Stok bulunamadı.');
      const s = r.rows[0];
      tenant(req.user, s.business_id);
      assert(
        b.physical >= Number(s.reserved) && b.physical >= Number(s.damaged) + Number(s.returned),
        400,
        'Miktar rezerve veya hasarlı/iade miktarının altında olamaz.',
      );
      assert(
        !(
          await db.query(
            "SELECT 1 FROM room_items i JOIN rooms r ON r.id=i.room_id WHERE i.stock_id=$1 AND r.status IN ('OPEN','COMPLETED')",
            [s.id],
          )
        ).rowCount,
        409,
        'Aktif veya onay bekleyen sayımda stok düzeltilemez.',
      );
      await db.query('UPDATE stocks SET physical=$1 WHERE id=$2', [b.physical, s.id]);
      await audit(db, req.user, 'STOCK_ADJUSTED', 'stock', s.id, s.business_id, {
        before: s.physical,
        after: b.physical,
        reason: b.reason,
      });
      return { ok: true };
    }),
  );
});
manage.get('/audit-logs', requirePermission('log_izle'), async (req, res) =>
  res.json(
    (
      await pool.query(
        'SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ($1::boolean OR a.business_id=$2) ORDER BY a.id DESC LIMIT 200',
        [req.user.role === 'SUPER_ADMIN', req.user.business_id],
      )
    ).rows,
  ),
);
manage.get('/dashboard', requirePermission('rapor_izle'), async (req, res) => {
  const args = [req.user.role === 'SUPER_ADMIN', req.user.business_id];
  const [metrics, recent, low] = await Promise.all([
    pool.query(
      "SELECT (SELECT count(*) FROM businesses WHERE ($1::boolean OR id=$2)) businesses,(SELECT count(*) FROM warehouses WHERE ($1::boolean OR business_id=$2)) warehouses,(SELECT count(*) FROM products WHERE ($1::boolean OR business_id=$2)) products,(SELECT count(*) FROM rooms WHERE ($1::boolean OR business_id=$2) AND status='OPEN') active_rooms,(SELECT COALESCE(sum(s.physical*p.purchase_price),0) FROM stocks s JOIN products p ON p.id=s.product_id WHERE ($1::boolean OR p.business_id=$2)) stock_value",
      args,
    ),
    pool.query(
      'SELECT r.*,w.name warehouse_name,(SELECT count(*) FROM room_items WHERE room_id=r.id) total,(SELECT count(*) FROM count_entries WHERE room_id=r.id) counted FROM rooms r JOIN warehouses w ON w.id=r.warehouse_id WHERE ($1::boolean OR r.business_id=$2) ORDER BY r.created_at DESC LIMIT 5',
      args,
    ),
    pool.query(
      'SELECT p.name,p.sku,p.min_stock,COALESCE(sum(s.physical),0) physical FROM products p LEFT JOIN stocks s ON s.product_id=p.id WHERE ($1::boolean OR p.business_id=$2) GROUP BY p.id HAVING COALESCE(sum(s.physical),0)<p.min_stock',
      args,
    ),
  ]);
  res.json({ metrics: metrics.rows[0], rooms: recent.rows, low_stock: low.rows });
});







// Demo ortamını güvenli biçimde başlangıç durumuna döndürür.
// Gerçek müşteri verisi bulunan bir veritabanında işlem bilinçli olarak engellenir.
manage.get('/system/demo-reset/status', async (req, res) => {
  assert(req.user.role === 'SUPER_ADMIN', 403, 'Bu işlem yalnızca BEDSS sistem yöneticisine aittir.');
  const businesses = (await pool.query('SELECT name,tax_number FROM businesses ORDER BY name')).rows;
  const demoTaxNumbers = new Set(['1234567890', '9876543210']);
  const nonDemo = businesses.filter((row) => !demoTaxNumbers.has(String(row.tax_number)));
  res.json({
    enabled: process.env.DEMO_RESET_ENABLED === 'true',
    safe_to_reset: nonDemo.length === 0,
    business_count: businesses.length,
    non_demo_businesses: nonDemo.map((row) => row.name),
  });
});

manage.post('/system/demo-reset', async (req, res) => {
  assert(req.user.role === 'SUPER_ADMIN', 403, 'Bu işlem yalnızca BEDSS sistem yöneticisine aittir.');
  assert(process.env.DEMO_RESET_ENABLED === 'true', 403, 'Demo sıfırlama bu ortamda kapalı.');

  const body = z.object({ confirmation: z.literal('DEMO VERİLERİNİ SIFIRLA') }).parse(req.body);
  void body;

  const demoTaxNumbers = ['1234567890', '9876543210'];
  const nonDemo = (
    await pool.query('SELECT name FROM businesses WHERE NOT (tax_number = ANY($1::text[]))', [demoTaxNumbers])
  ).rows;
  assert(
    nonDemo.length === 0,
    409,
    `Gerçek firma verisi bulunduğu için demo sıfırlama engellendi: ${nonDemo.map((r) => r.name).join(', ')}`,
  );

  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(982343)');
    const tables = (
      await db.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname='public' AND tablename <> 'schema_versions'
         ORDER BY tablename`,
      )
    ).rows.map((r) => `"${String(r.tablename).replace(/"/g, '""')}"`);
    if (tables.length) {
      await db.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    }
  });

  // seed kendi transaction'ını kullanır; truncate tamamlandıktan sonra çağrılır.
  const { seed } = await import('./seed.js');
  await seed();
  await pool.query(
    `INSERT INTO audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
     SELECT b.id,u.id,'DEMO_RESET','system',b.id::text,$1::jsonb
     FROM businesses b
     JOIN users u ON u.email='admin@bedss.local'
     WHERE b.tax_number='1234567890'`,
    [JSON.stringify({ reset_at: new Date().toISOString() })],
  );
  res.json({ ok: true, message: 'Demo verileri başlangıç durumuna getirildi. Yeniden giriş yapın.' });
});
