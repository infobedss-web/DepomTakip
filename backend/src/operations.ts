import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './database.js';
import { assert, authenticate, requirePermission, tenant } from './security.js';
import { audit } from './helpers.js';

export const operations = Router();



// authenticate already applied in app.ts

/* ============================================================
   STOCK ADJUSTMENT MANAGEMENT
   ============================================================ */

operations.get(
  '/stock-adjustments/sources',
  requirePermission('stok_duzelt'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        s.id AS stock_id,
        s.product_id,
        s.location_id,
        s.physical,
        s.reserved,
        s.damaged,
        s.returned,
        s.lot,
        s.serial,

        p.name AS product_name,
        p.sku,
        p.barcode,
        p.variant,

        l.name AS location_name,
        l.code AS location_code,
        l.kind AS location_kind,
        l.warehouse_id,

        w.name AS warehouse_name,
        w.business_id,

        GREATEST(
          s.physical - s.reserved - s.damaged,
          0
        ) AS available

      FROM stocks s

      JOIN products p
        ON p.id = s.product_id

      JOIN locations l
        ON l.id = s.location_id

      JOIN warehouses w
        ON w.id = l.warehouse_id

      WHERE
        ($1::boolean OR p.business_id = $2)
        AND l.kind IN ('RACK','FLOOR','BIN')

      ORDER BY
        w.name,
        l.name,
        p.name,
        s.lot,
        s.serial
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.get(
  '/stock-adjustments/history',
  requirePermission('stok_duzelt'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        sa.*,

        p.name AS product_name,
        p.sku,
        p.variant,

        l.name AS location_name,
        l.code AS location_code,

        w.name AS warehouse_name,

        u.name AS created_by_name

      FROM stock_adjustments sa

      JOIN products p
        ON p.id = sa.product_id

      JOIN locations l
        ON l.id = sa.location_id

      JOIN warehouses w
        ON w.id = sa.warehouse_id

      JOIN users u
        ON u.id = sa.created_by

      WHERE
        ($1::boolean OR sa.business_id = $2)

      ORDER BY sa.created_at DESC

      LIMIT 200
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.post(
  '/stock-adjustments',
  requirePermission('stok_duzelt'),
  async (req, res) => {
    const body = z
      .object({
        stock_id: z.uuid(),

        adjustment_type: z.enum([
          'INCREASE',
          'DECREASE',
        ]),

        quantity,

        reason_code: z.enum([
          'COUNT_VARIANCE',
          'DATA_CORRECTION',
          'PHYSICAL_CORRECTION',
          'OTHER',
        ]),

        reason: z.string().trim().min(3).max(500),

        note: z
          .string()
          .trim()
          .max(2000)
          .default(''),
      })
      .parse(req.body);

    const result = await transaction(async (db) => {

      const stockResult = await db.query(
        `
        SELECT
          s.*,

          p.business_id,
          p.name AS product_name,
          p.sku,

          l.warehouse_id,
          l.kind AS location_kind,
          l.name AS location_name

        FROM stocks s

        JOIN products p
          ON p.id = s.product_id

        JOIN locations l
          ON l.id = s.location_id

        WHERE s.id=$1

        FOR UPDATE
        `,
        [body.stock_id],
      );

      assert(
        stockResult.rowCount,
        404,
        'Stok kaydı bulunamadı.',
      );

      const stock = stockResult.rows[0];

      tenant(
        req.user,
        stock.business_id,
      );

      assert(
        ['RACK', 'FLOOR', 'BIN'].includes(
          stock.location_kind,
        ),
        400,
        'Bu lokasyonda manuel stok düzeltme yapılamaz.',
      );

      const beforeQuantity =
        Number(stock.physical);

      let afterQuantity =
        beforeQuantity;

      if (
        body.adjustment_type ===
        'INCREASE'
      ) {
        afterQuantity =
          beforeQuantity +
          Number(body.quantity);
      } else {

        const available =
          Number(stock.physical) -
          Number(stock.reserved) -
          Number(stock.damaged);

        assert(
          Number(body.quantity) <= available,
          400,
          'Azaltılabilir kullanılabilir stok yetersiz.',
        );

        afterQuantity =
          beforeQuantity -
          Number(body.quantity);
      }

      assert(
        afterQuantity >= 0,
        400,
        'Stok miktarı sıfırın altına düşemez.',
      );

      await db.query(
        `
        UPDATE stocks
        SET physical=$1
        WHERE id=$2
        `,
        [
          afterQuantity,
          stock.id,
        ],
      );

      const adjustment = (
        await db.query(
          `
          INSERT INTO stock_adjustments(
            business_id,
            warehouse_id,
            location_id,
            product_id,

            adjustment_type,
            quantity,

            before_quantity,
            after_quantity,

            lot,
            serial,

            reason_code,
            reason,
            note,

            created_by
          )
          VALUES(
            $1,$2,$3,$4,
            $5,$6,
            $7,$8,
            $9,$10,
            $11,$12,$13,
            $14
          )
          RETURNING *
          `,
          [
            stock.business_id,
            stock.warehouse_id,
            stock.location_id,
            stock.product_id,

            body.adjustment_type,
            body.quantity,

            beforeQuantity,
            afterQuantity,

            stock.lot || '',
            stock.serial || '',

            body.reason_code,
            body.reason,
            body.note,

            req.user.id,
          ],
        )
      ).rows[0];

      /*
       * Genel stok hareket defteri.
       * INCREASE: disaridan lokasyona
       * DECREASE: lokasyondan disariya
       */
      await db.query(
        `
        INSERT INTO stock_movements(
          business_id,
          warehouse_id,
          product_id,

          from_location_id,
          to_location_id,

          movement_type,
          quantity,

          lot,
          serial,

          reference_type,
          reference_id,

          created_by
        )
        VALUES(
          $1,$2,$3,
          $4,$5,
          'ADJUSTMENT',$6,
          $7,$8,
          'STOCK_ADJUSTMENT',$9,
          $10
        )
        `,
        [
          stock.business_id,
          stock.warehouse_id,
          stock.product_id,

          body.adjustment_type === 'DECREASE'
            ? stock.location_id
            : null,

          body.adjustment_type === 'INCREASE'
            ? stock.location_id
            : null,

          Number(body.quantity),

          stock.lot || '',
          stock.serial || '',

          adjustment.id,

          req.user.id,
        ],
      );

      await audit(
        db,
        req.user,
        'STOCK_ADJUSTMENT_COMPLETED',
        'stock_adjustment',
        adjustment.id,
        stock.business_id,
        {
          stock_id: stock.id,

          adjustment_type:
            body.adjustment_type,

          quantity:
            Number(body.quantity),

          before_quantity:
            beforeQuantity,

          after_quantity:
            afterQuantity,

          reason_code:
            body.reason_code,

          reason:
            body.reason,
        },
      );

      return adjustment;
    });

    res.status(201).json(result);
  },
);



const quantity = z.coerce
  .number()
  .positive()
  .max(999999999)
  .multipleOf(0.001);

const receiptItemSchema = z.object({
  product_id: z.uuid(),
  quantity,
  unit: z.string().min(1).max(50).default('Adet'),
  lot: z.string().max(100).default(''),
  serial: z.string().max(100).default(''),
  expiry_date: z.string().max(20).nullable().optional(),
  condition: z.enum(['GOOD', 'DAMAGED', 'QUARANTINE']).default('GOOD'),
  note: z.string().max(2000).default(''),
});

async function receiptForUser(
  user: Express.Request['user'],
  id: string,
  db: any = pool,
  lock = false,
) {
  const result = await db.query(
    `SELECT *
     FROM goods_receipts
     WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );

  assert(result.rowCount, 404, 'Mal kabul kaydı bulunamadı.');

  const receipt = result.rows[0];

  tenant(user, receipt.business_id);

  return receipt;
}

async function bufferLocation(
  businessId: string,
  warehouseId: string,
  db: any,
) {
  const result = await db.query(
    `
      SELECT l.*
      FROM locations l
      JOIN warehouses w ON w.id=l.warehouse_id
      WHERE l.warehouse_id=$1
        AND w.business_id=$2
        AND l.kind='BUFFER'
      ORDER BY l.id
      LIMIT 1
    `,
    [warehouseId, businessId],
  );

  assert(
    result.rowCount,
    400,
    'Bu depoda BUFFER / Kabul Alanı bulunmuyor. Önce Kabul Alanı lokasyonu oluşturun.',
  );

  return result.rows[0];
}

/* ==========================================================
   LISTE
   ========================================================== */

operations.get('/goods-receipts', async (req, res) => {
  const result = await pool.query(
    `
      SELECT
        gr.*,
        b.name AS business_name,
        w.name AS warehouse_name,
        u.name AS received_by_name,

        COALESCE(
          (
            SELECT count(*)::int
            FROM goods_receipt_items gri
            WHERE gri.receipt_id=gr.id
          ),
          0
        ) AS item_count,

        COALESCE(
          (
            SELECT sum(gri.base_quantity)
            FROM goods_receipt_items gri
            WHERE gri.receipt_id=gr.id
          ),
          0
        ) AS total_quantity,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', gri.id,
                'product_id', gri.product_id,
                'product_name', p.name,
                'sku', p.sku,
                'barcode', p.barcode,
                'location_id', gri.location_id,
                'location_name', l.name,
                'quantity', gri.quantity,
                'unit', gri.unit,
                'base_quantity', gri.base_quantity,
                'lot', gri.lot,
                'serial', gri.serial,
                'expiry_date', gri.expiry_date,
                'condition', gri.condition,
                'note', gri.note
              )
              ORDER BY gri.created_at
            )
            FROM goods_receipt_items gri
            JOIN products p ON p.id=gri.product_id
            JOIN locations l ON l.id=gri.location_id
            WHERE gri.receipt_id=gr.id
          ),
          '[]'::json
        ) AS items

      FROM goods_receipts gr
      JOIN businesses b ON b.id=gr.business_id
      JOIN warehouses w ON w.id=gr.warehouse_id
      JOIN users u ON u.id=gr.received_by

      WHERE ($1::boolean OR gr.business_id=$2)

      ORDER BY gr.received_at DESC
    `,
    [req.user.role === 'SUPER_ADMIN', req.user.business_id],
  );

  res.json(result.rows);
});

/* ==========================================================
   DETAY
   ========================================================== */

operations.get('/goods-receipts/:id', async (req, res) => {
  const receipt = await receiptForUser(
    req.user,
    String(req.params.id),
  );

  const items = (
    await pool.query(
      `
        SELECT
          gri.*,
          p.name AS product_name,
          p.sku,
          p.barcode,
          l.name AS location_name,
          l.code AS location_code
        FROM goods_receipt_items gri
        JOIN products p ON p.id=gri.product_id
        JOIN locations l ON l.id=gri.location_id
        WHERE gri.receipt_id=$1
        ORDER BY gri.created_at
      `,
      [receipt.id],
    )
  ).rows;

  res.json({
    ...receipt,
    items,
  });
});

/* ==========================================================
   BELGE FOTOGRAFI
   JSON BASE64 kullanıyoruz.
   Maksimum 5 MB.
   ========================================================== */

operations.post(
  '/goods-receipts/document',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      filename: z.string().min(1).max(200),
      mime_type: z.enum([
        'image/jpeg',
        'image/png',
        'application/pdf',
      ]),
      data: z.string().min(1),
    }).parse(req.body);

    const buffer = Buffer.from(body.data, 'base64');

    assert(buffer.length > 0, 400, 'Belge boş.');
    assert(
      buffer.length <= 5 * 1024 * 1024,
      400,
      'Belge en fazla 5 MB olabilir.',
    );

    const ext =
      body.mime_type === 'image/png'
        ? '.png'
        : body.mime_type === 'application/pdf'
          ? '.pdf'
          : '.jpg';

    const storedName = `${randomUUID()}${ext}`;

    const result = await transaction(async (db) => {
      const document = (
        await db.query(
          `
            INSERT INTO documents(
              user_id,
              filename,
              original_name,
              mime_type,
              content
            )
            VALUES($1,$2,$3,$4,$5)
            RETURNING id, user_id, filename, original_name, mime_type, created_at
          `,
          [
            req.user.id,
            storedName,
            body.filename,
            body.mime_type,
            buffer,
          ],
        )
      ).rows[0];

      await audit(
        db,
        req.user,
        'DOCUMENT_UPLOADED',
        'document',
        document.id,
        req.user.business_id,
        {
          original_name: body.filename,
          mime_type: body.mime_type,
          context: 'GOODS_RECEIPT',
        },
      );

      return document;
    });

    res.status(201).json(result);
  },
);

/* ==========================================================
   TASLAK OLUŞTUR
   STOK DEĞİŞMEZ.
   ========================================================== */

operations.post(
  '/goods-receipts',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      business_id: z.uuid(),
      warehouse_id: z.uuid(),
      supplier: z.string().min(1).max(200),
      document_number: z.string().max(100).default(''),
      document_photo_id: z.uuid().nullable().default(null),
      note: z.string().max(2000).default(''),
      items: z.array(receiptItemSchema).min(1),
    }).parse(req.body);

    tenant(req.user, body.business_id);

    const result = await transaction(async (db) => {
      const warehouseResult = await db.query(
        `
          SELECT *
          FROM warehouses
          WHERE id=$1
          FOR SHARE
        `,
        [body.warehouse_id],
      );

      assert(
        warehouseResult.rowCount,
        404,
        'Depo bulunamadı.',
      );

      const warehouse = warehouseResult.rows[0];

      assert(
        warehouse.business_id === body.business_id,
        400,
        'Depo seçilen işletmeye ait değil.',
      );

      const buffer = await bufferLocation(
        body.business_id,
        body.warehouse_id,
        db,
      );

      if (body.document_photo_id) {
        const document = await db.query(
          `
            SELECT 1
            FROM documents
            WHERE id=$1
              AND user_id=$2
          `,
          [body.document_photo_id, req.user.id],
        );

        assert(
          document.rowCount,
          400,
          'Geçersiz belge.',
        );
      }

      const receipt = (
        await db.query(
          `
            INSERT INTO goods_receipts(
              business_id,
              warehouse_id,
              supplier,
              document_number,
              document_photo_id,
              note,
              status,
              received_by
            )
            VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7)
            RETURNING *
          `,
          [
            body.business_id,
            body.warehouse_id,
            body.supplier,
            body.document_number,
            body.document_photo_id,
            body.note,
            req.user.id,
          ],
        )
      ).rows[0];

      for (const item of body.items) {
        const productResult = await db.query(
          `
            SELECT *
            FROM products
            WHERE id=$1
            FOR SHARE
          `,
          [item.product_id],
        );

        assert(
          productResult.rowCount,
          404,
          'Ürün bulunamadı.',
        );

        const product = productResult.rows[0];

        assert(
          product.business_id === body.business_id,
          400,
          'Ürün seçilen işletmeye ait değil.',
        );

        const unitResult = await db.query(
          `
            SELECT multiplier
            FROM product_units
            WHERE product_id=$1
              AND name=$2
          `,
          [item.product_id, item.unit],
        );

        assert(
          unitResult.rowCount,
          400,
          `Geçersiz ürün birimi: ${item.unit}`,
        );

        const multiplier =
          Number(unitResult.rows[0].multiplier);

        const baseQuantity =
          Number(item.quantity) * multiplier;

        await db.query(
          `
            INSERT INTO goods_receipt_items(
              receipt_id,
              product_id,
              location_id,
              quantity,
              unit,
              base_quantity,
              lot,
              serial,
              expiry_date,
              condition,
              note
            )
            VALUES(
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
            )
          `,
          [
            receipt.id,
            item.product_id,
            buffer.id,
            item.quantity,
            item.unit,
            baseQuantity,
            item.lot || '',
            item.serial || '',
            item.expiry_date || null,
            item.condition,
            item.note,
          ],
        );
      }

      await audit(
        db,
        req.user,
        'GOODS_RECEIPT_CREATED',
        'goods_receipt',
        receipt.id,
        body.business_id,
        {
          warehouse_id: body.warehouse_id,
          buffer_location_id: buffer.id,
          supplier: body.supplier,
          document_number: body.document_number,
          item_count: body.items.length,
        },
      );

      return {
        ...receipt,
        buffer_location_id: buffer.id,
        buffer_location_name: buffer.name,
      };
    });

    res.status(201).json(result);
  },
);

/* ==========================================================
   MAL KABULÜ TAMAMLA
   SADECE BURADA STOK DEĞİŞİR.
   ========================================================== */

operations.post(
  '/goods-receipts/:id/complete',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await transaction(async (db) => {
      const receipt = await receiptForUser(
        req.user,
        String(req.params.id),
        db,
        true,
      );

      assert(
        receipt.status === 'DRAFT',
        409,
        receipt.status === 'COMPLETED'
          ? 'Bu mal kabul daha önce tamamlandı.'
          : 'Bu mal kabul tamamlanamaz.',
      );

      const warehouseResult = await db.query(
        `
          SELECT *
          FROM warehouses
          WHERE id=$1
          FOR SHARE
        `,
        [receipt.warehouse_id],
      );

      assert(
        warehouseResult.rowCount,
        404,
        'Depo bulunamadı.',
      );

      assert(
        warehouseResult.rows[0].business_id ===
          receipt.business_id,
        400,
        'Depo işletme eşleşmesi geçersiz.',
      );

      const buffer = await bufferLocation(
        receipt.business_id,
        receipt.warehouse_id,
        db,
      );

      const items = (
        await db.query(
          `
            SELECT
              gri.*,
              p.business_id AS product_business_id
            FROM goods_receipt_items gri
            JOIN products p ON p.id=gri.product_id
            WHERE gri.receipt_id=$1
            ORDER BY gri.id
          `,
          [receipt.id],
        )
      ).rows;

      assert(
        items.length > 0,
        400,
        'Mal kabul ürün satırı bulunmuyor.',
      );

      /* TODO-14 INITIAL STOCK DUPLICATE GUARD */
      for (const item of items) {
        if (item.note === 'Başlangıç stok girişi') {
          const previousInitialStock = await db.query(
            "SELECT 1 FROM goods_receipts previous_gr JOIN goods_receipt_items previous_gri ON previous_gri.receipt_id = previous_gr.id WHERE previous_gr.warehouse_id = $1 AND previous_gr.status = 'COMPLETED' AND previous_gr.id <> $2 AND previous_gri.product_id = $3 AND previous_gri.note = 'Başlangıç stok girişi' LIMIT 1",
            [
              receipt.warehouse_id,
              receipt.id,
              item.product_id,
            ],
          );

          assert(
            !previousInitialStock.rowCount,
            409,
            'Bu ürün için bu depoda başlangıç stoğu daha önce kaydedilmiş. Yeni giriş için Mal Kabul kullanın.',
          );
        }
      }

      for (const item of items) {
        assert(
          item.product_business_id === receipt.business_id,
          400,
          'Mal kabul içinde başka işletmeye ait ürün var.',
        );

        assert(
          item.location_id === buffer.id,
          409,
          'Mal kabul BUFFER lokasyonu değişmiş. İşlem durduruldu.',
        );

        const lot = item.lot || '';
        const serial = item.serial || '';
        const qty = Number(item.base_quantity);

        /*
          Advisory lock:
          Aynı ürün/lokasyon/lot/seri için eş zamanlı
          mal kabullerin duplicate stok oluşturmasını engeller.
        */
        await db.query(
          `
            SELECT pg_advisory_xact_lock(
              hashtext($1)
            )
          `,
          [
            [
              item.product_id,
              buffer.id,
              lot,
              serial,
            ].join('|'),
          ],
        );

        const stock = (
          await db.query(
            `
              SELECT *
              FROM stocks
              WHERE product_id=$1
                AND location_id=$2
                AND lot=$3
                AND serial=$4
              FOR UPDATE
            `,
            [
              item.product_id,
              buffer.id,
              lot,
              serial,
            ],
          )
        ).rows[0];

        if (stock) {
          await db.query(
            `
              UPDATE stocks
              SET
                physical=physical+$1,
                damaged=
                  CASE
                    WHEN $2='DAMAGED'
                    THEN damaged+$1
                    ELSE damaged
                  END
              WHERE id=$3
            `,
            [
              qty,
              item.condition,
              stock.id,
            ],
          );
        } else {
          await db.query(
            `
              INSERT INTO stocks(
                product_id,
                location_id,
                physical,
                reserved,
                damaged,
                returned,
                lot,
                serial
              )
              VALUES(
                $1,$2,$3,0,$4,0,$5,$6
              )
            `,
            [
              item.product_id,
              buffer.id,
              qty,
              item.condition === 'DAMAGED'
                ? qty
                : 0,
              lot,
              serial,
            ],
          );
        }

        await db.query(
          `
            INSERT INTO stock_movements(
              business_id,
              warehouse_id,
              product_id,
              from_location_id,
              to_location_id,
              movement_type,
              quantity,
              lot,
              serial,
              reference_type,
              reference_id,
              created_by
            )
            VALUES(
              $1,$2,$3,NULL,$4,'RECEIPT',
              $5,$6,$7,'GOODS_RECEIPT',$8,$9
            )
          `,
          [
            receipt.business_id,
            receipt.warehouse_id,
            item.product_id,
            buffer.id,
            qty,
            lot,
            serial,
            receipt.id,
            req.user.id,
          ],
        );
      }

      const completed = (
        await db.query(
          `
            UPDATE goods_receipts
            SET
              status='COMPLETED',
              completed_at=now()
            WHERE id=$1
            RETURNING *
          `,
          [receipt.id],
        )
      ).rows[0];

      await audit(
        db,
        req.user,
        'GOODS_RECEIPT_COMPLETED',
        'goods_receipt',
        receipt.id,
        receipt.business_id,
        {
          warehouse_id: receipt.warehouse_id,
          buffer_location_id: buffer.id,
          item_count: items.length,
        },
      );

      return completed;
    });

    res.json(result);
  },
);

/* ==========================================================
   TASLAK İPTAL
   TAMAMLANMIŞ KAYIT SİLİNMEZ / İPTAL EDİLMEZ.
   ========================================================== */

operations.post(
  '/goods-receipts/:id/cancel',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    await transaction(async (db) => {
      const receipt = await receiptForUser(
        req.user,
        String(req.params.id),
        db,
        true,
      );

      assert(
        receipt.status === 'DRAFT',
        409,
        'Yalnızca taslak mal kabul iptal edilebilir.',
      );

      await db.query(
        `
          UPDATE goods_receipts
          SET status='CANCELLED'
          WHERE id=$1
        `,
        [receipt.id],
      );

      await audit(
        db,
        req.user,
        'GOODS_RECEIPT_CANCELLED',
        'goods_receipt',
        receipt.id,
        receipt.business_id,
      );
    });

    res.json({ ok: true });
  },
);
/* ==========================================================
   PUT-AWAY / RAFA YERLEŞTİRME

   BUFFER -> RACK / FLOOR / BIN
   ========================================================== */

operations.get(
  '/put-away/pending',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          s.id AS stock_id,
          s.product_id,
          s.location_id AS source_location_id,
          s.physical,
          s.reserved,
          s.damaged,
          s.returned,
          s.lot,
          s.serial,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          l.name AS source_location_name,
          l.code AS source_location_code,

          w.id AS warehouse_id,
          w.name AS warehouse_name,
          w.business_id,

          GREATEST(
            s.physical -
            s.reserved -
            s.damaged,
            0
          ) AS available_quantity

        FROM stocks s

        JOIN products p
          ON p.id=s.product_id

        JOIN locations l
          ON l.id=s.location_id

        JOIN warehouses w
          ON w.id=l.warehouse_id

        WHERE l.kind='BUFFER'

          AND GREATEST(
            s.physical -
            s.reserved -
            s.damaged,
            0
          ) > 0

          AND (
            $1::boolean
            OR w.business_id=$2
          )

        ORDER BY
          w.name,
          p.name,
          s.lot,
          s.serial
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.get(
  '/put-away/history',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          pa.*,

          p.name AS product_name,
          p.sku,
          p.barcode,

          src.name AS source_location_name,
          dst.name AS destination_location_name,

          w.name AS warehouse_name,

          u.name AS created_by_name

        FROM put_away_operations pa

        JOIN products p
          ON p.id=pa.product_id

        JOIN locations src
          ON src.id=pa.source_location_id

        JOIN locations dst
          ON dst.id=pa.destination_location_id

        JOIN warehouses w
          ON w.id=pa.warehouse_id

        JOIN users u
          ON u.id=pa.created_by

        WHERE (
          $1::boolean
          OR pa.business_id=$2
        )

        ORDER BY pa.created_at DESC

        LIMIT 100
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.post(
  '/put-away',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      source_stock_id: z.uuid(),
      destination_location_id: z.uuid(),

      quantity: z.coerce
        .number()
        .positive()
        .max(999999999)
        .multipleOf(0.001),
    }).parse(req.body);

    const result = await transaction(async (db) => {

      /*
       * Kaynak stok satırını transaction içinde kilitliyoruz.
       */
      const sourceResult = await db.query(
        `
          SELECT
            s.*,

            p.business_id AS product_business_id,

            l.kind AS source_kind,
            l.warehouse_id,

            w.business_id

          FROM stocks s

          JOIN products p
            ON p.id=s.product_id

          JOIN locations l
            ON l.id=s.location_id

          JOIN warehouses w
            ON w.id=l.warehouse_id

          WHERE s.id=$1

          FOR UPDATE OF s
        `,
        [body.source_stock_id],
      );

      assert(
        sourceResult.rowCount,
        404,
        'BUFFER stoğu bulunamadı.',
      );

      const source = sourceResult.rows[0];

      tenant(
        req.user,
        source.business_id,
      );

      assert(
        source.product_business_id ===
          source.business_id,
        400,
        'Ürün ve depo işletmesi eşleşmiyor.',
      );

      assert(
        source.source_kind === 'BUFFER',
        400,
        'Rafa yerleştirme yalnızca BUFFER / Kabul Alanı stoğundan yapılabilir.',
      );


      /*
       * Hedef lokasyon.
       */
      const destinationResult =
        await db.query(
          `
            SELECT
              l.*,
              w.business_id

            FROM locations l

            JOIN warehouses w
              ON w.id=l.warehouse_id

            WHERE l.id=$1

            FOR SHARE
          `,
          [
            body.destination_location_id,
          ],
        );

      assert(
        destinationResult.rowCount,
        404,
        'Hedef lokasyon bulunamadı.',
      );

      const destination =
        destinationResult.rows[0];

      assert(
        destination.business_id ===
          source.business_id,
        400,
        'Hedef lokasyon başka işletmeye ait.',
      );

      assert(
        destination.warehouse_id ===
          source.warehouse_id,
        400,
        'Rafa yerleştirme aynı depo içinde yapılmalıdır.',
      );

      assert(
        ['RACK', 'FLOOR', 'BIN'].includes(
          destination.kind,
        ),
        400,
        'Hedef yalnızca Raf, Kat veya Hücre olabilir.',
      );

      assert(
        destination.id !== source.location_id,
        400,
        'Kaynak ve hedef lokasyon aynı olamaz.',
      );


      /*
       * Kullanılabilir miktar:
       * fiziksel - rezerve - hasarlı
       *
       * Hasarlı ürünler normal rafa taşınmaz.
       */
      const available =
        Number(source.physical) -
        Number(source.reserved) -
        Number(source.damaged);

      assert(
        available > 0,
        409,
        'Bu BUFFER stoğunda yerleştirilebilir ürün yok.',
      );

      assert(
        Number(body.quantity) <= available,
        409,
        `En fazla ${available} adet yerleştirilebilir.`,
      );


      const lot = source.lot || '';
      const serial = source.serial || '';
      const quantity =
        Number(body.quantity);


      /*
       * Aynı hedef ürün/lot/seri için
       * eş zamanlı işlem güvenliği.
       */
      await db.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext($1)
          )
        `,
        [
          [
            source.product_id,
            destination.id,
            lot,
            serial,
          ].join('|'),
        ],
      );


      /*
       * Hedefte mevcut stok var mı?
       */
      const targetResult = await db.query(
        `
          SELECT *
          FROM stocks

          WHERE product_id=$1
            AND location_id=$2
            AND lot=$3
            AND serial=$4

          FOR UPDATE
        `,
        [
          source.product_id,
          destination.id,
          lot,
          serial,
        ],
      );


      if (targetResult.rowCount) {

        await db.query(
          `
            UPDATE stocks
            SET physical=physical+$1
            WHERE id=$2
          `,
          [
            quantity,
            targetResult.rows[0].id,
          ],
        );

      } else {

        await db.query(
          `
            INSERT INTO stocks(
              product_id,
              location_id,
              physical,
              reserved,
              damaged,
              returned,
              lot,
              serial
            )
            VALUES(
              $1,$2,$3,0,0,0,$4,$5
            )
          `,
          [
            source.product_id,
            destination.id,
            quantity,
            lot,
            serial,
          ],
        );
      }


      /*
       * BUFFER miktarını azalt.
       */
      await db.query(
        `
          UPDATE stocks
          SET physical=physical-$1
          WHERE id=$2
        `,
        [
          quantity,
          source.id,
        ],
      );


      /*
       * PUTAWAY operasyon kaydı.
       */
      const putAway = (
        await db.query(
          `
            INSERT INTO put_away_operations(
              business_id,
              warehouse_id,
              source_location_id,
              destination_location_id,
              product_id,
              quantity,
              lot,
              serial,
              created_by
            )

            VALUES(
              $1,$2,$3,$4,$5,$6,$7,$8,$9
            )

            RETURNING *
          `,
          [
            source.business_id,
            source.warehouse_id,
            source.location_id,
            destination.id,
            source.product_id,
            quantity,
            lot,
            serial,
            req.user.id,
          ],
        )
      ).rows[0];


      /*
       * Genel stok hareket defteri.
       */
      await db.query(
        `
          INSERT INTO stock_movements(
            business_id,
            warehouse_id,
            product_id,
            from_location_id,
            to_location_id,
            movement_type,
            quantity,
            lot,
            serial,
            reference_type,
            reference_id,
            created_by
          )

          VALUES(
            $1,$2,$3,$4,$5,
            'PUTAWAY',
            $6,$7,$8,
            'PUT_AWAY',
            $9,$10
          )
        `,
        [
          source.business_id,
          source.warehouse_id,
          source.product_id,
          source.location_id,
          destination.id,
          quantity,
          lot,
          serial,
          putAway.id,
          req.user.id,
        ],
      );


      /*
       * Audit.
       */
      await audit(
        db,
        req.user,
        'PUT_AWAY_COMPLETED',
        'put_away',
        putAway.id,
        source.business_id,
        {
          product_id:
            source.product_id,

          warehouse_id:
            source.warehouse_id,

          source_location_id:
            source.location_id,

          destination_location_id:
            destination.id,

          quantity,
          lot,
          serial,
        },
      );


      return {
        ...putAway,

        source_remaining:
          Number(source.physical) -
          quantity,
      };
    });

    res.status(201).json(result);
  },
);
/* ==========================================================
   INTERNAL TRANSFER / DEPO İÇİ TRANSFER

   RACK / FLOOR / BIN
        ->
   RACK / FLOOR / BIN

   Aynı depo içerisinde çalışır.
   Lot ve seri bilgisi korunur.
   ========================================================== */

operations.get(
  '/internal-transfers/sources',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          s.id AS stock_id,
          s.product_id,
          s.location_id AS source_location_id,

          s.physical,
          s.reserved,
          s.damaged,
          s.returned,

          s.lot,
          s.serial,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          l.name AS source_location_name,
          l.code AS source_location_code,
          l.kind AS source_location_kind,

          w.id AS warehouse_id,
          w.name AS warehouse_name,
          w.business_id,

          GREATEST(
            s.physical -
            s.reserved -
            s.damaged,
            0
          ) AS available_quantity

        FROM stocks s

        JOIN products p
          ON p.id = s.product_id

        JOIN locations l
          ON l.id = s.location_id

        JOIN warehouses w
          ON w.id = l.warehouse_id

        WHERE l.kind IN (
          'RACK',
          'FLOOR',
          'BIN'
        )

        AND GREATEST(
          s.physical -
          s.reserved -
          s.damaged,
          0
        ) > 0

        AND (
          $1::boolean
          OR w.business_id = $2
        )

        ORDER BY
          w.name,
          l.name,
          p.name,
          s.lot,
          s.serial
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.get(
  '/internal-transfers/history',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          t.*,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          src.name AS source_location_name,
          src.code AS source_location_code,

          dst.name AS destination_location_name,
          dst.code AS destination_location_code,

          w.name AS warehouse_name,

          u.name AS created_by_name

        FROM internal_transfer_operations t

        JOIN products p
          ON p.id = t.product_id

        JOIN locations src
          ON src.id = t.source_location_id

        JOIN locations dst
          ON dst.id = t.destination_location_id

        JOIN warehouses w
          ON w.id = t.warehouse_id

        JOIN users u
          ON u.id = t.created_by

        WHERE (
          $1::boolean
          OR t.business_id = $2
        )

        ORDER BY t.created_at DESC

        LIMIT 100
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.post(
  '/internal-transfers',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      source_stock_id: z.uuid(),

      destination_location_id:
        z.uuid(),

      quantity: z.coerce
        .number()
        .positive()
        .max(999999999)
        .multipleOf(0.001),
    }).parse(req.body);


    const result =
      await transaction(
        async (db) => {

          /*
           * Kaynak stoğu kilitle.
           */
          const sourceResult =
            await db.query(
              `
                SELECT
                  s.*,

                  p.business_id
                    AS product_business_id,

                  l.kind
                    AS source_kind,

                  l.warehouse_id,

                  w.business_id

                FROM stocks s

                JOIN products p
                  ON p.id =
                     s.product_id

                JOIN locations l
                  ON l.id =
                     s.location_id

                JOIN warehouses w
                  ON w.id =
                     l.warehouse_id

                WHERE s.id = $1

                FOR UPDATE OF s
              `,
              [
                body.source_stock_id,
              ],
            );


          assert(
            sourceResult.rowCount,
            404,
            'Kaynak stok bulunamadı.',
          );


          const source =
            sourceResult.rows[0];


          tenant(
            req.user,
            source.business_id,
          );


          assert(
            source.product_business_id ===
              source.business_id,
            400,
            'Ürün ve depo işletmesi eşleşmiyor.',
          );


          assert(
            [
              'RACK',
              'FLOOR',
              'BIN',
            ].includes(
              source.source_kind,
            ),
            400,
            'Depo içi transfer yalnızca Raf, Kat veya Hücre stoklarından yapılabilir.',
          );


          /*
           * Hedef lokasyonu kilitlemeden
           * doğrula.
           */
          const destinationResult =
            await db.query(
              `
                SELECT
                  l.*,
                  w.business_id

                FROM locations l

                JOIN warehouses w
                  ON w.id =
                     l.warehouse_id

                WHERE l.id = $1

                FOR SHARE
              `,
              [
                body.destination_location_id,
              ],
            );


          assert(
            destinationResult.rowCount,
            404,
            'Hedef lokasyon bulunamadı.',
          );


          const destination =
            destinationResult.rows[0];


          assert(
            destination.business_id ===
              source.business_id,
            400,
            'Hedef lokasyon başka işletmeye ait.',
          );


          assert(
            destination.warehouse_id ===
              source.warehouse_id,
            400,
            'Depo içi transfer yalnızca aynı depo içerisinde yapılabilir.',
          );


          assert(
            [
              'RACK',
              'FLOOR',
              'BIN',
            ].includes(
              destination.kind,
            ),
            400,
            'Hedef yalnızca Raf, Kat veya Hücre olabilir.',
          );


          assert(
            destination.id !==
              source.location_id,
            400,
            'Kaynak ve hedef lokasyon aynı olamaz.',
          );


          /*
           * Normal taşınabilir stok:
           *
           * physical
           * - reserved
           * - damaged
           */
          const available =
            Number(
              source.physical,
            ) -
            Number(
              source.reserved,
            ) -
            Number(
              source.damaged,
            );


          assert(
            available > 0,
            409,
            'Kaynak lokasyonda taşınabilir stok bulunmuyor.',
          );


          assert(
            Number(
              body.quantity,
            ) <= available,
            409,
            `En fazla ${available} adet transfer edilebilir.`,
          );


          const quantity =
            Number(
              body.quantity,
            );


          const lot =
            source.lot || '';


          const serial =
            source.serial || '';


          /*
           * Aynı ürün + hedef + lot + seri
           * için eşzamanlı işlem kilidi.
           */
          await db.query(
            `
              SELECT
                pg_advisory_xact_lock(
                  hashtext($1)
                )
            `,
            [
              [
                source.product_id,
                destination.id,
                lot,
                serial,
              ].join('|'),
            ],
          );


          /*
           * Hedefte aynı stok
           * mevcut mu?
           */
          const targetResult =
            await db.query(
              `
                SELECT *
                FROM stocks

                WHERE product_id = $1
                  AND location_id = $2
                  AND lot = $3
                  AND serial = $4

                FOR UPDATE
              `,
              [
                source.product_id,
                destination.id,
                lot,
                serial,
              ],
            );


          if (
            targetResult.rowCount
          ) {

            await db.query(
              `
                UPDATE stocks

                SET physical =
                    physical + $1

                WHERE id = $2
              `,
              [
                quantity,
                targetResult
                  .rows[0]
                  .id,
              ],
            );

          } else {

            await db.query(
              `
                INSERT INTO stocks(
                  product_id,
                  location_id,
                  physical,
                  reserved,
                  damaged,
                  returned,
                  lot,
                  serial
                )

                VALUES(
                  $1,
                  $2,
                  $3,
                  0,
                  0,
                  0,
                  $4,
                  $5
                )
              `,
              [
                source.product_id,
                destination.id,
                quantity,
                lot,
                serial,
              ],
            );
          }


          /*
           * Kaynaktan miktarı düş.
           */
          await db.query(
            `
              UPDATE stocks

              SET physical =
                  physical - $1

              WHERE id = $2
            `,
            [
              quantity,
              source.id,
            ],
          );


          /*
           * Operasyon kaydı.
           */
          const transfer =
            (
              await db.query(
                `
                  INSERT INTO
                    internal_transfer_operations(
                      business_id,
                      warehouse_id,

                      source_location_id,
                      destination_location_id,

                      product_id,

                      quantity,

                      lot,
                      serial,

                      created_by
                    )

                  VALUES(
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9
                  )

                  RETURNING *
                `,
                [
                  source.business_id,
                  source.warehouse_id,

                  source.location_id,
                  destination.id,

                  source.product_id,

                  quantity,

                  lot,
                  serial,

                  req.user.id,
                ],
              )
            ).rows[0];


          /*
           * Genel stok hareket defteri.
           */
          await db.query(
            `
              INSERT INTO stock_movements(
                business_id,
                warehouse_id,
                product_id,

                from_location_id,
                to_location_id,

                movement_type,
                quantity,

                lot,
                serial,

                reference_type,
                reference_id,

                created_by
              )

              VALUES(
                $1,
                $2,
                $3,

                $4,
                $5,

                'TRANSFER',
                $6,

                $7,
                $8,

                'INTERNAL_TRANSFER',
                $9,

                $10
              )
            `,
            [
              source.business_id,
              source.warehouse_id,
              source.product_id,

              source.location_id,
              destination.id,

              quantity,

              lot,
              serial,

              transfer.id,

              req.user.id,
            ],
          );


          /*
           * Audit log.
           */
          await audit(
            db,
            req.user,

            'INTERNAL_TRANSFER_COMPLETED',

            'internal_transfer',

            transfer.id,

            source.business_id,

            {
              warehouse_id:
                source.warehouse_id,

              product_id:
                source.product_id,

              source_location_id:
                source.location_id,

              destination_location_id:
                destination.id,

              quantity,

              lot,

              serial,
            },
          );


          return {
            ...transfer,

            source_remaining:
              Number(
                source.physical,
              ) -
              quantity,
          };
        },
      );


    res
      .status(201)
      .json(result);
  },
);
/* ==========================================================
   SHIPMENT / MAL ÇIKIŞI

   Kaynak:
   RACK / FLOOR / BIN

   Stoktan fiziksel çıkış yapar.
   Reserved ve damaged miktarı kullandırmaz.
   ========================================================== */

operations.get(
  '/shipments/sources',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          s.id AS stock_id,
          s.product_id,
          s.location_id AS source_location_id,

          s.physical,
          s.reserved,
          s.damaged,
          s.returned,

          s.lot,
          s.serial,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          l.name AS source_location_name,
          l.code AS source_location_code,
          l.kind AS source_location_kind,

          w.id AS warehouse_id,
          w.name AS warehouse_name,
          w.business_id,

          GREATEST(
            s.physical -
            s.reserved -
            s.damaged,
            0
          ) AS available_quantity

        FROM stocks s

        JOIN products p
          ON p.id = s.product_id

        JOIN locations l
          ON l.id = s.location_id

        JOIN warehouses w
          ON w.id = l.warehouse_id

        WHERE l.kind IN (
          'RACK',
          'FLOOR',
          'BIN'
        )

        AND GREATEST(
          s.physical -
          s.reserved -
          s.damaged,
          0
        ) > 0

        AND (
          $1::boolean
          OR w.business_id = $2
        )

        ORDER BY
          w.name,
          l.name,
          p.name,
          s.lot,
          s.serial
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.get(
  '/shipments/history',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          sh.*,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          l.name AS source_location_name,
          l.code AS source_location_code,

          w.name AS warehouse_name,

          u.name AS created_by_name

        FROM shipment_operations sh

        JOIN products p
          ON p.id = sh.product_id

        JOIN locations l
          ON l.id = sh.source_location_id

        JOIN warehouses w
          ON w.id = sh.warehouse_id

        JOIN users u
          ON u.id = sh.created_by

        WHERE (
          $1::boolean
          OR sh.business_id = $2
        )

        ORDER BY sh.created_at DESC

        LIMIT 100
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.post(
  '/shipments',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      source_stock_id: z.uuid(),

      quantity: z.coerce
        .number()
        .positive()
        .max(999999999)
        .multipleOf(0.001),

      customer: z.string()
        .trim()
        .max(200)
        .default(''),

      document_number: z.string()
        .trim()
        .max(100)
        .default(''),

      note: z.string()
        .trim()
        .max(1000)
        .default(''),
    }).parse(req.body);


    const result = await transaction(
      async (db) => {

        /*
         * Kaynak stok satırını kilitle.
         */
        const sourceResult =
          await db.query(
            `
              SELECT
                s.*,

                p.business_id
                  AS product_business_id,

                l.kind
                  AS source_kind,

                l.warehouse_id,

                w.business_id

              FROM stocks s

              JOIN products p
                ON p.id = s.product_id

              JOIN locations l
                ON l.id = s.location_id

              JOIN warehouses w
                ON w.id = l.warehouse_id

              WHERE s.id = $1

              FOR UPDATE OF s
            `,
            [
              body.source_stock_id,
            ],
          );


        assert(
          sourceResult.rowCount,
          404,
          'Sevkiyat kaynağı bulunamadı.',
        );


        const source =
          sourceResult.rows[0];


        tenant(
          req.user,
          source.business_id,
        );


        assert(
          source.product_business_id ===
            source.business_id,
          400,
          'Ürün ve depo işletmesi eşleşmiyor.',
        );


        assert(
          [
            'RACK',
            'FLOOR',
            'BIN',
          ].includes(
            source.source_kind,
          ),
          400,
          'Sevkiyat yalnızca Raf, Kat veya Hücre stoklarından yapılabilir.',
        );


        /*
         * Sevk edilebilir miktar.
         *
         * Rezerve ve hasarlı stok
         * normal çıkışta kullanılamaz.
         */
        const available =
          Number(
            source.physical,
          ) -
          Number(
            source.reserved,
          ) -
          Number(
            source.damaged,
          );


        assert(
          available > 0,
          409,
          'Bu stokta sevk edilebilir miktar bulunmuyor.',
        );


        assert(
          Number(
            body.quantity,
          ) <= available,
          409,
          `En fazla ${available} adet sevk edilebilir.`,
        );


        const quantity =
          Number(
            body.quantity,
          );


        const lot =
          source.lot || '';


        const serial =
          source.serial || '';


        /*
         * Stok satırı zaten FOR UPDATE ile
         * kilitli olduğu için eş zamanlı
         * ikinci çıkış aynı fiziksel miktarı
         * kullanamaz.
         */
        await db.query(
          `
            UPDATE stocks

            SET physical =
              physical - $1

            WHERE id = $2
          `,
          [
            quantity,
            source.id,
          ],
        );


        /*
         * Sevkiyat operasyon kaydı.
         */
        const shipment =
          (
            await db.query(
              `
                INSERT INTO shipment_operations(
                  business_id,
                  warehouse_id,

                  source_location_id,
                  product_id,

                  quantity,

                  lot,
                  serial,

                  customer,
                  document_number,
                  note,

                  created_by
                )

                VALUES(
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9,
                  $10,
                  $11
                )

                RETURNING *
              `,
              [
                source.business_id,
                source.warehouse_id,

                source.location_id,
                source.product_id,

                quantity,

                lot,
                serial,

                body.customer,
                body.document_number,
                body.note,

                req.user.id,
              ],
            )
          ).rows[0];


        /*
         * Genel stok hareket defteri.
         */
        await db.query(
          `
            INSERT INTO stock_movements(
              business_id,
              warehouse_id,
              product_id,

              from_location_id,
              to_location_id,

              movement_type,
              quantity,

              lot,
              serial,

              reference_type,
              reference_id,

              created_by
            )

            VALUES(
              $1,
              $2,
              $3,

              $4,
              NULL,

              'SHIPMENT',
              $5,

              $6,
              $7,

              'SHIPMENT',
              $8,

              $9
            )
          `,
          [
            source.business_id,
            source.warehouse_id,
            source.product_id,

            source.location_id,

            quantity,

            lot,
            serial,

            shipment.id,

            req.user.id,
          ],
        );


        /*
         * Audit.
         */
        await audit(
          db,
          req.user,

          'SHIPMENT_COMPLETED',

          'shipment',

          shipment.id,

          source.business_id,

          {
            warehouse_id:
              source.warehouse_id,

            product_id:
              source.product_id,

            source_location_id:
              source.location_id,

            quantity,

            lot,
            serial,

            customer:
              body.customer,

            document_number:
              body.document_number,
          },
        );


        return {
          ...shipment,

          source_remaining:
            Number(
              source.physical,
            ) -
            quantity,
        };
      },
    );


    res
      .status(201)
      .json(result);
  },
);


/* ==========================================================
   DEPOLAR ARASI TRANSFER
   ========================================================== */

operations.get(
  '/warehouse-transfers/sources',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        s.id AS stock_id,
        s.product_id,
        s.location_id AS source_location_id,
        s.physical,
        s.reserved,
        s.damaged,
        s.returned,
        s.lot,
        s.serial,

        p.name AS product_name,
        p.sku,
        p.barcode,
        p.variant,

        l.name AS source_location_name,
        l.code AS source_location_code,
        l.kind AS source_location_kind,

        w.id AS warehouse_id,
        w.name AS warehouse_name,
        w.business_id,

        GREATEST(
          COALESCE(s.physical,0)
          - COALESCE(s.reserved,0)
          - COALESCE(s.damaged,0),
          0
        ) AS available_quantity

      FROM stocks s
      JOIN products p ON p.id=s.product_id
      JOIN locations l ON l.id=s.location_id
      JOIN warehouses w ON w.id=l.warehouse_id

      WHERE
        l.kind IN ('RACK','FLOOR','BIN')
        AND (
          $1::boolean
          OR w.business_id=$2
        )
        AND (
          COALESCE(s.physical,0)
          - COALESCE(s.reserved,0)
          - COALESCE(s.damaged,0)
        ) > 0

      ORDER BY
        w.name,
        l.name,
        p.name
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);

operations.get(
  '/warehouse-transfers/warehouses',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT id,name,business_id
      FROM warehouses
      WHERE (
        $1::boolean
        OR business_id=$2
      )
      ORDER BY name
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);

operations.get(
  '/warehouse-transfers/locations/:warehouseId',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        l.id,
        l.warehouse_id,
        l.name,
        l.code,
        l.kind
      FROM locations l
      JOIN warehouses w
        ON w.id=l.warehouse_id
      WHERE
        l.warehouse_id=$1
        AND l.kind='BUFFER'
        AND (
          $2::boolean
          OR w.business_id=$3
        )
      ORDER BY l.name
      `,
      [
        req.params.warehouseId,
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);

operations.get(
  '/warehouse-transfers/history',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        t.*,

        p.name AS product_name,
        p.sku,
        p.barcode,

        sw.name AS source_warehouse_name,
        dw.name AS destination_warehouse_name,

        sl.name AS source_location_name,
        dl.name AS destination_location_name,

        cu.name AS created_by_name,
        su.name AS shipped_by_name,
        ru.name AS received_by_name

      FROM warehouse_transfers t

      JOIN products p
        ON p.id=t.product_id

      JOIN warehouses sw
        ON sw.id=t.source_warehouse_id

      JOIN warehouses dw
        ON dw.id=t.destination_warehouse_id

      JOIN locations sl
        ON sl.id=t.source_location_id

      JOIN locations dl
        ON dl.id=t.destination_location_id

      JOIN users cu
        ON cu.id=t.created_by

      LEFT JOIN users su
        ON su.id=t.shipped_by

      LEFT JOIN users ru
        ON ru.id=t.received_by

      WHERE (
        $1::boolean
        OR t.business_id=$2
      )

      ORDER BY t.created_at DESC
      LIMIT 100
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);

operations.post(
  '/warehouse-transfers',
  requirePermission('depo_operasyon'),
  async (req, res) => {

    const body = z.object({
      source_stock_id:
        z.uuid(),

      destination_warehouse_id:
        z.uuid(),

      destination_location_id:
        z.uuid(),

      quantity:
        z.coerce
          .number()
          .positive()
          .max(999999999)
          .multipleOf(0.001),

      note:
        z.string()
          .trim()
          .max(1000)
          .default(''),
    }).parse(req.body);

    const result = await transaction(
      async (db) => {

        const sourceResult =
          await db.query(
            `
            SELECT
              s.*,
              l.warehouse_id,
              l.kind AS source_kind,
              w.business_id

            FROM stocks s

            JOIN locations l
              ON l.id=s.location_id

            JOIN warehouses w
              ON w.id=l.warehouse_id

            WHERE s.id=$1
            FOR UPDATE OF s
            `,
            [body.source_stock_id],
          );

        assert(
          sourceResult.rowCount,
          404,
          'Kaynak stok bulunamad?.',
        );

        const source =
          sourceResult.rows[0];

        assert(
          req.user.role === 'SUPER_ADMIN' ||
          source.business_id === req.user.business_id,
          403,
          'Bu sto?a eri?emezsiniz.',
        );

        assert(
          ['RACK','FLOOR','BIN']
            .includes(source.source_kind),
          409,
          'Kaynak ?r?n ?nce rafa yerle?tirilmelidir.',
        );

        assert(
          source.warehouse_id !==
            body.destination_warehouse_id,
          409,
          'Kaynak ve hedef depo ayn? olamaz.',
        );

        const targetResult =
          await db.query(
            `
            SELECT
              l.*,
              w.business_id
            FROM locations l

            JOIN warehouses w
              ON w.id=l.warehouse_id

            WHERE
              l.id=$1
              AND l.warehouse_id=$2

            FOR SHARE
            `,
            [
              body.destination_location_id,
              body.destination_warehouse_id,
            ],
          );

        assert(
          targetResult.rowCount,
          404,
          'Hedef kabul alan? bulunamad?.',
        );

        const target =
          targetResult.rows[0];

        assert(
          target.kind === 'BUFFER',
          409,
          'Hedef lokasyon BUFFER olmal?d?r.',
        );

        assert(
          source.business_id ===
            target.business_id,
          409,
          'Farkl? firmalar aras?nda depo transferi yap?lamaz.',
        );

        const available =
          Number(source.physical || 0)
          - Number(source.reserved || 0)
          - Number(source.damaged || 0);

        assert(
          body.quantity <= available,
          409,
          `En fazla ${available} adet transfer edilebilir.`,
        );

        const transfer =
          (
            await db.query(
              `
              INSERT INTO warehouse_transfers(
                business_id,
                source_warehouse_id,
                destination_warehouse_id,
                source_location_id,
                destination_location_id,
                product_id,
                source_stock_id,
                quantity,
                lot,
                serial,
                status,
                note,
                created_by
              )
              VALUES(
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                'DRAFT',$11,$12
              )
              RETURNING *
              `,
              [
                source.business_id,
                source.warehouse_id,
                body.destination_warehouse_id,
                source.location_id,
                body.destination_location_id,
                source.product_id,
                source.id,
                body.quantity,
                source.lot,
                source.serial,
                body.note,
                req.user.id,
              ],
            )
          ).rows[0];

        return transfer;
      },
    );

    res.status(201).json(result);
  },
);

operations.post(
  '/warehouse-transfers/:id/ship',
  requirePermission('depo_operasyon'),
  async (req, res) => {

    const result = await transaction(
      async (db) => {

        const trResult =
          await db.query(
            `
            SELECT *
            FROM warehouse_transfers
            WHERE id=$1
            FOR UPDATE
            `,
            [req.params.id],
          );

        assert(
          trResult.rowCount,
          404,
          'Transfer bulunamad?.',
        );

        const tr =
          trResult.rows[0];

        assert(
          req.user.role === 'SUPER_ADMIN' ||
          tr.business_id === req.user.business_id,
          403,
          'Bu transfere eri?emezsiniz.',
        );

        assert(
          tr.status === 'DRAFT',
          409,
          'Yaln?z taslak transfer sevk edilebilir.',
        );

        const sourceResult =
          await db.query(
            `
            SELECT *
            FROM stocks
            WHERE id=$1
            FOR UPDATE
            `,
            [tr.source_stock_id],
          );

        assert(
          sourceResult.rowCount,
          404,
          'Kaynak stok bulunamad?.',
        );

        const source =
          sourceResult.rows[0];

        const available =
          Number(source.physical || 0)
          - Number(source.reserved || 0)
          - Number(source.damaged || 0);

        assert(
          Number(tr.quantity) <= available,
          409,
          'Kaynak stok sevkiyat i?in yetersiz.',
        );

        await db.query(
          `
          UPDATE stocks
          SET physical =
            physical - $1
          WHERE id=$2
          `,
          [
            tr.quantity,
            tr.source_stock_id,
          ],
        );

        return (
          await db.query(
            `
            UPDATE warehouse_transfers
            SET
              status='SHIPPED',
              shipped_by=$1,
              shipped_at=now()
            WHERE id=$2
            RETURNING *
            `,
            [
              req.user.id,
              tr.id,
            ],
          )
        ).rows[0];
      },
    );

    res.json(result);
  },
);

operations.post(
  '/warehouse-transfers/:id/receive',
  requirePermission('depo_operasyon'),
  async (req, res) => {

    const body = z.object({
      received_quantity:
        z.coerce
          .number()
          .nonnegative()
          .multipleOf(0.001),

      damaged_quantity:
        z.coerce
          .number()
          .nonnegative()
          .multipleOf(0.001)
          .default(0),
    }).parse(req.body);

    const result = await transaction(
      async (db) => {

        const trResult =
          await db.query(
            `
            SELECT *
            FROM warehouse_transfers
            WHERE id=$1
            FOR UPDATE
            `,
            [req.params.id],
          );

        assert(
          trResult.rowCount,
          404,
          'Transfer bulunamad?.',
        );

        const tr =
          trResult.rows[0];

        assert(
          req.user.role === 'SUPER_ADMIN' ||
          tr.business_id === req.user.business_id,
          403,
          'Bu transfere eri?emezsiniz.',
        );

        assert(
          ['SHIPPED','PARTIAL']
            .includes(tr.status),
          409,
          'Bu transfer teslim al?namaz.',
        );

        const alreadyReceived =
          Number(tr.received_quantity || 0);

        const alreadyDamaged =
          Number(tr.damaged_quantity || 0);

        const normal =
          Number(body.received_quantity);

        const damaged =
          Number(body.damaged_quantity);

        const remaining =
          Number(tr.quantity)
          - alreadyReceived
          - alreadyDamaged;

        assert(
          normal + damaged > 0,
          409,
          'Teslim miktar? s?f?r olamaz.',
        );

        assert(
          normal + damaged <= remaining,
          409,
          `En fazla ${remaining} adet teslim al?nabilir.`,
        );

        const destinationStock =
          await db.query(
            `
            SELECT *
            FROM stocks
            WHERE
              product_id=$1
              AND location_id=$2
              AND COALESCE(lot,'') =
                  COALESCE($3,'')
              AND COALESCE(serial,'') =
                  COALESCE($4,'')
            FOR UPDATE
            `,
            [
              tr.product_id,
              tr.destination_location_id,
              tr.lot,
              tr.serial,
            ],
          );

        const physicalIncrease =
          normal + damaged;

        if (destinationStock.rowCount) {

          await db.query(
            `
            UPDATE stocks
            SET
              physical =
                physical + $1,
              damaged =
                damaged + $2
            WHERE id=$3
            `,
            [
              physicalIncrease,
              damaged,
              destinationStock.rows[0].id,
            ],
          );

        } else {

          await db.query(
            `
            INSERT INTO stocks(
              product_id,
              location_id,
              physical,
              reserved,
              damaged,
              returned,
              lot,
              serial
            )
            VALUES(
              $1,$2,$3,0,$4,0,$5,$6
            )
            `,
            [
              tr.product_id,
              tr.destination_location_id,
              physicalIncrease,
              damaged,
              tr.lot,
              tr.serial,
            ],
          );
        }

        const newReceived =
          alreadyReceived + normal;

        const newDamaged =
          alreadyDamaged + damaged;

        const completed =
          newReceived + newDamaged >=
            Number(tr.quantity);

        return (
          await db.query(
            `
            UPDATE warehouse_transfers
            SET
              status=$1,
              received_quantity=$2,
              damaged_quantity=$3,
              received_by=$4,
              received_at=now()
            WHERE id=$5
            RETURNING *
            `,
            [
              completed
                ? 'RECEIVED'
                : 'PARTIAL',

              newReceived,
              newDamaged,
              req.user.id,
              tr.id,
            ],
          )
        ).rows[0];
      },
    );

    res.json(result);
  },
);


/* ==========================================================
   DAMAGE / FIRE / LOSS / QUARANTINE
   ========================================================== */

operations.get(
  '/incidents/sources',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          s.id AS stock_id,
          s.product_id,
          s.location_id AS source_location_id,

          s.physical,
          s.reserved,
          s.damaged,
          s.returned,

          s.lot,
          s.serial,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          l.name AS source_location_name,
          l.code AS source_location_code,
          l.kind AS source_location_kind,

          w.id AS warehouse_id,
          w.name AS warehouse_name,
          w.business_id,

          GREATEST(
            s.physical -
            s.reserved -
            s.damaged,
            0
          ) AS available_quantity

        FROM stocks s

        JOIN products p
          ON p.id = s.product_id

        JOIN locations l
          ON l.id = s.location_id

        JOIN warehouses w
          ON w.id = l.warehouse_id

        WHERE l.kind IN (
          'RACK',
          'FLOOR',
          'BIN',
          'BUFFER'
        )

        AND GREATEST(
          s.physical -
          s.reserved -
          s.damaged,
          0
        ) > 0

        AND (
          $1::boolean
          OR w.business_id = $2
        )

        ORDER BY
          w.name,
          l.name,
          p.name
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.get(
  '/incidents/history',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          i.*,

          p.name AS product_name,
          p.sku,
          p.barcode,
          p.variant,

          src.name AS source_location_name,
          src.code AS source_location_code,

          q.name AS quarantine_location_name,
          q.code AS quarantine_location_code,

          w.name AS warehouse_name,

          u.name AS created_by_name

        FROM stock_incidents i

        JOIN products p
          ON p.id = i.product_id

        JOIN locations src
          ON src.id = i.source_location_id

        LEFT JOIN locations q
          ON q.id = i.quarantine_location_id

        JOIN warehouses w
          ON w.id = i.warehouse_id

        JOIN users u
          ON u.id = i.created_by

        WHERE (
          $1::boolean
          OR i.business_id = $2
        )

        ORDER BY i.created_at DESC

        LIMIT 100
      `,
      [
        req.user.role === 'SUPER_ADMIN',
        req.user.business_id,
      ],
    );

    res.json(result.rows);
  },
);


operations.post(
  '/incidents',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const body = z.object({
      source_stock_id: z.uuid(),

      incident_type: z.enum([
        'DAMAGE',
        'FIRE',
        'LOSS',
      ]),

      quantity: z.coerce
        .number()
        .positive()
        .max(999999999)
        .multipleOf(0.001),

      quarantine_location_id:
        z.uuid().nullable().optional(),

      description: z.string()
        .trim()
        .max(2000)
        .default(''),

      photo_document_id:
        z.uuid().nullable().optional(),
    }).parse(req.body);


    const result = await transaction(
      async (db) => {

        const sourceResult =
          await db.query(
            `
              SELECT
                s.*,

                p.business_id
                  AS product_business_id,

                l.kind
                  AS source_kind,

                l.warehouse_id,

                w.business_id

              FROM stocks s

              JOIN products p
                ON p.id = s.product_id

              JOIN locations l
                ON l.id = s.location_id

              JOIN warehouses w
                ON w.id = l.warehouse_id

              WHERE s.id = $1

              FOR UPDATE OF s
            `,
            [
              body.source_stock_id,
            ],
          );


        assert(
          sourceResult.rowCount,
          404,
          'Kaynak stok bulunamadı.',
        );


        const source =
          sourceResult.rows[0];


        tenant(
          req.user,
          source.business_id,
        );


        assert(
          source.product_business_id ===
            source.business_id,
          400,
          'Ürün ve depo işletmesi eşleşmiyor.',
        );


        assert(
          [
            'RACK',
            'FLOOR',
            'BIN',
            'BUFFER',
          ].includes(
            source.source_kind,
          ),
          400,
          'Bu lokasyondan olay kaydı oluşturulamaz.',
        );


        const available =
          Number(source.physical) -
          Number(source.reserved) -
          Number(source.damaged);


        assert(
          available > 0,
          409,
          'İşlem yapılabilir stok bulunmuyor.',
        );


        assert(
          Number(body.quantity) <= available,
          409,
          `En fazla ${available} adet işleme alınabilir.`,
        );


        const quantity =
          Number(body.quantity);


        const lot =
          source.lot || '';


        const serial =
          source.serial || '';


        /*
         * Fotoğraf varsa:
         * - mevcut kullanıcıya ait olmalı
         * - image mime olmalı
         */
        if (body.photo_document_id) {

          const doc =
            await db.query(
              `
                SELECT *
                FROM documents
                WHERE id = $1
              `,
              [
                body.photo_document_id,
              ],
            );


          assert(
            doc.rowCount,
            400,
            'Olay fotoğrafı bulunamadı.',
          );


          assert(
            doc.rows[0].user_id ===
              req.user.id,
            403,
            'Bu belgeyi kullanamazsınız.',
          );


          assert(
            String(
              doc.rows[0].mime_type ||
              '',
            ).startsWith('image/'),
            400,
            'Olay kanıtı JPEG veya PNG fotoğraf olmalıdır.',
          );
        }


        let quarantine:
          any = null;


        /*
         * DAMAGE ve FIRE:
         * ürün fiziksel olarak karantinaya alınır.
         */
        if (
          body.incident_type ===
            'DAMAGE' ||
          body.incident_type ===
            'FIRE'
        ) {

          assert(
            body.quarantine_location_id,
            400,
            'Hasar ve yangın kayıtlarında karantina lokasyonu zorunludur.',
          );


          const qResult =
            await db.query(
              `
                SELECT
                  l.*,
                  w.business_id

                FROM locations l

                JOIN warehouses w
                  ON w.id =
                     l.warehouse_id

                WHERE l.id = $1

                FOR SHARE
              `,
              [
                body.quarantine_location_id,
              ],
            );


          assert(
            qResult.rowCount,
            404,
            'Karantina lokasyonu bulunamadı.',
          );


          quarantine =
            qResult.rows[0];


          assert(
            quarantine.kind ===
              'QUARANTINE',
            400,
            'Hedef lokasyon QUARANTINE türünde olmalıdır.',
          );


          assert(
            quarantine.warehouse_id ===
              source.warehouse_id,
            400,
            'Karantina lokasyonu aynı depoda olmalıdır.',
          );


          assert(
            quarantine.business_id ===
              source.business_id,
            400,
            'Karantina lokasyonu başka işletmeye ait.',
          );


          await db.query(
            `
              SELECT pg_advisory_xact_lock(
                hashtext($1)
              )
            `,
            [
              [
                source.product_id,
                quarantine.id,
                lot,
                serial,
              ].join('|'),
            ],
          );


          const targetResult =
            await db.query(
              `
                SELECT *
                FROM stocks

                WHERE product_id = $1
                  AND location_id = $2
                  AND lot = $3
                  AND serial = $4

                FOR UPDATE
              `,
              [
                source.product_id,
                quarantine.id,
                lot,
                serial,
              ],
            );


          if (targetResult.rowCount) {

            await db.query(
              `
                UPDATE stocks

                SET physical =
                      physical + $1,
                    damaged =
                      damaged + $1

                WHERE id = $2
              `,
              [
                quantity,
                targetResult.rows[0].id,
              ],
            );

          } else {

            await db.query(
              `
                INSERT INTO stocks(
                  product_id,
                  location_id,

                  physical,
                  reserved,
                  damaged,
                  returned,

                  lot,
                  serial
                )

                VALUES(
                  $1,
                  $2,
                  $3,
                  0,
                  $3,
                  0,
                  $4,
                  $5
                )
              `,
              [
                source.product_id,
                quarantine.id,
                quantity,
                lot,
                serial,
              ],
            );
          }
        }


        /*
         * Kaynak fiziksel stoktan düş.
         *
         * LOSS ise ürün sistemden çıkar.
         * DAMAGE/FIRE ise karantinaya geçti.
         */
        await db.query(
          `
            UPDATE stocks

            SET physical =
              physical - $1

            WHERE id = $2
          `,
          [
            quantity,
            source.id,
          ],
        );


        const incident =
          (
            await db.query(
              `
                INSERT INTO stock_incidents(
                  business_id,
                  warehouse_id,

                  source_location_id,
                  quarantine_location_id,

                  product_id,

                  incident_type,
                  quantity,

                  lot,
                  serial,

                  description,
                  photo_document_id,

                  created_by
                )

                VALUES(
                  $1,$2,$3,$4,$5,$6,
                  $7,$8,$9,$10,$11,$12
                )

                RETURNING *
              `,
              [
                source.business_id,
                source.warehouse_id,

                source.location_id,
                quarantine?.id || null,

                source.product_id,

                body.incident_type,
                quantity,

                lot,
                serial,

                body.description,
                body.photo_document_id ||
                  null,

                req.user.id,
              ],
            )
          ).rows[0];


        /*
         * Genel stok hareketi.
         *
         * LOSS -> ADJUSTMENT
         * DAMAGE/FIRE -> DAMAGE
         */
        await db.query(
          `
            INSERT INTO stock_movements(
              business_id,
              warehouse_id,
              product_id,

              from_location_id,
              to_location_id,

              movement_type,
              quantity,

              lot,
              serial,

              reference_type,
              reference_id,

              created_by
            )

            VALUES(
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,
              'STOCK_INCIDENT',
              $10,$11
            )
          `,
          [
            source.business_id,
            source.warehouse_id,
            source.product_id,

            source.location_id,
            quarantine?.id || null,

            body.incident_type ===
              'LOSS'
              ? 'ADJUSTMENT'
              : 'DAMAGE',

            quantity,

            lot,
            serial,

            incident.id,
            req.user.id,
          ],
        );


        await audit(
          db,
          req.user,

          'STOCK_INCIDENT_RECORDED',

          'stock_incident',

          incident.id,

          source.business_id,

          {
            incident_type:
              body.incident_type,

            product_id:
              source.product_id,

            warehouse_id:
              source.warehouse_id,

            source_location_id:
              source.location_id,

            quarantine_location_id:
              quarantine?.id || null,

            quantity,

            lot,
            serial,

            photo_document_id:
              body.photo_document_id ||
              null,
          },
        );


        return {
          ...incident,

          source_remaining:
            Number(source.physical) -
            quantity,
        };
      },
    );


    res
      .status(201)
      .json(result);
  },
);
/* ==========================================================
   QUARANTINE MANAGEMENT
   ========================================================== */

operations.get(
  '/quarantine/sources',
  requirePermission('depo_operasyon'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        SELECT
          s.id,
          s.product_id,
          s.location_id,
          s.physical,
          s.damaged,
          s.reserved,
          s.returned,
          s.lot,
          s.serial,
          p.sku,
          p.barcode,
          p.name AS product_name,
          l.code AS location_code,
          l.name AS location_name,
          l.kind AS location_kind,
          w.id AS warehouse_id,
          w.name AS warehouse_name
        FROM stocks s
        JOIN products p
          ON p.id = s.product_id
        JOIN locations l
          ON l.id = s.location_id
        JOIN warehouses w
          ON w.id = l.warehouse_id
        WHERE
          l.kind = 'QUARANTINE'
          AND p.business_id = $1
          AND s.physical > 0
          AND s.damaged > 0
        ORDER BY
          w.name,
          l.code,
          p.name,
          s.lot,
          s.serial
        `,
        [req.user.business_id],
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  },
);


operations.get(
  '/quarantine/history',
  requirePermission('depo_operasyon'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        SELECT
          qa.*,
          p.sku,
          p.barcode,
          p.name AS product_name,

          sl.code AS source_location_code,
          sl.name AS source_location_name,

          dl.code AS destination_location_code,
          dl.name AS destination_location_name,

          w.name AS warehouse_name,

          u.name AS created_by_name

        FROM quarantine_actions qa

        JOIN products p
          ON p.id = qa.product_id

        JOIN locations sl
          ON sl.id = qa.source_location_id

        LEFT JOIN locations dl
          ON dl.id = qa.destination_location_id

        JOIN warehouses w
          ON w.id = qa.warehouse_id

        JOIN users u
          ON u.id = qa.created_by

        WHERE qa.business_id = $1

        ORDER BY qa.created_at DESC

        LIMIT 100
        `,
        [req.user.business_id],
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  },
);


operations.post(
  '/quarantine/actions',
  requirePermission('depo_operasyon'),
  async (req, res, next) => {

    const client = await pool.connect();

    try {
      const body = req.body ?? {};

      const sourceStockId = String(body.source_stock_id ?? '');
      const actionType = String(body.action_type ?? '');
      const quantity = Number(body.quantity);
      const destinationLocationId =
        body.destination_location_id
          ? String(body.destination_location_id)
          : null;

      const reason = String(body.reason ?? '').trim();
      const note = String(body.note ?? '').trim();

      if (!sourceStockId) {
        return res.status(400).json({
          message: 'Karantina stogu secilmelidir.',
        });
      }

      if (
        !['RELEASE', 'DISPOSE', 'RETURN'].includes(actionType)
      ) {
        return res.status(400).json({
          message: 'Gecersiz karantina islemi.',
        });
      }

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        Math.round(quantity * 1000) !== quantity * 1000
      ) {
        return res.status(400).json({
          message: 'Miktar pozitif ve en fazla 3 ondalik olmalidir.',
        });
      }

      if (reason.length > 1000 || note.length > 2000) {
        return res.status(400).json({
          message: 'Aciklama cok uzun.',
        });
      }

      await client.query('BEGIN');


      // ------------------------------------------------------
      // SOURCE QUARANTINE STOCK
      // ------------------------------------------------------

      const sourceResult = await client.query(
        `
        SELECT
          s.*,
          p.business_id,
          l.warehouse_id,
          l.kind AS location_kind
        FROM stocks s
        JOIN products p
          ON p.id = s.product_id
        JOIN locations l
          ON l.id = s.location_id
        WHERE s.id = $1
        FOR UPDATE OF s
        `,
        [sourceStockId],
      );

      if (!sourceResult.rowCount) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          message: 'Karantina stogu bulunamadi.',
        });
      }

      const source = sourceResult.rows[0];

      if (source.business_id !== req.user.business_id) {
        await client.query('ROLLBACK');

        return res.status(403).json({
          message: 'Bu stok icin yetkiniz yok.',
        });
      }

      if (source.location_kind !== 'QUARANTINE') {
        await client.query('ROLLBACK');

        return res.status(400).json({
          message: 'Kaynak lokasyon karantina olmalidir.',
        });
      }

      const physical = Number(source.physical);
      const damaged = Number(source.damaged);

      if (
        quantity > physical ||
        quantity > damaged
      ) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          message: 'Karantinadaki kullanilabilir miktar yetersiz.',
        });
      }


      // ------------------------------------------------------
      // RELEASE
      // ------------------------------------------------------

      let destination = null;

      if (actionType === 'RELEASE') {

        if (!destinationLocationId) {
          await client.query('ROLLBACK');

          return res.status(400).json({
            message: 'Serbest birakmada hedef lokasyon zorunludur.',
          });
        }

        const destinationResult = await client.query(
          `
          SELECT
            l.id,
            l.warehouse_id,
            l.kind,
            w.business_id
          FROM locations l
          JOIN warehouses w
            ON w.id = l.warehouse_id
          WHERE l.id = $1
          FOR SHARE
          `,
          [destinationLocationId],
        );

        if (!destinationResult.rowCount) {
          await client.query('ROLLBACK');

          return res.status(404).json({
            message: 'Hedef lokasyon bulunamadi.',
          });
        }

        destination = destinationResult.rows[0];

        if (
          destination.business_id !== req.user.business_id ||
          destination.warehouse_id !== source.warehouse_id
        ) {
          await client.query('ROLLBACK');

          return res.status(400).json({
            message: 'Hedef ayni isletme ve depoda olmalidir.',
          });
        }

        if (
          !['RACK', 'FLOOR', 'BIN'].includes(destination.kind)
        ) {
          await client.query('ROLLBACK');

          return res.status(400).json({
            message:
              'Serbest birakma hedefi raf, zemin veya goz olmalidir.',
          });
        }

        await client.query(
          `
          SELECT pg_advisory_xact_lock(
            hashtext($1),
            hashtext($2)
          )
          `,
          [
            source.product_id,
            [
              destinationLocationId,
              source.lot ?? '',
              source.serial ?? '',
            ].join('|'),
          ],
        );

        const targetResult = await client.query(
          `
          SELECT *
          FROM stocks
          WHERE
            product_id = $1
            AND location_id = $2
            AND lot = $3
            AND serial = $4
          FOR UPDATE
          `,
          [
            source.product_id,
            destinationLocationId,
            source.lot ?? '',
            source.serial ?? '',
          ],
        );

        if (targetResult.rowCount) {
          await client.query(
            `
            UPDATE stocks
            SET physical = physical + $2
            WHERE id = $1
            `,
            [
              targetResult.rows[0].id,
              quantity,
            ],
          );
        } else {
          await client.query(
            `
            INSERT INTO stocks (
              product_id,
              location_id,
              physical,
              reserved,
              damaged,
              returned,
              lot,
              serial
            )
            VALUES (
              $1,
              $2,
              $3,
              0,
              0,
              0,
              $4,
              $5
            )
            `,
            [
              source.product_id,
              destinationLocationId,
              quantity,
              source.lot ?? '',
              source.serial ?? '',
            ],
          );
        }
      }


      // ------------------------------------------------------
      // REDUCE QUARANTINE
      // ------------------------------------------------------

      await client.query(
        `
        UPDATE stocks
        SET
          physical = physical - $2,
          damaged = damaged - $2
        WHERE id = $1
        `,
        [
          source.id,
          quantity,
        ],
      );


      // ------------------------------------------------------
      // ACTION RECORD
      // ------------------------------------------------------

      const actionResult = await client.query(
        `
        INSERT INTO quarantine_actions (
          business_id,
          warehouse_id,
          source_location_id,
          destination_location_id,
          product_id,
          action_type,
          quantity,
          lot,
          serial,
          reason,
          note,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12
        )
        RETURNING *
        `,
        [
          req.user.business_id,
          source.warehouse_id,
          source.location_id,
          destinationLocationId,
          source.product_id,
          actionType,
          quantity,
          source.lot ?? '',
          source.serial ?? '',
          reason,
          note,
          req.user.id,
        ],
      );

      const action = actionResult.rows[0];


      // ------------------------------------------------------
      // STOCK MOVEMENT
      // ------------------------------------------------------

      const movementType =
        actionType === 'RELEASE'
          ? 'QUARANTINE'
          : actionType === 'RETURN'
            ? 'SHIPMENT'
            : 'ADJUSTMENT';

      await client.query(
        `
        INSERT INTO stock_movements (
          business_id,
          warehouse_id,
          product_id,
          from_location_id,
          to_location_id,
          movement_type,
          quantity,
          lot,
          serial,
          reference_type,
          reference_id,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,
          'QUARANTINE_ACTION',
          $10,
          $11
        )
        `,
        [
          req.user.business_id,
          source.warehouse_id,
          source.product_id,
          source.location_id,
          actionType === 'RELEASE'
            ? destinationLocationId
            : null,
          movementType,
          quantity,
          source.lot ?? '',
          source.serial ?? '',
          action.id,
          req.user.id,
        ],
      );


      await audit(
        client,
        req.user,
        'QUARANTINE_ACTION_COMPLETED',
        'quarantine_actions',
        action.id,
        req.user.business_id,
        {
          action_type: actionType,
          quantity,
          source_location_id: source.location_id,
          destination_location_id: destinationLocationId,
          product_id: source.product_id,
          lot: source.lot ?? '',
          serial: source.serial ?? '',
          reason,
        },
      );


      await client.query('COMMIT');

      res.status(201).json({
        action,
        source_remaining: {
          physical: physical - quantity,
          damaged: damaged - quantity,
        },
      });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);

    } finally {
      client.release();
    }
  },
);

/* ==========================================================
   DEPO PERSONELI - ATANMIS DEPO LOKASYONLARI
   Sadece okuma. Lokasyon yonetim yetkisi vermez.
   ========================================================== */
operations.get(
  '/warehouse-operation-locations',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const params: unknown[] = [];
    let warehouseFilter = '';

    if (req.user.role === 'WAREHOUSE_STAFF') {
      params.push(req.user.id);

      warehouseFilter = `
        AND EXISTS (
          SELECT 1
          FROM user_warehouse_assignments uwa
          WHERE uwa.user_id = $1
            AND uwa.warehouse_id = w.id
        )
      `;
    } else {
      params.push(req.user.business_id);

      warehouseFilter = `
        AND w.business_id = $1
      `;
    }

    const result = await pool.query(
      `
        SELECT
          l.*,
          w.name AS warehouse_name
        FROM locations l
        JOIN warehouses w ON w.id = l.warehouse_id
        WHERE 1=1
          ${warehouseFilter}
        ORDER BY
          w.name,
          l.name
      `,
      params,
    );

    res.json(result.rows);
  },
);

/* BEDSS_WAREHOUSE_STAFF_READ_WAREHOUSES */
operations.get(
  '/warehouse-operation-warehouses',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          w.id,
          w.business_id,
          w.name,
          w.address
        FROM warehouses w
        JOIN user_warehouse_assignments uwa
          ON uwa.warehouse_id = w.id
        WHERE uwa.user_id = $1
          AND w.business_id = $2
        ORDER BY w.name
      `,
      [req.user.id, req.user.business_id],
    );

    res.json(result.rows);
  },
);

/* BEDSS_WAREHOUSE_STAFF_READ_PRODUCTS */
operations.get(
  '/warehouse-operation-products',
  requirePermission('depo_operasyon'),
  async (req, res) => {
    const result = await pool.query(
      `
        SELECT
          p.*,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', pu.id,
                  'name', pu.name,
                  'multiplier', pu.multiplier
                )
                ORDER BY pu.multiplier
              )
              FROM product_units pu
              WHERE pu.product_id = p.id
            ),
            '[]'::json
          ) AS units
        FROM products p
        WHERE p.business_id = $1
        ORDER BY p.name
      `,
      [req.user.business_id],
    );

    res.json(result.rows);
  },
);
