import { stockFixture } from './fixtures.js';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://bedss:bedss_local@127.0.0.1:55432/bedss_test';
assert.match(
  new URL(process.env.DATABASE_URL).pathname,
  /_test$/,
  'Test database name must end in _test',
);
const { app } = await import('../src/app.js');
const { pool, migrate } = await import('../src/database.js');
const { seed } = await import('../src/seed.js');
const admin = request.agent(app),
  owner = request.agent(app),
  counter = request.agent(app),
  counter2 = request.agent(app),
  auditor = request.agent(app),
  guest = request.agent(app),
  other = request.agent(app);
const suffix = randomUUID().slice(0, 8);
let business: string,
  warehouse: string,
  location: string,
  secondLocation: string,
  product: string,
  stock: string,
  room: string,
  uid: string,
  uid2: string;
const password = 'BedssDemo!2026';
before(async () => {
  await migrate();
  await seed();
  for (const [agent, email] of [
    [admin, 'admin'],
    [auditor, 'bilirkisi'],
    [other, 'ege'],
  ] as const)
    await agent
      .post('/api/auth/login')
      .send({ email: email + '@bedss.local', password })
      .expect(200);
  business = (
    await admin
      .post('/api/businesses')
      .send({ name: 'Test ' + suffix, code: 'INT-' + suffix, tax_number: String(Date.now()).slice(-10) })
      .expect(201)
  ).body.id;
  const pw = await bcrypt.hash(password, 4);
  for (const [role, agent, name] of [
    ['OWNER', owner, 'owner'],
    ['COUNTER', counter, 'counter'],
    ['COUNTER', counter2, 'counter2'],
    ['GUEST', guest, 'guest'],
  ] as const) {
    const email = name + suffix + '@test.local';
    const r = await pool.query(
      "INSERT INTO users(business_id,name,email,password_hash,role,status) VALUES($1,$2,$3,$4,$5,'ACTIVE') RETURNING id",
      [business, name, email, pw, role],
    );
    if (name === 'counter') uid = r.rows[0].id;
    if (name === 'counter2') uid2 = r.rows[0].id;
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
  }
});
after(async () => {
  await pool.end();
});
test('Authentication, isolation, and granular role boundaries', async () => {
  await request(app).get('/api/stocks').expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@bedss.local', password: 'wrong' })
    .expect(401);
  await counter.get('/api/stocks').expect(403);
  await counter.get('/api/products').expect(403);
  await counter.get('/api/dashboard').expect(403);
  await counter.get('/api/audit-logs').expect(403);
  await guest
    .post('/api/businesses')
    .send({ name: 'Illegal', tax_number: '1111111111' })
    .expect(403);
  await owner
    .post('/api/businesses')
    .send({ name: 'Illegal', tax_number: '1111111111' })
    .expect(403);
  await counter.post('/api/rooms').send({}).expect(403);
  const rows = (await owner.get('/api/businesses').expect(200)).body;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, business);
  await owner.post('/api/warehouses').set('Origin', 'https://evil.example').send({}).expect(403);
  await owner
    .put('/api/users/' + uid + '/permissions')
    .send({ permissions: ['rapor_izle'] })
    .expect(403);
  await admin
    .put('/api/users/' + uid + '/permissions')
    .send({ permissions: ['rapor_izle'] })
    .expect(400);
});
test('Warehouse hierarchy, products, units, stock and tenant validation', async () => {
  warehouse = (
    await owner
      .post('/api/warehouses')
      .send({ business_id: business, name: 'Test Warehouse', code: 'INT-WH-' + suffix })
      .expect(201)
  ).body.id;

  // 014 TEST WAREHOUSE ASSIGNMENTS
  for (const userId of [uid, uid2]) {
    await pool.query(
      `
      INSERT INTO user_warehouse_assignments(
        user_id,
        warehouse_id
      )
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
      `,
      [userId, warehouse],
    );
  }

  const zone = (
    await owner
      .post('/api/locations')
      .send({ warehouse_id: warehouse, name: 'Zone', kind: 'ZONE' })
      .expect(201)
  ).body.id;
  location = (
    await owner
      .post('/api/locations')
      .send({ warehouse_id: warehouse, parent_id: zone, name: 'Rack 1', kind: 'RACK' })
      .expect(201)
  ).body.id;
  secondLocation = (
    await owner
      .post('/api/locations')
      .send({ warehouse_id: warehouse, parent_id: zone, name: 'Rack 2', kind: 'RACK' })
      .expect(201)
  ).body.id;
  await owner
    .post('/api/locations')
    .send({ warehouse_id: warehouse, parent_id: zone, name: 'Invalid bin', kind: 'BIN' })
    .expect(400);
  await other
    .post('/api/locations')
    .send({ warehouse_id: warehouse, name: 'Forbidden', kind: 'ZONE' })
    .expect(403);
  product = (
    await owner
      .post('/api/products')
      .send({
        business_id: business,
        sku: 'SKU-' + suffix,
        barcode: 'BAR-' + suffix,
        name: 'Test Product',
        purchase_price: 10,
        box_size: 12,
      })
      .expect(201)
  ).body.id;
  stock = (
    await stockFixture(pool, { product_id: product, location_id: location, physical: 30 })
  ).id;
  await owner
    .post('/api/stocks')
    .send({ product_id: product, location_id: location, physical: 1 })
    .expect(405);
  await owner
    .patch('/api/stocks/' + stock)
    .send({ physical: -1, reason: 'Invalid negative stock' })
    .expect(400);
  await assert.rejects(
    stockFixture(pool, { product_id: product, location_id: location, physical: 10, reserved: 11, lot: 'invalid' }),
    (error: any) => error.code === '23514',
  );
  const foreignLoc = (await other.get('/api/warehouses')).body[0];
  const fl = (
    await other
      .post('/api/locations')
      .send({ warehouse_id: foreignLoc.id, name: 'Foreign ' + suffix, kind: 'ZONE' })
  ).body.id;
  await owner
    .get('/api/locations/' + fl + '/qr')
    .expect(403);
  await other
    .patch('/api/stocks/' + stock)
    .send({ physical: 100, reason: 'Unauthorized' })
    .expect(403);
  const units = (await owner.get('/api/products')).body.find((p: any) => p.id === product).units;
  assert.equal(Number(units.find((u: any) => u.name === 'Koli').multiplier), 12);
  assert.match(
    (await owner.get('/api/locations/' + location + '/qr')).body.image,
    /^data:image\/png/,
  );
});
test('Room assignment, opening, joining and explicit owner approval', async () => {
  const dates = {
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 86400000).toISOString(),
  };
  room = (
    await owner
      .post('/api/rooms')
      .send({
        warehouse_id: warehouse,
        name: 'Test room ' + suffix,
        count_type: 'FULL',
        method: 'HYBRID',
        ...dates,
      })
      .expect(201)
  ).body.id;
  await other.get('/api/rooms/' + room).expect(403);
  await counter.get('/api/rooms/' + room).expect(403);
  await owner.post('/api/rooms/' + room + '/open').expect(400);
  for (const u of [uid, uid2])
    await owner
      .post('/api/rooms/' + room + '/assignments')
      .send({ user_id: u, location_id: location })
      .expect(200);
  const aid = (await auditor.get('/api/auth/me')).body.user.id;
  await owner
    .post('/api/rooms/' + room + '/assignments')
    .send({ user_id: aid, location_id: location })
    .expect(403);
  await admin
    .post('/api/rooms/' + room + '/assignments')
    .send({ user_id: aid, location_id: location })
    .expect(200);
  const r = (await owner.get('/api/rooms/' + room)).body;
  await counter.post('/api/count/join').send({ code: r.code }).expect(409);
  await owner.post('/api/rooms/' + room + '/open').expect(200);
  await owner.get('/api/rooms/' + room + '/report').expect(409);
  await owner
    .post('/api/rooms/' + room + '/approve-person')
    .send({ user_id: uid })
    .expect(400);
  for (const c of [counter, counter2])
    await c.post('/api/count/join').send({ code: r.code }).expect(200);
  const code = (await owner.get('/api/locations/' + location + '/qr')).body.code;
  await counter.post('/api/count/location').send({ room_id: room, code }).expect(403);
  for (const u of [uid, uid2])
    await owner
      .post('/api/rooms/' + room + '/approve-person')
      .send({ user_id: u })
      .expect(200);

  for (const c of [counter, counter2])
    await c
      .post('/api/count/agreement')
      .send({
        room_id: room,
        accepted: true,
      })
      .expect(200);

  for (const c of [counter, counter2])
    await c.post('/api/count/location').send({ room_id: room, code }).expect(200);
  const wrongCode = (await owner.get('/api/locations/' + secondLocation + '/qr')).body.code;
  await counter.post('/api/count/location').send({ room_id: room, code: wrongCode }).expect(403);
  assert.equal(
    (await counter.get('/api/rooms').expect(200)).body.some((r: any) => r.id === room),
    true,
  );
  await owner
    .patch('/api/stocks/' + stock)
    .send({ physical: 40, reason: 'Active count test' })
    .expect(409);
});
test('Concurrent product locking, blind projection, unit conversion, and duplicate protection', async () => {
  const responses = await Promise.all(
    [counter, counter2].map((c) =>
      c.post('/api/count/scan').send({ room_id: room, barcode: 'BAR-' + suffix }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const winner = responses[0].status === 200 ? counter : counter2,
    loser = winner === counter ? counter2 : counter;
  const body = responses.find((r) => r.status === 200)!.body;
  for (const key of [
    'expected',
    'physical',
    'reserved',
    'purchase_price',
    'sale_price',
    'difference',
    'unit_cost',
  ])
    assert.equal(key in body, false);
  assert.equal(body.name, 'Test Product');
  await loser
    .post('/api/count/submit')
    .send({ room_id: room, stock_id: stock, quantity: 24, unit: 'Adet', condition: 'NORMAL' })
    .expect(409);
  const code = (await owner.get('/api/locations/' + location + '/qr')).body.code;
  await winner.post('/api/count/location').send({ room_id: room, code }).expect(409);
  await winner
    .post('/api/count/submit')
    .send({ room_id: room, stock_id: stock, quantity: -1, unit: 'Adet', condition: 'NORMAL' })
    .expect(400);
  const saved = (
    await winner
      .post('/api/count/submit')
      .send({
        room_id: room,
        stock_id: stock,
        quantity: 2,
        unit: 'Koli',
        condition: 'NORMAL',
        note: 'Two boxes',
      })
      .expect(201)
  ).body;
  assert.equal(Number(saved.base_quantity), 24);
  await winner
    .post('/api/count/submit')
    .send({ room_id: room, stock_id: stock, quantity: 2, unit: 'Koli', condition: 'NORMAL' })
    .expect(409);
  await loser
    .post('/api/count/scan')
    .send({ room_id: room, barcode: 'BAR-' + suffix })
    .expect(409);
  await counter.get('/api/rooms/' + room + '/report').expect(403);
  const p = (await winner.get('/api/count/progress/' + room)).body;
  assert.equal(p.entries.length, 1);
  assert.equal(JSON.stringify(p).includes('expected'), false);
  await winner
    .post('/api/count/incident')
    .send({ room_id: room, kind: 'DAMAGE', note: 'Test incident' })
    .expect(201);
  await winner.post('/api/count/finish').send({ room_id: room }).expect(200);
  await winner
    .post('/api/count/scan')
    .send({ room_id: room, barcode: 'BAR-' + suffix })
    .expect(403);
});
test('Completion, difference report, correction, stock approval and immutable audit trail', async () => {
  await owner.post('/api/rooms/' + room + '/complete').expect(200);
  let report = (await owner.get('/api/rooms/' + room + '/report').expect(200)).body;
  assert.equal(Number(report.rows[0].difference), -6);
  assert.equal(Number(report.rows[0].value_difference), -60);
  assert.equal(report.incidents.length, 1);
  await guest.get('/api/rooms/' + room + '/report').expect(200);
  await guest
    .post('/api/rooms/' + room + '/review')
    .send({ action: 'APPROVE', reason: 'guest' })
    .expect(403);
  await owner
    .patch('/api/rooms/' + room + '/entries/' + report.rows[0].entry_id)
    .send({ quantity: 25, reason: 'Verified recount' })
    .expect(200);
  await owner
    .post('/api/rooms/' + room + '/review')
    .send({ action: 'APPROVE', reason: 'Reviewed and approved' })
    .expect(200);
  await owner
    .post('/api/rooms/' + room + '/review')
    .send({ action: 'APPROVE', reason: 'Duplicate approval' })
    .expect(409);
  const row = (await owner.get('/api/stocks')).body.find((s: any) => s.id === stock);
  assert.equal(Number(row.physical), 25);
  assert.ok(row.last_count_at);
  const logs = (await owner.get('/api/audit-logs')).body;
  assert.ok(logs.some((l: any) => l.action === 'ROOM_APPROVED'));
  assert.ok(
    logs.some((l: any) => l.action === 'COUNT_CORRECTED' && Number(l.details.before) === 24),
  );
  assert.ok(logs.every((l: any) => l.business_id === business));
});
test('Invitation OTP, document-free activation and replay prevention', async () => {
  const email = 'invite' + suffix + '@test.local';
  const i = (
    await owner
      .post('/api/invitations')
      .send({ name: 'Invited Counter', email, role: 'COUNTER', business_id: business })
      .expect(201)
  ).body;
  const token = new URL(i.invite_url, 'http://localhost').searchParams.get('invite');
  await request(app).post('/api/auth/login').send({ email, password }).expect(401);
  await request(app).post('/api/auth/verify').send({ token, otp: '000000' }).expect(400);
  await request(app).post('/api/auth/verify').send({ token, otp: i.otp }).expect(200);
  await request(app).post('/api/auth/verify').send({ token, otp: i.otp }).expect(400);
  await request(app)
    .post('/api/auth/complete')
    .field('token', token!)
    .field('password', password)
    .expect(200);
  await owner
    .post('/api/users/' + i.id + '/review')
    .send({ approve: true })
    .expect(403);
  await admin
    .post('/api/users/' + i.id + '/review')
    .send({ approve: true })
    .expect(409);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  await agent.get('/api/stocks').expect(403);
  await request(app)
    .post('/api/auth/complete')
    .field('token', token!)
    .field('password', password)
    .expect(400);
  await agent.post('/api/auth/logout').expect(200);
  await agent.get('/api/auth/me').expect(401);
});
test('Permission overrides apply to already authenticated sessions', async () => {
  const id = (await owner.get('/api/auth/me')).body.user.id;
  await admin
    .put('/api/users/' + id + '/permissions')
    .send({ permissions: [], denied_permissions: ['stok_duzelt'] })
    .expect(200);
  await owner
    .patch('/api/stocks/' + stock)
    .send({ physical: 30, reason: 'Denied override test' })
    .expect(403);
  const me = (await owner.get('/api/auth/me')).body.user;
  assert.equal(me.permissions.includes('stok_duzelt'), false);
  await admin
    .put('/api/users/' + id + '/permissions')
    .send({ permissions: [], denied_permissions: [] })
    .expect(200);
  assert.equal(
    (await owner.get('/api/auth/me')).body.user.permissions.includes('stok_duzelt'),
    true,
  );
});
test('Rack descendants, cross-bin product locks, private photos, and rejection without stock mutation', async () => {
  const floor = (
    await owner
      .post('/api/locations')
      .send({ warehouse_id: warehouse, parent_id: secondLocation, name: 'Floor', kind: 'FLOOR' })
      .expect(201)
  ).body.id;
  const bins = [];
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const bin = (
      await owner
        .post('/api/locations')
        .send({ warehouse_id: warehouse, parent_id: floor, name: 'Bin ' + i, kind: 'BIN' })
        .expect(201)
    ).body;
    bins.push(bin);
    ids.push(
      (
        await stockFixture(pool, { product_id: product, location_id: bin.id, physical: 10, lot: 'LOT-' + i })
      ).id,
    );
  }
  const r = (
    await owner
      .post('/api/rooms')
      .send({
        warehouse_id: warehouse,
        name: 'Bin count ' + suffix,
        count_type: 'PARTIAL',
        method: 'INTERNAL',
        starts_at: new Date(Date.now() - 60000).toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        stock_ids: ids,
      })
      .expect(201)
  ).body;
  for (const id of [uid, uid2])
    await owner
      .post('/api/rooms/' + r.id + '/assignments')
      .send({ user_id: id, location_id: secondLocation })
      .expect(200);
  await owner.post('/api/rooms/' + r.id + '/open').expect(200);
  const code = (await owner.get('/api/locations/' + secondLocation + '/qr')).body.code;
  for (const [agent, id] of [
    [counter, uid],
    [counter2, uid2],
  ] as const) {
    await agent.post('/api/count/join').send({ code: r.code }).expect(200);

    await owner
      .post('/api/rooms/' + r.id + '/approve-person')
      .send({ user_id: id })
      .expect(200);

    await agent
      .post('/api/count/agreement')
      .send({
        room_id: r.id,
        accepted: true,
      })
      .expect(200);

    await agent.post('/api/count/location').send({ room_id: r.id, code }).expect(200);
  }
  await owner.post('/api/rooms/' + r.id + '/complete').expect(409);
  await counter
    .post('/api/count/scan')
    .send({ room_id: r.id, barcode: 'BAR-' + suffix })
    .expect(400);
  await counter
    .post('/api/count/scan')
    .send({ room_id: r.id, barcode: 'BAR-' + suffix, lot: 'LOT-0' })
    .expect(200);
  await counter2
    .post('/api/count/scan')
    .send({ room_id: r.id, barcode: 'BAR-' + suffix, lot: 'LOT-1' })
    .expect(409);
  const photo = (
    await counter
      .post('/api/photos')
      .attach(
        'photo',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1f8AAAAASUVORK5CYII=',
          'base64',
        ),
        { filename: 'photo.png', contentType: 'image/png' },
      )
      .expect(201)
  ).body.id;
  await other.get('/api/documents/' + photo).expect(403);
  await counter
    .post('/api/count/submit')
    .send({
      room_id: r.id,
      stock_id: ids[0],
      quantity: 9,
      unit: 'Adet',
      condition: 'DAMAGED',
      photo_id: photo,
    })
    .expect(201);
  await owner.get('/api/documents/' + photo).expect(200);
  await counter2
    .post('/api/count/scan')
    .send({ room_id: r.id, barcode: 'BAR-' + suffix, location_code: bins[1].code })
    .expect(200);
  await counter2
    .post('/api/count/submit')
    .send({ room_id: r.id, stock_id: ids[1], quantity: 8, unit: 'Adet', condition: 'NORMAL' })
    .expect(201);
  await owner.post('/api/rooms/' + r.id + '/complete').expect(200);
  await owner
    .post('/api/rooms/' + r.id + '/review')
    .send({ action: 'REJECT', reason: 'Recount required' })
    .expect(200);
  const stocks = (await owner.get('/api/stocks')).body;
  for (const id of ids) assert.equal(Number(stocks.find((s: any) => s.id === id).physical), 10);
});
test('OTP stops after five wrong attempts', async () => {
  const i = (
    await owner
      .post('/api/invitations')
      .send({
        name: 'Locked invite',
        email: 'locked' + suffix + '@test.local',
        role: 'COUNTER',
        business_id: business,
      })
      .expect(201)
  ).body;
  const token = new URL(i.invite_url, 'http://localhost').searchParams.get('invite');
  for (let i = 0; i < 5; i++)
    await request(app).post('/api/auth/verify').send({ token, otp: '000000' }).expect(400);
  await request(app).post('/api/auth/verify').send({ token, otp: i.otp }).expect(400);
});
