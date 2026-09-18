import { stockFixture } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://bedss:bedss_local@127.0.0.1:55432/bedss_test';

if (!process.env.DATABASE_URL.endsWith('_test')) {
  throw new Error(
    'Count session tests require *_test database.',
  );
}

const { app } =
  await import('../src/app.js');

const { pool, migrate } =
  await import('../src/database.js');

const { seed } =
  await import('../src/seed.js');

await migrate();
await seed();


test(
  'count agreement, heartbeat, visibility and break lifecycle',
  async () => {

    const admin =
      request.agent(app);

    await admin
      .post('/api/auth/login')
      .send({
        email:
          'admin@bedss.local',

        password:
          'BedssDemo!2026',
      })
      .expect(200);


    const suffix =
      Date.now().toString();

    const business =
      (
        await admin
          .post('/api/businesses')
          .send({
            name:
              'Count Session ' +
              suffix,

            code: 'COUNT-' + suffix,
            tax_number:
              suffix.slice(-10),
          })
          .expect(201)
      ).body;


    const password =
      'CountSession!2026';

    const passwordHash =
      await bcrypt.hash(
        password,
        4,
      );


    const ownerUser =
      (
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
            'Owner',
            $2,
            $3,
            'OWNER',
            'ACTIVE'
          )
          RETURNING *
          `,
          [
            business.id,
            `owner-${suffix}@test.local`,
            passwordHash,
          ],
        )
      ).rows[0];


    const counterUser =
      (
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
            'Counter',
            $2,
            $3,
            'COUNTER',
            'ACTIVE'
          )
          RETURNING *
          `,
          [
            business.id,
            `counter-${suffix}@test.local`,
            passwordHash,
          ],
        )
      ).rows[0];


    const owner =
      request.agent(app);

    const counter =
      request.agent(app);


    await owner
      .post('/api/auth/login')
      .send({
        email:
          ownerUser.email,

        password,
      })
      .expect(200);


    await counter
      .post('/api/auth/login')
      .send({
        email:
          counterUser.email,

        password,
      })
      .expect(200);


    const warehouse =
      (
        await owner
          .post('/api/warehouses')
          .send({
            business_id:
              business.id,

            name:
              'Session Warehouse',
            code: 'COUNT-WH-' + suffix,
          })
          .expect(201)
      ).body;


    const zone =
      (
        await owner
          .post('/api/locations')
          .send({
            warehouse_id:
              warehouse.id,

            name:
              'Zone A',

            kind:
              'ZONE',
          })
          .expect(201)
      ).body;


        // 014 SESSION WAREHOUSE ASSIGNMENT
    // Bu test firmasindaki aktif COUNTER kullanicilarini
    // test deposuna bagla.
    await pool.query(
      `
      INSERT INTO user_warehouse_assignments(
        user_id,
        warehouse_id
      )
      SELECT
        u.id,
        $1
      FROM users u
      WHERE u.business_id=$2
        AND u.role='COUNTER'
        AND u.status='ACTIVE'
      ON CONFLICT DO NOTHING
      `,
      [warehouse.id, business.id],
    );
const location =
      (
        await owner
          .post('/api/locations')
          .send({
            warehouse_id:
              warehouse.id,

            parent_id:
              zone.id,

            name:
              'Rack A',

            kind:
              'RACK',
          })
          .expect(201)
      ).body;


    const product =
      (
        await owner
          .post('/api/products')
          .send({
            business_id:
              business.id,

            sku:
              `SESSION-SKU-${suffix}`,

            barcode:
              `SESSION-BAR-${suffix}`,

            name:
              'Session Test Product',
          })
          .expect(201)
      ).body;


    await stockFixture(pool, {
        product_id:
          product.id,

        location_id:
          location.id,

        physical:
          25,
      });

    const now =
      Date.now();

    const room =
      (
        await owner
          .post('/api/rooms')
          .send({
            warehouse_id:
              warehouse.id,

            name:
              'Session Room',

            count_type:
              'FULL',

            method:
              'INTERNAL',

            starts_at:
              new Date(
                now - 60000,
              ).toISOString(),

            ends_at:
              new Date(
                now + 3600000,
              ).toISOString(),

            stock_ids:
              [],
          })
          .expect(201)
      ).body;


    await owner
      .post(
        `/api/rooms/${room.id}/assignments`,
      )
      .send({
        user_id:
          counterUser.id,

        location_id:
          location.id,
      })
      .expect(200);


    await owner
      .post(
        `/api/rooms/${room.id}/open`,
      )
      .expect(200);


    await counter
      .post('/api/count/join')
      .send({
        code:
          room.code,
      })
      .expect(200);


    await owner
      .post(
        `/api/rooms/${room.id}/approve-person`,
      )
      .send({
        user_id:
          counterUser.id,
      })
      .expect(200);


    /*
     * Before agreement, counting operations blocked.
     */
    await counter
      .post('/api/count/location')
      .send({
        room_id:
          room.id,

        code:
          location.code,
      })
      .expect(403);


    await counter
      .post('/api/count/agreement')
      .send({
        room_id:
          room.id,

        accepted:
          true,
      })
      .expect(200);


    const hb =
      (
        await counter
          .post('/api/count/heartbeat')
          .send({
            room_id:
              room.id,

            visibility:
              'HIDDEN',
          })
          .expect(200)
      ).body;

    assert.equal(
      hb.visibility_state,
      'HIDDEN',
    );


    await counter
      .post('/api/count/break/start')
      .send({
        room_id:
          room.id,

        reason:
          'Kisa dinlenme molasi',
      })
      .expect(201);


    /*
     * During break, normal counting work is blocked.
     */
    await counter
      .post('/api/count/location')
      .send({
        room_id:
          room.id,

        code:
          location.code,
      })
      .expect(403);


    await counter
      .post('/api/count/break/end')
      .send({
        room_id:
          room.id,
      })
      .expect(200);


    await counter
      .post('/api/count/location')
      .send({
        room_id:
          room.id,

        code:
          location.code,
      })
      .expect(200);


    const live =
      (
        await owner
          .get(
            `/api/rooms/${room.id}/live-status`,
          )
          .expect(200)
      ).body;

    const row =
      live.find(
        (x: any) =>
          x.user_id ===
          counterUser.id,
      );

    assert.ok(
      row,
    );

    assert.equal(
      row.activity_status,
      'ACTIVE',
    );

    assert.equal(
      row.agreement_accepted_at != null,
      true,
    );

    assert.equal(
      row.last_heartbeat_at != null,
      true,
    );
  },
);


test.after(async () => {
  await pool.end();
});
