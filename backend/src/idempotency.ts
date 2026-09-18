import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import { createHash } from 'node:crypto';

import { pool } from './database.js';

const SAFE_MUTATIONS = new Set([
  '/count/agreement',
  '/count/location',
  '/count/submit',
  '/count/offline-submit',
  '/count/incident',
  '/count/finish',
  '/count/break/start',
  '/count/break/end',
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function clientOperationGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (
      req.method !== 'POST' ||
      !SAFE_MUTATIONS.has(req.path)
    ) {
      next();
      return;
    }

    const raw =
      req.header('X-Client-Operation-Id');

    // Normal online requests still work without an idempotency key.
    if (!raw) {
      next();
      return;
    }

    if (!UUID.test(raw)) {
      res.status(400).json({
        error:
          'Client operation kimliği geçersiz.',
      });
      return;
    }

    const user = req.user;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');

    // Bir istemci çöktüğünde PROCESSING kaydı sonsuza kadar kilitli kalmasın.
    // Depo mutasyonları kısa sürdüğü için 5 dakikadan eski kayıtlar yeniden denenebilir.
    await pool.query(
      `
      UPDATE client_operations
      SET status='FAILED',
          error_message='Stale PROCESSING operation recovered.',
          updated_at=now()
      WHERE user_id=$1
        AND client_operation_id=$2
        AND status='PROCESSING'
        AND updated_at < now() - interval '5 minutes'
      `,
      [user.id, raw],
    );

    const inserted = await pool.query(
      `
      INSERT INTO client_operations(
        client_operation_id,
        user_id,
        business_id,
        method,
        path,
        request_hash,
        status
      )
      VALUES($1,$2,$3,$4,$5,$6,'PROCESSING')
      ON CONFLICT(user_id,client_operation_id)
      DO NOTHING
      RETURNING id
      `,
      [
        raw,
        user.id,
        user.business_id,
        req.method,
        req.path,
        requestHash,
      ],
    );

    if (!inserted.rowCount) {
      const existing = (
        await pool.query(
          `
          SELECT *
          FROM client_operations
          WHERE user_id=$1
            AND client_operation_id=$2
          `,
          [user.id, raw],
        )
      ).rows[0];

      if (
        existing?.method !== req.method ||
        existing?.path !== req.path ||
        (existing?.request_hash && existing.request_hash !== requestHash)
      ) {
        res.status(409).json({
          error:
            'Aynı işlem kimliği farklı bir istek veya içerikle kullanılamaz.',
        });
        return;
      }

      if (
        existing?.status === 'DONE'
      ) {
        res
          .status(
            Number(
              existing.response_status ||
                200,
            ),
          )
          .json(
            existing.response_body || {
              ok: true,
            },
          );

        return;
      }

      if (
        existing?.status === 'PROCESSING'
      ) {
        res.status(409).json({
          error:
            'Bu işlem sunucuda halen işleniyor.',
          client_operation_id: raw,
        });

        return;
      }

      // FAILED kayıt yeniden denenebilir.
      const retry = await pool.query(
        `
        UPDATE client_operations
        SET
          status='PROCESSING',
          error_message=NULL,
          request_hash=$3,
          updated_at=now()
        WHERE user_id=$1
          AND client_operation_id=$2
          AND status='FAILED'
        RETURNING id
        `,
        [user.id, raw, requestHash],
      );

      if (!retry.rowCount) {
        res.status(409).json({
          error:
            'İşlem yeniden başlatılamadı.',
        });
        return;
      }
    }

    const originalJson =
      res.json.bind(res);

    let captured = false;

    res.json = ((body: unknown) => {
      if (!captured) {
        captured = true;

        void pool
          .query(
            `
            UPDATE client_operations
            SET
              status='DONE',
              response_status=$3,
              response_body=$4::jsonb,
              error_message=NULL,
              updated_at=now()
            WHERE user_id=$1
              AND client_operation_id=$2
            `,
            [
              user.id,
              raw,
              res.statusCode,
              JSON.stringify(
                body ?? null,
              ),
            ],
          )
          .catch((error) => {
            console.error(
              'Idempotency response save failed:',
              error,
            );
          });
      }

      return originalJson(body);
    }) as typeof res.json;

    res.on('close', () => {
      if (
        !captured &&
        !res.writableFinished
      ) {
        void pool
          .query(
            `
            UPDATE client_operations
            SET
              status='FAILED',
              error_message='Connection closed before response.',
              updated_at=now()
            WHERE user_id=$1
              AND client_operation_id=$2
              AND status='PROCESSING'
            `,
            [user.id, raw],
          )
          .catch(() => {});
      }
    });

    next();
  } catch (error) {
    next(error);
  }
}