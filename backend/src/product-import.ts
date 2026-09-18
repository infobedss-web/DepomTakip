import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction } from './database.js';
import { assert, tenant, type User } from './security.js';
import type { DB } from './helpers.js';
import {
  normalizeRows,
  canonical,
  stableJSON,
  byteSize,
  MAX_BATCH_BYTES,
  MAX_BATCH_ROWS,
  MAX_IMPORT_ROWS,
  type ImportRow,
  type ImportError,
} from './import-contract.js';
const digest = (data: unknown) => createHash('sha256').update(stableJSON(data)).digest('hex');
const startSchema = z.object({
  business_id: z.uuid(),
  file_hash: z.string().regex(/^[a-f0-9]{64}$/),
  mapping_hash: z.string().regex(/^[a-f0-9]{64}$/),
  filename: z.string().min(1).max(255),
  total_rows: z.number().int().min(1).max(MAX_IMPORT_ROWS),
  total_batches: z.number().int().min(1).max(1000),
});
async function getJob(db: DB, user: User, id: string, lock = false) {
  const job = (
    await db.query('SELECT * FROM product_import_jobs WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [
      id,
    ])
  ).rows[0];
  assert(job, 404, 'Aktarım bulunamadı.');
  tenant(user, job.business_id);
  return job;
}
export async function snapshot(db: DB, id: string) {
  const job = (
    await db.query(
      'SELECT j.*,b.name business_name FROM product_import_jobs j JOIN businesses b ON b.id=j.business_id WHERE j.id=$1',
      [id],
    )
  ).rows[0];
  const batches = (
    await db.query(
      'SELECT batch_no,row_count,status,errors,committed_at FROM product_import_batches WHERE job_id=$1 ORDER BY batch_no',
      [id],
    )
  ).rows;
  const validated = Number(
    (await db.query('SELECT count(*) n FROM product_import_rows WHERE job_id=$1', [id])).rows[0].n,
  );
  const inserted = batches
    .filter((b) => b.status === 'COMMITTED')
    .reduce((s, b) => s + b.row_count, 0);
  return {
    ...job,
    batches,
    validated,
    inserted,
    remaining: job.total_rows - inserted,
    failed: batches.filter((b) => b.status === 'FAILED').reduce((s, b) => s + b.row_count, 0),
    ready: validated === job.total_rows && batches.length === job.total_batches,
  };
}
export async function listImports(req: Request, res: Response) {
  const jobs = (
    await pool.query(
      'SELECT id FROM product_import_jobs WHERE ($1::boolean OR business_id=$2) ORDER BY created_at DESC LIMIT 30',
      [req.user.role === 'SUPER_ADMIN', req.user.business_id],
    )
  ).rows;
  res.json(await Promise.all(jobs.map((j) => snapshot(pool, j.id))));
}
export async function importStatus(req: Request, res: Response) {
  const id = z.uuid().parse(req.params.id);
  await getJob(pool, req.user, id);
  res.json(await snapshot(pool, id));
}
async function databaseDuplicates(
  db: DB,
  business: string,
  rows: ImportRow[],
): Promise<ImportError[]> {
  const existing = (
    await db.query(
      'SELECT sku,barcode,bedss_product_key(sku) sku_key,bedss_product_key(barcode) barcode_key FROM products WHERE business_id=$1 AND (bedss_product_key(sku)=ANY($2::text[]) OR bedss_product_key(barcode)=ANY($3::text[]))',
      [business, rows.map((r) => canonical(r.sku)), rows.map((r) => canonical(r.barcode))],
    )
  ).rows;
  const skus = new Set(existing.map((r) => r.sku_key)),
    barcodes = new Set(existing.map((r) => r.barcode_key));
  return rows.flatMap((r) =>
    ['sku', 'barcode']
      .filter((f) => (f === 'sku' ? skus : barcodes).has(canonical(String(r[f]))))
      .map((field) => ({
        row: r.source_row,
        field,
        type: 'DUPLICATE_DATABASE',
        message: `${field} işletmede zaten mevcut: ${r[field]}`,
      })),
  );
}
async function failedBatch(db: DB, id: string, batch: number, errors: ImportError[]) {
  await db.query(
    "UPDATE product_import_batches SET status='FAILED',errors=$3 WHERE job_id=$1 AND batch_no=$2 AND status<>'COMMITTED'",
    [id, batch, JSON.stringify(errors)],
  );
  await db.query(
    "UPDATE product_import_jobs SET status='FAILED',updated_at=now() WHERE id=$1 AND status<>'COMPLETED'",
    [id],
  );
}
export async function bulkProducts(req: Request, res: Response) {
  const mode = z.enum(['START', 'VALIDATE', 'COMMIT']).parse(req.body.mode);
  if (mode === 'START') {
    const b = startSchema.parse(req.body);
    tenant(req.user, b.business_id);
    const result = await transaction(async (db) => {
      assert(
        (await db.query('SELECT 1 FROM businesses WHERE id=$1', [b.business_id])).rowCount,
        400,
        'İşletme bulunamadı.',
      );
      const id = (
        await db.query(
          'INSERT INTO product_import_jobs(business_id,created_by,file_hash,mapping_hash,filename,total_rows,total_batches) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(business_id,file_hash,mapping_hash) DO UPDATE SET file_hash=EXCLUDED.file_hash RETURNING id,total_rows,total_batches',
          [
            b.business_id,
            req.user.id,
            b.file_hash,
            b.mapping_hash,
            b.filename,
            b.total_rows,
            b.total_batches,
          ],
        )
      ).rows[0];
      assert(
        id.total_rows === b.total_rows && id.total_batches === b.total_batches,
        409,
        'Aynı dosya kimliği farklı parti planıyla kullanılamaz.',
      );
      return snapshot(db, id.id);
    });
    res.json({ ok: true, job: result });
    return;
  }
  const b = z
    .object({
      job_id: z.uuid(),
      batch_no: z.number().int().min(1).max(1000),
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_BATCH_ROWS).optional(),
    })
    .parse(req.body);
  if (mode === 'VALIDATE') {
    assert(b.rows, 400, 'Doğrulanacak satırlar gerekli.');
    if (byteSize(req.body) > MAX_BATCH_BYTES) {
      res
        .status(413)
        .json({
          error: 'Parti en fazla 6 MB olabilir.',
          errors: [
            { row: 0, field: 'rows', type: 'PAYLOAD_TOO_LARGE', message: 'Partiyi küçültün.' },
          ],
        });
      return;
    }
    const contentHash = digest(b.rows),
      parsed = normalizeRows(b.rows);
    const result = await transaction(async (db) => {
      const job = await getJob(db, req.user, b.job_id, true);
      assert(b.batch_no <= job.total_batches, 400, 'Parti numarası geçersiz.');
      const previous = (
        await db.query('SELECT * FROM product_import_batches WHERE job_id=$1 AND batch_no=$2', [
          job.id,
          b.batch_no,
        ])
      ).rows[0];
      if (previous) {
        assert(
          previous.content_hash === contentHash,
          409,
          'Bu partinin içeriği değiştirilemez. Düzeltilmiş dosyayla yeni aktarım başlatın.',
        );
        if (previous.status === 'COMMITTED' || previous.status === 'VALIDATED')
          return { ok: true, errors: [], job: await snapshot(db, job.id) };
      }
      assert(job.status !== 'COMPLETED', 409, 'Aktarım zaten tamamlandı.');
      const otherCount = Number(
        (
          await db.query(
            'SELECT COALESCE(sum(row_count),0) n FROM product_import_batches WHERE job_id=$1 AND batch_no<>$2',
            [job.id, b.batch_no],
          )
        ).rows[0].n,
      );
      assert(
        otherCount + b.rows!.length <= job.total_rows,
        400,
        'Parti satırları toplam ürün sınırını aşıyor.',
      );
      const errors = [
        ...parsed.errors,
        ...(await databaseDuplicates(db, job.business_id, parsed.rows)),
      ];
      const others = (
        await db.query(
          'SELECT source_row,sku_key,barcode_key FROM product_import_rows WHERE job_id=$1 AND batch_no<>$2 AND (sku_key=ANY($3::text[]) OR barcode_key=ANY($4::text[]) OR source_row=ANY($5::int[]))',
          [
            job.id,
            b.batch_no,
            parsed.rows.map((r) => canonical(r.sku)),
            parsed.rows.map((r) => canonical(r.barcode)),
            parsed.rows.map((r) => r.source_row),
          ],
        )
      ).rows;
      const maps = {
        sku: new Map(others.map((r) => [r.sku_key, r.source_row])),
        barcode: new Map(others.map((r) => [r.barcode_key, r.source_row])),
        source_row: new Map(others.map((r) => [String(r.source_row), r.source_row])),
      };
      for (const row of parsed.rows)
        for (const field of ['sku', 'barcode', 'source_row'] as const) {
          const first = maps[field].get(canonical(String(row[field])));
          if (first !== undefined)
            errors.push({
              row: row.source_row,
              field,
              type: 'DUPLICATE_FILE',
              first_row: first,
              message: `Diğer partide tekrar; ilk Excel satırı ${first}.`,
            });
        }
      await db.query(
        'INSERT INTO product_import_batches(job_id,batch_no,content_hash,row_count,status,errors) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(job_id,batch_no) DO UPDATE SET status=EXCLUDED.status,errors=EXCLUDED.errors',
        [
          job.id,
          b.batch_no,
          contentHash,
          b.rows!.length,
          errors.length ? 'FAILED' : 'VALIDATED',
          JSON.stringify(errors),
        ],
      );
      if (!errors.length) {
        await db.query('DELETE FROM product_import_rows WHERE job_id=$1 AND batch_no=$2', [
          job.id,
          b.batch_no,
        ]);
        await db.query(
          "INSERT INTO product_import_rows(job_id,batch_no,source_row,sku_key,barcode_key,data) SELECT $1,$2,(r->>'source_row')::int,bedss_product_key(r->>'sku'),bedss_product_key(r->>'barcode'),r FROM jsonb_array_elements($3::jsonb) r",
          [job.id, b.batch_no, JSON.stringify(parsed.rows)],
        );
      }
      const state = await snapshot(db, job.id);
      await db.query('UPDATE product_import_jobs SET status=$2,updated_at=now() WHERE id=$1', [
        job.id,
        errors.length ? 'FAILED' : state.ready ? 'READY' : 'VALIDATING',
      ]);
      return { ok: !errors.length, errors, job: await snapshot(db, job.id) };
    });
    res
      .status(result.ok ? 200 : 422)
      .json({ ...result, error: result.ok ? undefined : 'Doğrulama hataları var.' });
    return;
  }
  // Commit stored, validated rows. The client cannot substitute different content at commit time.
  assert(b.rows === undefined, 400, 'COMMIT satır kabul etmez; doğrulanmış parti kaydedilir.');
  try {
    const result = await transaction(async (db) => {
      await db.query("SET LOCAL lock_timeout='10s'");
      await db.query("SET LOCAL statement_timeout='60s'");
      const job = await getJob(db, req.user, b.job_id, true);
      const batch = (
        await db.query('SELECT * FROM product_import_batches WHERE job_id=$1 AND batch_no=$2', [
          job.id,
          b.batch_no,
        ])
      ).rows[0];
      assert(batch, 400, 'Önce partiyi doğrulayın.');
      if (batch.status === 'COMMITTED')
        return { ok: true, replayed: true, job: await snapshot(db, job.id) };
      const state = await snapshot(db, job.id);
      assert(state.ready, 409, 'Tüm partiler doğrulanmadan COMMIT yapılamaz.');
      const rows = (
        await db.query(
          'SELECT data FROM product_import_rows WHERE job_id=$1 AND batch_no=$2 ORDER BY source_row',
          [job.id, b.batch_no],
        )
      ).rows.map((r) => r.data as ImportRow);
      assert(rows.length === batch.row_count, 409, 'Parti tam doğrulanmadı.');
      const errors = await databaseDuplicates(db, job.business_id, rows);
      if (errors.length) {
        await failedBatch(db, job.id, b.batch_no, errors);
        return { ok: false, errors, job: await snapshot(db, job.id) };
      }
      await db.query(
        `WITH input AS (
     SELECT data,source_row FROM product_import_rows WHERE job_id=$1 AND batch_no=$2
   ), inserted AS (
     INSERT INTO products(business_id,sku,barcode,name,category,subcategory,brand,model,variant,supplier,purchase_price,sale_price,vat,min_stock,max_stock,abc,custom_fields)
     SELECT $3,(data->>'sku'),(data->>'barcode'),(data->>'name'),(data->>'category'),(data->>'subcategory'),(data->>'brand'),(data->>'model'),(data->>'variant'),(data->>'supplier'),(data->>'purchase_price')::numeric,(data->>'sale_price')::numeric,(data->>'vat')::numeric,(data->>'min_stock')::numeric,(data->>'max_stock')::numeric,(data->>'abc'),data->'custom_fields' FROM input RETURNING id,sku,barcode
   ), units AS (
     INSERT INTO product_units(product_id,name,multiplier)
     SELECT p.id,v.name,v.multiplier FROM inserted p JOIN input i ON p.sku=i.data->>'sku'
     CROSS JOIN LATERAL (VALUES ('Adet',1::numeric),('Koli',(i.data->>'box_size')::numeric),('Palet',(i.data->>'pallet_size')::numeric)) v(name,multiplier)
   ) INSERT INTO audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
     SELECT $3,$4,'BULK_PRODUCT_CREATED','product',p.id::text,jsonb_build_object('import_id',$1::text,'batch_no',$2::int,'source_row',i.source_row,'sku',p.sku,'barcode',p.barcode) FROM inserted p JOIN input i ON p.sku=i.data->>'sku'`,
        [job.id, b.batch_no, job.business_id, req.user.id],
      );
      await db.query(
        "UPDATE product_import_batches SET status='COMMITTED',committed_at=now(),errors='[]' WHERE job_id=$1 AND batch_no=$2",
        [job.id, b.batch_no],
      );
      const after = await snapshot(db, job.id);
      await db.query('UPDATE product_import_jobs SET status=$2,updated_at=now() WHERE id=$1', [
        job.id,
        after.remaining === 0 ? 'COMPLETED' : 'IMPORTING',
      ]);
      return { ok: true, job: await snapshot(db, job.id) };
    });
    res
      .status(result.ok ? 200 : 409)
      .json({
        ...result,
        error: result.ok ? undefined : 'Parti kaydedilemedi. Önceki başarılı partiler korunuyor.',
      });
  } catch (e: any) {
    if (!['23505', '23514', '22003', '55P03', '57014', 'P0001', '40001', '40P01'].includes(e.code))
      throw e;
    const result = await transaction(async (db) => {
      const job = await getJob(db, req.user, b.job_id, true);
      const batch = (
        await db.query(
          'SELECT status FROM product_import_batches WHERE job_id=$1 AND batch_no=$2',
          [job.id, b.batch_no],
        )
      ).rows[0];
      if (batch?.status === 'COMMITTED')
        return { ok: true, job: await snapshot(db, job.id), errors: [] };
      const rows = (
        await db.query('SELECT data FROM product_import_rows WHERE job_id=$1 AND batch_no=$2', [
          job.id,
          b.batch_no,
        ])
      ).rows.map((r) => r.data as ImportRow);
      const duplicate = await databaseDuplicates(db, job.business_id, rows);
      const errors: ImportError[] = duplicate.length
        ? duplicate
        : [
            {
              row: rows[0]?.source_row || 0,
              field: 'batch',
              type: 'COMMIT_FAILED',
              message:
                'Parti geri alındı; başarılı partiler korunuyor. Durumu yenileyip tekrar deneyin.',
            },
          ];
      await failedBatch(db, job.id, b.batch_no, errors);
      return { ok: false, errors, job: await snapshot(db, job.id) };
    });
    res
      .status(result.ok ? 200 : 409)
      .json({
        ...result,
        error: result.ok ? undefined : 'Parti geri alındı. Güvenle devam edebilirsiniz.',
      });
  }
}
