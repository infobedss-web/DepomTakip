import test from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://depomtakip:depomtakip_local@127.0.0.1:55432/depomtakip_test';

if (
  !process.env.DATABASE_URL.endsWith('_test')
) {
  throw new Error(
    'License test only runs on *_test database.',
  );
}

const { app } =
  await import('../src/app.js');

const {
  pool,
  migrate,
} =
  await import('../src/database.js');

const { seed } =
  await import('../src/seed.js');

await migrate();
await seed();


test(
  'license lifecycle and tenant blocking',
  async () => {

    const admin =
      request.agent(app);

    await admin
      .post('/api/auth/login')
      .send({
        email:
          'admin@depomtakip.local',

        password:
          'DepomTakip!2026',
      })
      .expect(200);


    const suffix =
      Date.now().toString();

    const tax =
      suffix
        .padStart(10, '0')
        .slice(-10);


    const business =
      (
        await admin
          .post('/api/businesses')
          .send({
            name:
              `License Test ${suffix}`,

            code: 'LICENSE-' + suffix,
            tax_number:
              tax,
          })
          .expect(201)
      ).body;


    const licenses =
      (
        await admin
          .get('/api/licenses')
          .expect(200)
      ).body;


    const license =
      licenses.find(
        (row: any) =>
          row.business_id ===
          business.id,
      );


    assert.ok(
      license,
      'Business license was not created.',
    );

    assert.equal(
      license.plan_code,
      'TRIAL',
    );

    assert.equal(
      license.effective_status,
      'ACTIVE',
    );


    const password =
      'LicenseOwner!2026';

    const passwordHash =
      await bcrypt.hash(
        password,
        4,
      );

    const email =
      `license-owner-${suffix}@test.local`;


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
        'License Owner',
        $2,
        $3,
        'OWNER',
        'ACTIVE'
      )
      `,
      [
        business.id,
        email,
        passwordHash,
      ],
    );


    const owner =
      request.agent(app);


    await owner
      .post('/api/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);


    const ownLicense =
      (
        await owner
          .get('/api/license/me')
          .expect(200)
      ).body;


    assert.equal(
      ownLicense.business_id,
      business.id,
    );


    await owner
      .get('/api/warehouses')
      .expect(200);


    const startsAt =
      new Date(
        Date.now() -
        60 * 60 * 1000,
      ).toISOString();


    const endsAt =
      new Date(
        Date.now() +
        30 *
        24 *
        60 *
        60 *
        1000,
      ).toISOString();


    await admin
      .put(
        `/api/licenses/${business.id}`,
      )
      .send({
        plan_code:
          'TRIAL',

        status:
          'SUSPENDED',

        starts_at:
          startsAt,

        ends_at:
          endsAt,

        max_warehouses:
          5,

        max_users:
          30,

        note:
          'Suspension test',
      })
      .expect(200);


    const suspended =
      (
        await owner
          .get('/api/license/me')
          .expect(200)
      ).body;


    assert.equal(
      suspended.effective_status,
      'SUSPENDED',
    );


    await owner
      .get('/api/warehouses')
      .expect(403);


    await admin
      .put(
        `/api/licenses/${business.id}`,
      )
      .send({
        plan_code:
          'TRIAL',

        status:
          'ACTIVE',

        starts_at:
          startsAt,

        ends_at:
          endsAt,

        max_warehouses:
          5,

        max_users:
          30,

        note:
          'Reactivated',
      })
      .expect(200);


    await owner
      .get('/api/warehouses')
      .expect(200);
  },
);


test.after(
  async () => {
    await pool.end();
  },
);
