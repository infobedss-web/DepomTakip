import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { pool, transaction } from './database.js';
import {
  assert,
  type User,
} from './security.js';

import { audit } from './helpers.js';

export const licensing = Router();


async function licenseForBusiness(
  businessId: string,
) {
  const result = await pool.query(
    `
    SELECT
      bl.*,

      bl.plan_code,
      bl.max_warehouses,
      bl.max_users,

      b.name AS business_name,
      b.tax_number,

      (
        SELECT count(*)
        FROM warehouses w
        WHERE w.business_id = bl.business_id
      )::integer AS warehouse_count,

      (
        SELECT count(*)
        FROM users u
        WHERE u.business_id = bl.business_id
          AND u.status <> 'REJECTED'
      )::integer AS user_count,

      CASE
        WHEN bl.status = 'SUSPENDED'
          THEN 'SUSPENDED'

        WHEN bl.status = 'EXPIRED'
          THEN 'EXPIRED'

        WHEN bl.starts_at > now()
          THEN 'NOT_STARTED'

        WHEN bl.ends_at <= now()
          THEN 'EXPIRED'

        ELSE 'ACTIVE'
      END AS effective_status

    FROM business_licenses bl

    JOIN businesses b
      ON b.id = bl.business_id

    WHERE bl.business_id = $1
    `,
    [businessId],
  );

  return result.rows[0] || null;
}


export async function assertActiveLicense(
  user: User,
) {
  if (
    user.role === 'SUPER_ADMIN' ||
    !user.business_id
  ) {
    return null;
  }

  const license =
    await licenseForBusiness(
      user.business_id,
    );

  assert(
    license,
    403,
    'Firma lisansi bulunamadi.',
  );

  assert(
    license.effective_status === 'ACTIVE',
    403,
    license.effective_status === 'SUSPENDED'
      ? 'Firma lisansi askida.'
      : license.effective_status === 'EXPIRED'
        ? 'Firma lisansinin suresi dolmus.'
        : 'Firma lisansi aktif degil.',
  );

  return license;
}


export async function requireActiveLicense(
  req: any,
  _res: any,
  next: any,
) {
  try {
    await assertActiveLicense(
      req.user,
    );

    next();
  } catch (error) {
    next(error);
  }
}


licensing.get(
  '/license/me',
  async (req, res) => {
    if (
      req.user.role === 'SUPER_ADMIN' ||
      !req.user.business_id
    ) {
      res.json(null);
      return;
    }

    const license =
      await licenseForBusiness(
        req.user.business_id,
      );

    assert(
      license,
      404,
      'Firma lisansi bulunamadi.',
    );

    res.json(license);
  },
);


licensing.get(
  '/licenses',
  async (req, res) => {
    assert(
      req.user.role === 'SUPER_ADMIN',
      403,
      'Lisans listesi sadece sistem yetkilisine aittir.',
    );

    const result =
      await pool.query(
        `
        SELECT
          bl.*,

          bl.plan_code,
          bl.max_warehouses,
          bl.max_users,

          b.name AS business_name,
          b.tax_number,

          (
            SELECT count(*)
            FROM warehouses w
            WHERE w.business_id = bl.business_id
          )::integer AS warehouse_count,

          (
            SELECT count(*)
            FROM users u
            WHERE u.business_id = bl.business_id
              AND u.status <> 'REJECTED'
          )::integer AS user_count,

          CASE
            WHEN bl.status = 'SUSPENDED'
              THEN 'SUSPENDED'

            WHEN bl.status = 'EXPIRED'
              THEN 'EXPIRED'

            WHEN bl.starts_at > now()
              THEN 'NOT_STARTED'

            WHEN bl.ends_at <= now()
              THEN 'EXPIRED'

            ELSE 'ACTIVE'
          END AS effective_status

        FROM business_licenses bl

        JOIN businesses b
          ON b.id = bl.business_id

        ORDER BY b.name
        `,
      );

    res.json(result.rows);
  },
);


licensing.put(
  '/licenses/:businessId',
  async (req, res) => {
    assert(
      req.user.role === 'SUPER_ADMIN',
      403,
      'Lisans degisikligi sadece sistem yetkilisine aittir.',
    );

    const businessId =
      z.string()
        .uuid()
        .parse(
          req.params.businessId,
        );

    const body =
      z.object({
        plan_code:
          z.enum([
            'TRIAL',
            'BEGINNER',
            'PLUS',
            'PRO',
            'ENTERPRISE',
          ]),

        status:
          z.enum([
            'ACTIVE',
            'SUSPENDED',
            'EXPIRED',
          ]),

        starts_at:
          z.iso.datetime(),

        ends_at:
          z.iso.datetime(),

        max_warehouses:
          z.coerce
            .number()
            .int()
            .positive()
            .max(10000),

        max_users:
          z.coerce
            .number()
            .int()
            .positive()
            .max(1000000),

        note:
          z.string()
            .trim()
            .max(2000)
            .default(''),
      })
      .refine(
        (value) =>
          new Date(
            value.ends_at,
          ) >
          new Date(
            value.starts_at,
          ),
        {
          path: ['ends_at'],
          message:
            'Bitis tarihi baslangic tarihinden sonra olmalidir.',
        },
      )
      .parse(
        req.body,
      );


    const result =
      await transaction(
        async (db) => {

          const business =
            await db.query(
              `
              SELECT id
              FROM businesses
              WHERE id=$1
              `,
              [businessId],
            );

          assert(
            business.rowCount,
            404,
            'Firma bulunamadi.',
          );


          const license =
            (
              await db.query(
                `
                INSERT INTO business_licenses(
                  business_id,
                  plan_code,
                  status,
                  starts_at,
                  ends_at,
                  max_warehouses,
                  max_users,
                  note
                )

                VALUES(
                  $1,$2,$3,$4,$5,$6,$7,$8
                )

                ON CONFLICT(business_id)

                DO UPDATE SET
                  plan_code =
                    EXCLUDED.plan_code,

                  status =
                    EXCLUDED.status,

                  starts_at =
                    EXCLUDED.starts_at,

                  ends_at =
                    EXCLUDED.ends_at,

                  max_warehouses =
                    EXCLUDED.max_warehouses,

                  max_users =
                    EXCLUDED.max_users,

                  note =
                    EXCLUDED.note,

                  updated_at =
                    now()

                RETURNING
                  *,
                  plan_code,
                  max_warehouses,
                  max_users
                `,
                [
                  businessId,
                  body.plan_code,
                  body.status,
                  body.starts_at,
                  body.ends_at,
                  body.max_warehouses,
                  body.max_users,
                  body.note,
                ],
              )
            ).rows[0];


          await audit(
            db,
            req.user,
            'LICENSE_UPDATED',
            'business_license',
            license.id,
            businessId,
            {
              plan:
                body.plan_code,

              status:
                body.status,

              starts_at:
                body.starts_at,

              ends_at:
                body.ends_at,

              max_warehouses:
                body.max_warehouses,

              max_users:
                body.max_users,
            },
          );


          return license;
        },
      );


    res.json(result);
  },
);

/* BEDSS_LICENSE_KEY_ROUTE */
licensing.post(
  '/licenses/:businessId/key',
  async (req, res) => {
    assert(
      req.user.role === 'SUPER_ADMIN',
      403,
      'Lisans anahtari islemi sadece sistem yetkilisine aittir.',
    );

    const businessId = z.string().uuid().parse(req.params.businessId);
    const body = z
      .object({
        rotate: z.boolean().optional().default(false),
      })
      .parse(req.body ?? {});

    const result = await transaction(async (db) => {
      const current = (
        await db.query(
          `
          SELECT
            id,
            business_id,
            plan_code,
            status,
            license_key
          FROM business_licenses
          WHERE business_id=$1
          FOR UPDATE
          `,
          [businessId],
        )
      ).rows[0];

      assert(current, 404, 'Firma lisansi bulunamadi.');

      if (current.license_key && !body.rotate) {
        return current;
      }

      const groups =
        randomBytes(8)
          .toString('hex')
          .toUpperCase()
          .match(/.{1,4}/g) ?? [];

      const licenseKey =
        `BEDSS-${current.plan_code}-${groups.join('-')}`;

      const updated = (
        await db.query(
          `
          UPDATE business_licenses
          SET
            license_key=$1,
            updated_at=now()
          WHERE business_id=$2
          RETURNING *
          `,
          [licenseKey, businessId],
        )
      ).rows[0];

      await audit(
        db,
        req.user,
        body.rotate ? 'LICENSE_KEY_ROTATED' : 'LICENSE_KEY_ISSUED',
        'business_license',
        updated.id,
        businessId,
        {
          plan_code: updated.plan_code,
        },
      );

      return updated;
    });

    res.json(result);
  },
);
/* BEDSS_LICENSE_KEY_ROUTE_END */

