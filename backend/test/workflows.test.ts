import { stockFixture } from './fixtures.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://bedss:bedss_local@127.0.0.1:55432/bedss_test';

assert.match(
  new URL(process.env.DATABASE_URL).pathname,
  /_test$/,
  'Workflow tests MUST use a database ending in _test',
);

const { app } = await import('../src/app.js');
const { pool, migrate } = await import('../src/database.js');
const { seed } = await import('../src/seed.js');

const admin = request.agent(app);
const owner = request.agent(app);
const other = request.agent(app);

const password = 'BedssDemo!2026';
const suffix = randomUUID().slice(0, 8);

let businessId: string;
let warehouseId: string;
let rack1Id: string;
let rack2Id: string;
let rack3Id: string;
let bufferId: string;
let quarantineId: string;
let productId: string;

async function stockById(id: string) {
  const result = await pool.query(
    `
      SELECT *
      FROM stocks
      WHERE id=$1
    `,
    [id],
  );

  assert.equal(result.rowCount, 1);

  return result.rows[0];
}

async function stockAt(
  locationId: string,
  lot = 'LOT-WF',
  serial = 'SER-WF',
) {
  const result = await pool.query(
    `
      SELECT *
      FROM stocks
      WHERE product_id=$1
        AND location_id=$2
        AND lot=$3
        AND serial=$4
    `,
    [productId, locationId, lot, serial],
  );

  assert.equal(result.rowCount, 1);

  return result.rows[0];
}

async function assertMovement(
  referenceType: string,
  referenceId: string,
  movementType: string,
) {
  const result = await pool.query(
    `
      SELECT *
      FROM stock_movements
      WHERE reference_type=$1
        AND reference_id=$2
        AND movement_type=$3
    `,
    [
      referenceType,
      referenceId,
      movementType,
    ],
  );

  assert.equal(
    result.rowCount,
    1,
    `Missing movement ${movementType} for ${referenceType}/${referenceId}`,
  );
}

async function assertAudit(
  action: string,
  entityId: string,
) {
  const result = await pool.query(
    `
      SELECT *
      FROM audit_logs
      WHERE action=$1
        AND entity_id=$2
    `,
    [action, entityId],
  );

  assert.equal(
    result.rowCount,
    1,
    `Missing audit ${action} for ${entityId}`,
  );
}

before(async () => {
  await migrate();
  await seed();

  await admin
    .post('/api/auth/login')
    .send({
      email: 'admin@bedss.local',
      password,
    })
    .expect(200);

  await other
    .post('/api/auth/login')
    .send({
      email: 'ege@bedss.local',
      password,
    })
    .expect(200);

  businessId = (
    await admin
      .post('/api/businesses')
      .send({
        name: 'Workflow Test ' + suffix,
        code: 'WF-' + suffix,
        tax_number:
          String(Date.now()).slice(-9) +
          String(Math.floor(Math.random() * 9)),
      })
      .expect(201)
  ).body.id;

  const pw = await bcrypt.hash(password, 4);

  const email =
    'workflow-owner-' +
    suffix +
    '@test.local';

  await pool.query(
    `
      INSERT INTO users(
        business_id,
        name,
        email,
        password_hash,
        role,
        status
      )
      VALUES(
        $1,
        'Workflow Owner',
        $2,
        $3,
        'OWNER',
        'ACTIVE'
      )
    `,
    [
      businessId,
      email,
      pw,
    ],
  );

  await owner
    .post('/api/auth/login')
    .send({
      email,
      password,
    })
    .expect(200);

  warehouseId = (
    await owner
      .post('/api/warehouses')
      .send({
        business_id: businessId,
        name: 'Workflow Warehouse', code: 'WF-WH-' + suffix,
      })
      .expect(201)
  ).body.id;

  const zoneId = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        name: 'Workflow Zone',
        kind: 'ZONE',
      })
      .expect(201)
  ).body.id;

  rack1Id = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        parent_id: zoneId,
        name: 'Workflow Rack 1',
        kind: 'RACK',
      })
      .expect(201)
  ).body.id;

  rack2Id = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        parent_id: zoneId,
        name: 'Workflow Rack 2',
        kind: 'RACK',
      })
      .expect(201)
  ).body.id;

  rack3Id = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        parent_id: zoneId,
        name: 'Workflow Rack 3',
        kind: 'RACK',
      })
      .expect(201)
  ).body.id;

  bufferId = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        name: 'Workflow Buffer',
        kind: 'BUFFER',
      })
      .expect(201)
  ).body.id;

  quarantineId = (
    await owner
      .post('/api/locations')
      .send({
        warehouse_id: warehouseId,
        name: 'Workflow Quarantine',
        kind: 'QUARANTINE',
      })
      .expect(201)
  ).body.id;

  productId = (
    await owner
      .post('/api/products')
      .send({
        business_id: businessId,
        sku: 'WF-SKU-' + suffix,
        barcode: 'WF-BAR-' + suffix,
        name: 'Workflow Product',
        purchase_price: 10,
      })
      .expect(201)
  ).body.id;
});

after(async () => {
  await pool.end();
});

test('Put-away mutates source and target, preserves lot/serial, logs movement and blocks overdraw', async () => {
  const source = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: bufferId,
        physical: 30,
        reserved: 5,
        damaged: 2,
        lot: 'LOT-WF',
        serial: 'SER-WF',
      })
  );

  const operation = (
    await owner
      .post('/api/put-away')
      .send({
        source_stock_id: source.id,
        destination_location_id: rack1Id,
        quantity: 10,
      })
      .expect(201)
  ).body;

  const sourceAfter = await stockById(source.id);
  const targetAfter = await stockAt(rack1Id);

  assert.equal(Number(sourceAfter.physical), 20);
  assert.equal(Number(targetAfter.physical), 10);
  assert.equal(targetAfter.lot, 'LOT-WF');
  assert.equal(targetAfter.serial, 'SER-WF');

  await assertMovement(
    'PUT_AWAY',
    operation.id,
    'PUTAWAY',
  );

  await assertAudit(
    'PUT_AWAY_COMPLETED',
    operation.id,
  );

  await owner
    .post('/api/put-away')
    .send({
      source_stock_id: source.id,
      destination_location_id: rack2Id,
      quantity: 14,
    })
    .expect(409);

  assert.equal(
    Number((await stockById(source.id)).physical),
    20,
  );
});

test('Internal transfer moves exact lot/serial and prevents concurrent overdraw', async () => {
  const source = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack3Id,
        physical: 30,
        lot: 'LOT-CONCURRENT',
        serial: 'SER-CONCURRENT',
      })
  );

  const responses = await Promise.all([
    owner
      .post('/api/internal-transfers')
      .send({
        source_stock_id: source.id,
        destination_location_id: rack1Id,
        quantity: 20,
      }),
    owner
      .post('/api/internal-transfers')
      .send({
        source_stock_id: source.id,
        destination_location_id: rack2Id,
        quantity: 20,
      }),
  ]);

  assert.deepEqual(
    responses.map((r) => r.status).sort(),
    [201, 409],
  );

  const success =
    responses.find((r) => r.status === 201)!;

  const failed =
    responses.find((r) => r.status === 409)!;

  assert.ok(success.body.id);
  assert.ok(failed.body);

  assert.equal(
    Number((await stockById(source.id)).physical),
    10,
  );

  await assertMovement(
    'INTERNAL_TRANSFER',
    success.body.id,
    'TRANSFER',
  );

  await assertAudit(
    'INTERNAL_TRANSFER_COMPLETED',
    success.body.id,
  );
});

test('Shipment decrements only available stock and records movement/audit', async () => {
  const source = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack2Id,
        physical: 40,
        reserved: 10,
        damaged: 5,
        lot: 'LOT-SHIP',
        serial: 'SER-SHIP',
      })
  );

  const shipment = (
    await owner
      .post('/api/shipments')
      .send({
        source_stock_id: source.id,
        quantity: 15,
        customer: 'Workflow Customer',
        document_number: 'WF-DOC-1',
        note: 'Mutation test',
      })
      .expect(201)
  ).body;

  assert.equal(
    Number((await stockById(source.id)).physical),
    25,
  );

  await assertMovement(
    'SHIPMENT',
    shipment.id,
    'SHIPMENT',
  );

  await assertAudit(
    'SHIPMENT_COMPLETED',
    shipment.id,
  );

  await owner
    .post('/api/shipments')
    .send({
      source_stock_id: source.id,
      quantity: 11,
      customer: 'Should Fail',
    })
    .expect(409);

  assert.equal(
    Number((await stockById(source.id)).physical),
    25,
  );
});

test('Damage moves stock into quarantine and loss removes stock', async () => {
  const damageSource = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack1Id,
        physical: 25,
        lot: 'LOT-DMG',
        serial: 'SER-DMG',
      })
  );

  const damage = (
    await owner
      .post('/api/incidents')
      .send({
        source_stock_id: damageSource.id,
        incident_type: 'DAMAGE',
        quantity: 10,
        quarantine_location_id: quarantineId,
        description: 'Damaged during mutation test',
      })
      .expect(201)
  ).body;

  assert.equal(
    Number(
      (await stockById(damageSource.id))
        .physical,
    ),
    15,
  );

  const quarantineStock =
    await stockAt(
      quarantineId,
      'LOT-DMG',
      'SER-DMG',
    );

  assert.equal(
    Number(quarantineStock.physical),
    10,
  );

  assert.equal(
    Number(quarantineStock.damaged),
    10,
  );

  await assertMovement(
    'STOCK_INCIDENT',
    damage.id,
    'DAMAGE',
  );

  await assertAudit(
    'STOCK_INCIDENT_RECORDED',
    damage.id,
  );

  const lossSource = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack3Id,
        physical: 12,
        lot: 'LOT-LOSS',
        serial: 'SER-LOSS',
      })
  );

  const loss = (
    await owner
      .post('/api/incidents')
      .send({
        source_stock_id: lossSource.id,
        incident_type: 'LOSS',
        quantity: 5,
        description: 'Lost stock mutation test',
      })
      .expect(201)
  ).body;

  assert.equal(
    Number((await stockById(lossSource.id)).physical),
    7,
  );

  await assertMovement(
    'STOCK_INCIDENT',
    loss.id,
    'ADJUSTMENT',
  );

  await assertAudit(
    'STOCK_INCIDENT_RECORDED',
    loss.id,
  );
});

test('Quarantine release/dispose/return mutates stock correctly', async () => {
  const q = await stockAt(
    quarantineId,
    'LOT-DMG',
    'SER-DMG',
  );

  const release = (
    await owner
      .post('/api/quarantine/actions')
      .send({
        source_stock_id: q.id,
        action_type: 'RELEASE',
        quantity: 4,
        destination_location_id: rack2Id,
        reason: 'Quality approved',
      })
      .expect(201)
  ).body;

  let qAfter = await stockById(q.id);

  assert.equal(Number(qAfter.physical), 6);
  assert.equal(Number(qAfter.damaged), 6);

  await assertMovement(
    'QUARANTINE_ACTION',
    release.action.id,
    'QUARANTINE',
  );

  await assertAudit(
    'QUARANTINE_ACTION_COMPLETED',
    release.action.id,
  );

  const releasedTarget =
    await stockAt(
      rack2Id,
      'LOT-DMG',
      'SER-DMG',
    );

  assert.equal(
    Number(releasedTarget.physical),
    4,
  );

  const dispose = (
    await owner
      .post('/api/quarantine/actions')
      .send({
        source_stock_id: q.id,
        action_type: 'DISPOSE',
        quantity: 2,
        reason: 'Unusable',
      })
      .expect(201)
  ).body;

  qAfter = await stockById(q.id);

  assert.equal(Number(qAfter.physical), 4);
  assert.equal(Number(qAfter.damaged), 4);

  await assertMovement(
    'QUARANTINE_ACTION',
    dispose.action.id,
    'ADJUSTMENT',
  );

  const returned = (
    await owner
      .post('/api/quarantine/actions')
      .send({
        source_stock_id: q.id,
        action_type: 'RETURN',
        quantity: 2,
        reason: 'Supplier return',
      })
      .expect(201)
  ).body;

  qAfter = await stockById(q.id);

  assert.equal(Number(qAfter.physical), 2);
  assert.equal(Number(qAfter.damaged), 2);

  await assertMovement(
    'QUARANTINE_ACTION',
    returned.action.id,
    'SHIPMENT',
  );

  await owner
    .post('/api/quarantine/actions')
    .send({
      source_stock_id: q.id,
      action_type: 'DISPOSE',
      quantity: 3,
      reason: 'Too much',
    })
    .expect(400);
});

test('Stock adjustment records before/after and blocks protected-stock overdraw', async () => {
  const source = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack1Id,
        physical: 20,
        reserved: 5,
        damaged: 3,
        lot: 'LOT-ADJ',
        serial: 'SER-ADJ',
      })
  );

  const increase = (
    await owner
      .post('/api/stock-adjustments')
      .send({
        stock_id: source.id,
        adjustment_type: 'INCREASE',
        quantity: 5,
        reason_code: 'PHYSICAL_CORRECTION',
        reason: 'Physical recount increase',
        note: 'Workflow mutation',
      })
      .expect(201)
  ).body;

  assert.equal(
    Number(increase.before_quantity),
    20,
  );

  assert.equal(
    Number(increase.after_quantity),
    25,
  );

  assert.equal(
    Number((await stockById(source.id)).physical),
    25,
  );

  await assertMovement(
    'STOCK_ADJUSTMENT',
    increase.id,
    'ADJUSTMENT',
  );

  await assertAudit(
    'STOCK_ADJUSTMENT_COMPLETED',
    increase.id,
  );

  await owner
    .post('/api/stock-adjustments')
    .send({
      stock_id: source.id,
      adjustment_type: 'DECREASE',
      quantity: 18,
      reason_code: 'PHYSICAL_CORRECTION',
      reason: 'Must fail because protected stock exists',
    })
    .expect(400);

  assert.equal(
    Number((await stockById(source.id)).physical),
    25,
  );

  const decrease = (
    await owner
      .post('/api/stock-adjustments')
      .send({
        stock_id: source.id,
        adjustment_type: 'DECREASE',
        quantity: 10,
        reason_code: 'PHYSICAL_CORRECTION',
        reason: 'Valid physical correction',
      })
      .expect(201)
  ).body;

  assert.equal(
    Number(decrease.before_quantity),
    25,
  );

  assert.equal(
    Number(decrease.after_quantity),
    15,
  );

  assert.equal(
    Number((await stockById(source.id)).physical),
    15,
  );

  await assertMovement(
    'STOCK_ADJUSTMENT',
    decrease.id,
    'ADJUSTMENT',
  );

  await assertAudit(
    'STOCK_ADJUSTMENT_COMPLETED',
    decrease.id,
  );
});

test('Tenant isolation blocks another business from workflow mutations', async () => {
  const source = (
    await stockFixture(pool, {
        product_id: productId,
        location_id: rack1Id,
        physical: 5,
        lot: 'LOT-TENANT',
        serial: 'SER-TENANT',
      })
  );

  await other
    .post('/api/shipments')
    .send({
      source_stock_id: source.id,
      quantity: 1,
    })
    .expect(403);

  await other
    .post('/api/internal-transfers')
    .send({
      source_stock_id: source.id,
      destination_location_id: rack2Id,
      quantity: 1,
    })
    .expect(403);

  await other
    .post('/api/stock-adjustments')
    .send({
      stock_id: source.id,
      adjustment_type: 'DECREASE',
      quantity: 1,
      reason_code: 'OTHER',
      reason: 'Illegal tenant mutation',
    })
    .expect(403);

  assert.equal(
    Number((await stockById(source.id)).physical),
    5,
  );
});
