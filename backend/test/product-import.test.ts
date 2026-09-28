import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import * as XLSX from 'xlsx';
import {
  normalizeRows,
  splitBatches,
  canonical,
  decimal,
  MAX_BATCH_BYTES,
} from '../src/import-contract.js';
import {
  parseWorkbook,
  defaultMapping,
  mapSheet,
  identityCell,
  MAX_FILE_BYTES,
} from '../../web/src/product-import-data.js';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://depomtakip:depomtakip_local@127.0.0.1:55432/depomtakip_test';
assert.match(new URL(process.env.DATABASE_URL).pathname, /_test$/);
const { app } = await import('../src/app.js');
const { pool, migrate } = await import('../src/database.js');
const admin = request.agent(app),
  owner = request.agent(app),
  other = request.agent(app),
  guest = request.agent(app),
  counter = request.agent(app);
let business: string, foreign: string;
const prefix = randomUUID().slice(0, 8),
  password = 'DepomTakip!2026';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const row = (i: number, tag = prefix) => ({
  source_row: i + 2,
  sku: `${tag}-S${i}`,
  barcode: `${tag}-B${i}`,
  name: 'Ürün ' + i,
});
const metadata = (n: number, batches: number, id = randomUUID()) => ({
  mode: 'START',
  business_id: business,
  file_hash: digest(id),
  mapping_hash: digest('map'),
  filename: id + '.xlsx',
  total_rows: n,
  total_batches: batches,
});
const start = async (n: number, b = 1) =>
  (await owner.post('/api/products/bulk').send(metadata(n, b)).expect(200)).body.job;
const validate = (job: any, n: number, rows: unknown[]) =>
  owner.post('/api/products/bulk').send({ mode: 'VALIDATE', job_id: job.id, batch_no: n, rows });
const commit = (job: any, n: number) =>
  owner.post('/api/products/bulk').send({ mode: 'COMMIT', job_id: job.id, batch_no: n });
before(async () => {
  await migrate();
  business = (
    await pool.query('INSERT INTO businesses(name,tax_number) VALUES($1,$2) RETURNING id', [
      'Import ' + prefix,
      String(Date.now()).slice(-10),
    ])
  ).rows[0].id;
  foreign = (
    await pool.query('INSERT INTO businesses(name,tax_number) VALUES($1,$2) RETURNING id', [
      'Other ' + prefix,
      String(Date.now() + 1).slice(-10),
    ])
  ).rows[0].id;
  const pw = await bcrypt.hash(password, 4);
  for (const [role, agent, biz, name] of [
    ['SUPER_ADMIN', admin, null, 'admin'],
    ['OWNER', owner, business, 'owner'],
    ['OWNER', other, foreign, 'other'],
    ['GUEST', guest, business, 'guest'],
    ['COUNTER', counter, business, 'counter'],
  ] as const) {
    const email = `${name}-${prefix}@import.test`;
    await pool.query(
      "INSERT INTO users(business_id,name,email,password_hash,role,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",
      [biz, name, email, pw, role],
    );
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
  }
});
after(async () => {
  await pool.end();
});
test('Batch plans: 4999, 5000, 5001, 20000 and byte-sized splits', () => {
  for (const [size, expected] of [
    [4999, [4999]],
    [5000, [5000]],
    [5001, [5000, 1]],
    [20000, [5000, 5000, 5000, 5000]],
  ] as const)
    assert.deepEqual(
      splitBatches(Array.from({ length: size }, (_, i) => row(i))).map((b) => b.length),
      expected,
    );
  const bulky = Array.from({ length: 2000 }, (_, i) => ({
    ...row(i),
    custom_fields: { a: 'ü'.repeat(1900) },
  }));
  assert.ok(splitBatches(bulky).length > 1);
  for (const batch of splitBatches(bulky))
    assert.ok(Buffer.byteLength(JSON.stringify({ rows: batch })) + 512 < MAX_BATCH_BYTES);
});
test('Canonical duplicates at 4999/5000/5001 and ABC/abc', () => {
  for (const index of [4998, 4999, 5000]) {
    const rows = Array.from({ length: 5001 }, (_, i) => row(i));
    rows[index].sku = rows[0].sku.toLowerCase();
    const result = normalizeRows(rows);
    assert.ok(
      result.errors.some((e) => e.row === index + 2 && e.first_row === 2 && e.field === 'sku'),
    );
  }
  assert.equal(canonical(' ABC '), canonical('abc'));
  assert.equal(canonical('ÇĞİÖŞÜı'), canonical('çğiöşüi'));
});
test('Numeric formats, scale, units, custom-field limits', () => {
  for (const v of ['1.234,56', '1234,56', '1,234.56'])
    assert.equal(decimal(v, 2, 100000, 0), 1234.56);
  for (const v of ['1,234', '1.234', '1.23,45', '1e3', '1234.567'])
    assert.throws(() => decimal(v, 2, 100000, 0));
  for (const field of ['box_size', 'pallet_size'])
    assert.ok(normalizeRows([{ ...row(0), [field]: 0 }]).errors.some((e) => e.field === field));
  assert.ok(normalizeRows([{ ...row(0), purchase_price: 0.001 }]).errors.length);
  assert.ok(
    normalizeRows([{ ...row(0), custom_fields: JSON.parse('{"__proto__":"x"}') }]).errors.length,
  );
  assert.ok(normalizeRows([{ ...row(0), custom_fields: { x: 'a'.repeat(2001) } }]).errors.length);
  assert.ok(
    normalizeRows([
      {
        ...row(0),
        custom_fields: Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['x' + i, 'y'])),
      },
    ]).errors.length,
  );
  assert.ok(
    normalizeRows([
      {
        ...row(0),
        custom_fields: Object.fromEntries(
          Array.from({ length: 6 }, (_, i) => ['x' + i, 'ü'.repeat(1000)]),
        ),
      },
    ]).errors.length,
  );
});
const workbook = (
  values: unknown[][],
  bookType: 'xlsx' | 'xls' = 'xlsx',
  adjust?: (ws: XLSX.WorkSheet) => void,
) => {
  const ws = XLSX.utils.aoa_to_sheet(values);
  adjust?.(ws);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ürünler');
  return XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
};
test('XLSX/XLS/CSV preserve identity text, Turkish headers and real worksheet rows', () => {
  for (const ext of ['xlsx', 'xls'] as const) {
    const buffer = workbook(
      [
        ['Stok Kodu', 'Barkod', 'Ürün Adı', 'Alış Fiyatı'],
        ['001', '001234567890123456', 'Çay', '1.234,56'],
        [],
        ['002', '00002', 'Kahve', 1],
      ],
      ext,
    );
    const data = parseWorkbook(buffer, 'test.' + ext),
      result = mapSheet(data, defaultMapping(data.columns));
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0].barcode, '001234567890123456');
    assert.equal(result.rows[0].sku, '001');
    assert.equal(result.rows[1].source_row, 4);
    assert.equal(result.rows[0].purchase_price, 1234.56);
  }
  const csv = new TextEncoder().encode(
    'SKU;Barkod;Ürün Adı\n001;001234567890123456;Çay\n\n002;001234567890123456;Kahve',
  ).buffer;
  const data = parseWorkbook(csv, 'test.csv'),
    result = mapSheet(data, defaultMapping(data.columns));
  assert.ok(result.errors.some((e) => e.row === 4 && e.field === 'barcode'));
  assert.equal(identityCell({ value: 123, type: 'n', formatted: '000123' }), '000123');
  assert.throws(() => identityCell({ value: 1234567890123456, type: 'n' }));
  assert.throws(() => identityCell({ value: '123', type: 's', formula: true }));
  const unsafe = parseWorkbook(
    workbook([
      ['SKU', 'Barkod', 'Ürün Adı'],
      ['one', 1234567890123456, 'Ürün'],
    ]),
    'bad.xlsx',
  );
  assert.ok(
    mapSheet(unsafe, defaultMapping(unsafe.columns)).errors.some(
      (e) => e.type === 'IDENTITY_PRECISION',
    ),
  );
});
test('Duplicate and reserved headers stay distinct; duplicate target rejected; file limits', () => {
  const data = parseWorkbook(
    workbook([
      ['SKU', 'Barkod', 'Ürün Adı', 'Renk', 'Renk', '__proto__', 'constructor', 'prototype'],
      ['a', '0001', 'Ürün', 'mavi', 'sarı', 'x', 'y', 'z'],
    ]),
    'safe.xlsx',
  );
  const mapping = defaultMapping(data.columns),
    result = mapSheet(data, mapping);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].custom_fields.column_4_Renk, 'mavi');
  assert.equal(result.rows[0].custom_fields.column_5_Renk, 'sarı');
  assert.equal(result.rows[0].custom_fields.column_6___proto__, 'x');
  assert.equal(({} as any).polluted, undefined);
  assert.ok(
    mapSheet(data, { ...mapping, 'column-3': 'sku' }).errors.some((e) => e.type === 'MAPPING'),
  );
  assert.throws(() => parseWorkbook(new ArrayBuffer(MAX_FILE_BYTES + 1), 'large.xlsx'));
  assert.throws(() => parseWorkbook(new TextEncoder().encode('not excel').buffer, 'bad.xlsx'));
  assert.throws(() =>
    parseWorkbook(workbook([Array.from({ length: 65 }, () => 'x'), ['a']]), 'wide.xlsx'),
  );
  const wb = XLSX.utils.book_new();
  for (let i = 0; i < 11; i++)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['a']]), 'S' + i);
  assert.throws(() =>
    parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'many.xlsx'),
  );
  const collision = parseWorkbook(
    workbook([
      ['SKU', 'Barkod', 'Ürün Adı', 'Renk', 'Renk', 'column_4_Renk'],
      ['a', 'b', 'Ürün', 'one', 'two', 'three'],
    ]),
    'collision.xlsx',
  );
  const values = mapSheet(collision, defaultMapping(collision.columns));
  assert.deepEqual(Object.values(values.rows[0].custom_fields), ['one', 'two', 'three']);
  const tall = workbook(
    [
      ['SKU', 'Barkod', 'Ürün Adı'],
      ['a', 'b', 'Ürün'],
    ],
    'xlsx',
    (ws) => {
      ws['!ref'] = 'A1:C50002';
    },
  );
  assert.throws(() => parseWorkbook(tall, 'tall.xlsx'), /50.000/);
  const inflated = workbook([
    ['SKU', 'Barkod', 'Ürün Adı'],
    ['a', 'b', 'Ürün'],
  ]);
  const view = new DataView(inflated);
  for (let i = 0; i < inflated.byteLength - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 100 * 1024 * 1024, true);
      break;
    }
  assert.throws(() => parseWorkbook(inflated, 'bomb.xlsx'), /80 MB/);
});
test('VALIDATE enforces 5000 request rows and accepts 4999 without committing products', async () => {
  const job = await start(4999),
    rows = Array.from({ length: 4999 }, (_, i) => row(i, 'limit-' + prefix));
  const result = await validate(job, 1, rows).expect(200);
  assert.equal(result.body.job.validated, 4999);
  assert.equal(result.body.job.inserted, 0);
  await validate(job, 1, [...rows, row(4999), row(5000)]).expect(400);
  assert.deepEqual(
    (await pool.query('SELECT bedss_product_key($1) k', [' ABCÇĞİÖŞÜı '])).rows[0].k,
    canonical(' ABCÇĞİÖŞÜı '),
  );
});
test('Permissions, invalid business and tenant boundaries cover all import operations', async () => {
  await admin
    .post('/api/products/bulk')
    .send({ ...metadata(1, 1), business_id: randomUUID() })
    .expect(400);
  await owner
    .post('/api/products/bulk')
    .send({ ...metadata(1, 1), business_id: foreign })
    .expect(403);
  const job = await start(1);
  for (const agent of [guest, counter]) {
    await agent.post('/api/products/bulk').send(metadata(1, 1)).expect(403);
    await agent.get('/api/products/bulk/jobs').expect(403);
    await agent.get('/api/products/bulk/jobs/' + job.id).expect(403);
  }
  for (const mode of ['VALIDATE', 'COMMIT'])
    await other
      .post('/api/products/bulk')
      .send({ mode, job_id: job.id, batch_no: 1, rows: mode === 'VALIDATE' ? [row(0)] : undefined })
      .expect(403);
  await other.get('/api/products/bulk/jobs/' + job.id).expect(403);
  assert.ok(
    !(await other.get('/api/products/bulk/jobs').expect(200)).body.some(
      (j: any) => j.id === job.id,
    ),
  );
  await request(app).post('/api/products/bulk').send(metadata(1, 1)).expect(401);
});
test('20,000 rows: all staged before commit, bulk units/audit, same batch and file replay', async () => {
  const meta = metadata(20000, 4),
    job = (await owner.post('/api/products/bulk').send(meta).expect(200)).body.job;
  const rows = Array.from({ length: 20000 }, (_, i) => row(i, 'large-' + prefix));
  const batches = splitBatches(rows);
  for (let i = 0; i < 4; i++) {
    const response = await validate(job, i + 1, batches[i]).expect(200);
    assert.equal(response.body.job.validated, (i + 1) * 5000);
    if (i === 0) await commit(job, 1).expect(409);
  }
  for (let i = 1; i <= 4; i++) {
    const response = await commit(job, i).expect(200);
    assert.equal(response.body.job.inserted, i * 5000);
  }
  const replay = await commit(job, 1).expect(200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.job.status, 'COMPLETED');
  const same = await owner.post('/api/products/bulk').send(meta).expect(200);
  assert.equal(same.body.job.id, job.id);
  assert.equal(same.body.job.inserted, 20000);
  await validate(job, 1, batches[0]).expect(200);
  await validate(job, 1, [row(0, 'changed')]).expect(409);
  const counts = (
    await pool.query(
      "SELECT (SELECT count(*) FROM products WHERE business_id=$1 AND sku LIKE $2) products,(SELECT count(*) FROM product_units u JOIN products p ON p.id=u.product_id WHERE p.business_id=$1 AND p.sku LIKE $2) units,(SELECT count(*) FROM audit_logs WHERE details->>'import_id'=$3) audits",
      [business, 'large-' + prefix + '%', job.id],
    )
  ).rows[0];
  assert.deepEqual(counts, { products: '20000', units: '60000', audits: '20000' });
});
test('Cross-batch duplicate reports actual global source row; validation is all-or-none', async () => {
  const job = await start(5001, 2),
    rows = Array.from({ length: 5000 }, (_, i) => row(i, 'cross-' + prefix));
  await validate(job, 1, rows).expect(200);
  const bad = {
    ...row(5000, 'cross-' + prefix),
    source_row: 5010,
    sku: rows[4999].sku.toUpperCase(),
  };
  const response = await validate(job, 2, [bad]).expect(422);
  assert.ok(response.body.errors.some((e: any) => e.row === 5010 && e.first_row === 5001));
  assert.equal(response.body.job.inserted, 0);
  await commit(job, 1).expect(409);
});
test('First batch succeeds, second rolls back; reload/resume and simultaneous retries insert once', async () => {
  const tag = 'retry-' + prefix,
    job = await start(3, 2);
  const first = row(0, tag),
    second = row(1, tag),
    third = row(2, tag);
  await validate(job, 1, [first]).expect(200);
  await validate(job, 2, [second, third]).expect(200);
  await commit(job, 1).expect(200);
  // A race after validation causes batch 2 to fail without losing batch 1.
  const conflict = (
    await pool.query(
      'INSERT INTO products(business_id,sku,barcode,name) VALUES($1,$2,$3,$4) RETURNING id',
      [business, third.sku.toUpperCase(), third.barcode, 'Concurrent writer'],
    )
  ).rows[0].id;
  const failed = await commit(job, 2).expect(409);
  assert.equal(failed.body.job.inserted, 1);
  assert.equal(failed.body.job.remaining, 2);
  assert.equal(failed.body.job.failed, 2);
  assert.ok(failed.body.errors.some((e: any) => e.row === 4));
  assert.equal(
    (
      await pool.query('SELECT count(*) n FROM products WHERE business_id=$1 AND sku=$2', [
        business,
        second.sku,
      ])
    ).rows[0].n,
    '0',
  );
  const reloaded = (await owner.get('/api/products/bulk/jobs/' + job.id).expect(200)).body;
  assert.equal(reloaded.inserted, 1);
  assert.equal(reloaded.ready, true);
  await pool.query('DELETE FROM products WHERE id=$1', [conflict]);
  const retry = await Promise.all([commit(job, 2).expect(200), commit(job, 2).expect(200)]);
  assert.ok(retry.some((r) => r.body.replayed));
  assert.equal(retry[0].body.job.inserted, 3);
  assert.equal(
    (await pool.query("SELECT count(*) n FROM audit_logs WHERE details->>'import_id'=$1", [job.id]))
      .rows[0].n,
    '3',
  );
});
test('Database unique index blocks canonical race; payload and commit substitution rejected', async () => {
  const tag = 'race-' + prefix,
    a = await start(1),
    b = await start(1),
    item = row(0, tag);
  await validate(a, 1, [item]).expect(200);
  await validate(b, 1, [{ ...item, sku: item.sku.toUpperCase() }]).expect(200);
  const results = await Promise.all([commit(a, 1), commit(b, 1)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await pool.query(
        'SELECT count(*) n FROM products WHERE business_id=$1 AND bedss_product_key(sku)=bedss_product_key($2)',
        [business, item.sku],
      )
    ).rows[0].n,
    '1',
  );
  await commit(a, 1)
    .send({ mode: 'COMMIT', job_id: a.id, batch_no: 1, rows: [item] })
    .expect(400);
  const huge = await start(1);
  for (const bytes of [7 * 1024 * 1024, 9 * 1024 * 1024]) {
    const response = await validate(huge, 1, [
      { ...row(0), custom_fields: { x: 'a'.repeat(bytes) } },
    ]).expect(413);
    assert.equal(response.body.errors[0].type, 'PAYLOAD_TOO_LARGE');
  }
});
test('SQL failure rolls back products, units and audit together, then resumes', async () => {
  const job = await start(3, 2),
    tag = 'rollback-' + prefix;
  await validate(job, 1, [row(0, tag)]).expect(200);
  await validate(job, 2, [row(1, tag), row(2, tag)]).expect(200);
  await commit(job, 1).expect(200);
  const functionName = 'import_failure_' + prefix;
  await pool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details->>'import_id'='${job.id}' AND NEW.details->>'batch_no'='2' THEN RAISE EXCEPTION 'Injected test failure'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER ${functionName} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  );
  try {
    const response = await commit(job, 2).expect(409);
    assert.equal(response.body.job.inserted, 1);
    assert.equal(response.body.errors[0].type, 'COMMIT_FAILED');
    assert.equal(
      (
        await pool.query('SELECT count(*) n FROM products WHERE business_id=$1 AND sku LIKE $2', [
          business,
          tag + '%',
        ])
      ).rows[0].n,
      '1',
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*) n FROM product_units u JOIN products p ON p.id=u.product_id WHERE p.business_id=$1 AND p.sku LIKE $2',
          [business, tag + '%'],
        )
      ).rows[0].n,
      '3',
    );
  } finally {
    await pool.query(`DROP TRIGGER ${functionName} ON audit_logs`);
    await pool.query(`DROP FUNCTION ${functionName}()`);
  }
  const response = await commit(job, 2).expect(200);
  assert.equal(response.body.job.inserted, 3);
  assert.equal(response.body.job.status, 'COMPLETED');
});
test('Migration 019 is atomic and rejects existing canonical duplicates without data changes', async () => {
  const sql = await readFile(
    new URL('../../database/019_resumable_product_import.sql', import.meta.url),
    'utf8',
  );
  const schema = 'import_migration_' + prefix,
    db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET LOCAL search_path TO ${schema},public`);
    await db.query(
      'CREATE TABLE businesses(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE products(business_id uuid,sku text,barcode text);CREATE TABLE schema_versions(version int PRIMARY KEY)',
    );
    await db.query('INSERT INTO products VALUES($1,$2,$3),($1,$4,$5)', [
      business,
      'ABC',
      'one',
      'abc',
      'two',
    ]);
    await assert.rejects(() => db.query(sql), /Canonical SKU\/barcode duplicates/);
    await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT to_regnamespace($1) n', [schema])).rows[0].n, null);
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET LOCAL search_path TO ${schema},public`);
    await db.query(
      'CREATE TABLE businesses(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE products(business_id uuid,sku text,barcode text);CREATE TABLE schema_versions(version int PRIMARY KEY)',
    );
    await db.query(sql);
    assert.equal((await db.query('SELECT max(version) n FROM schema_versions')).rows[0].n, 19);
    await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT to_regnamespace($1) n', [schema])).rows[0].n, null);
    const publicVersion = Number(
      (await pool.query('SELECT max(version) n FROM public.schema_versions')).rows[0].n,
    );
    assert.ok(
      publicVersion >= 19,
      'Public schema must include migration 019 or newer.',
    );
  } finally {
    await db.query('ROLLBACK');
    db.release();
  }
});
